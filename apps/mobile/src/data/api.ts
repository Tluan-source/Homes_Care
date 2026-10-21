/**
 * Lớp gọi Supabase — CHỖ DUY NHẤT màn hình lấy và ghi dữ liệu.
 *
 * Phân quyền nằm ở database (RLS): chủ nhà A không bao giờ nhận được hàng của chủ B,
 * quản lý chỉ nhận căn của tòa mình phụ trách — dù app có gọi gì đi nữa.
 */
import {
  computeMoneyState, computeUnitState, daysBetween, invoiceKey, parseDay,
  type Contract, type Extension, type Invoice, type Room, type Unit,
} from '@homescare/core';
import { supabase } from '../lib/supabase';
import type {
  Bundle, ContractVM, ExceptionVM, OccupantVM, OpenRequestVM, TowerVM, UnitVM, ZoneVM,
} from './model';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PostgREST trả tối đa ~1000 hàng mỗi lần — 200 căn × 24 kỳ là vượt. Lấy theo trang. */
async function fetchAll<T = any>(table: string, cols: string, apply?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(cols).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

const n = (v: unknown) => Number(v ?? 0);

/* ------------------------------------------------------------------ đọc */

export async function loadBundle(today: Date): Promise<Bundle> {
  const [zones, towers, units, rooms, contracts, cRooms, occupants, periods, exts, requests, exc] =
    await Promise.all([
      fetchAll('zones', 'id, code, name'),
      fetchAll('towers', 'id, zone_id, code, no, name'),
      fetchAll('units', 'id, tower_id, floor, unit_no, code, bedrooms, bathrooms, area_m2, service_fee, maintenance, maintenance_note'),
      fetchAll('rooms', 'id, unit_id, name, capacity, rent, sort'),
      fetchAll('contracts', 'id, unit_id, code, status, rent, service_fee, cycle_months, deposit_months, move_in, ends_on, pay_mode, renewed_from_id',
        q => q.eq('status', 'ACTIVE')),
      fetchAll('contract_rooms', 'contract_id, room_id, mode, slots_held'),
      fetchAll('occupants', 'id, contract_id, room_id, full_name, is_primary, phone, id_number, id_issued_on, id_issued_by, address, dob, id_front_path, id_back_path'),
      fetchAll('payment_periods', 'id, contract_id, type, due_on, period_from, period_to, amount_due, amount_paid, status',
        q => q.order('due_on')),
      fetchAll('payment_extensions', 'id, contract_id, status, original_due, new_due, reason, requested_at, decided_at',
        q => q.in('status', ['PENDING', 'APPROVED'])),
      fetchAll('payment_requests', 'id, contract_id, doc_no, code, amount, status, sent_at, created_at, payment_request_lines(period_id)',
        q => q.in('status', ['DRAFT', 'SENT'])),
      fetchAll('bank_tx_exceptions', '*', q => q.order('occurred_at', { ascending: false })),
    ]);

  const zoneVMs: ZoneVM[] = zones.map(z => ({ id: z.id, code: z.code, name: z.name }));
  const towerVMs: TowerVM[] = towers.map(t => ({ id: t.id, zoneId: t.zone_id, code: t.code, no: t.no, name: t.name }));
  const zoneById = new Map(zoneVMs.map(z => [z.id, z]));
  const towerById = new Map(towerVMs.map(t => [t.id, t]));

  const roomsByUnit = group(rooms, r => r.unit_id);
  const crByContract = group(cRooms, r => r.contract_id);
  const occByContract = group(occupants, o => o.contract_id);
  const periodsByContract = group(periods, p => p.contract_id);
  const extByContract = group(exts, e => e.contract_id);
  const reqByContract = new Map<string, any>();
  for (const r of requests) {
    // Một hợp đồng một phiếu đang mở; lỡ có hai thì lấy phiếu mới nhất.
    const cur = reqByContract.get(r.contract_id);
    if (!cur || r.created_at > cur.created_at) reqByContract.set(r.contract_id, r);
  }
  const contractsByUnit = group(contracts, c => c.unit_id);

  const unitVMs: UnitVM[] = [];
  for (const u of units) {
    const tower = towerById.get(u.tower_id);
    const zone = tower && zoneById.get(tower.zoneId);
    if (!tower || !zone) continue;

    const unitRooms: Room[] = (roomsByUnit.get(u.id) ?? [])
      .sort((a, b) => a.sort - b.sort || String(a.name).localeCompare(String(b.name)))
      .map(r => ({ id: r.id, unitId: u.id, name: r.name, capacity: r.capacity, rent: n(r.rent) }));

    const unit: Unit = {
      id: u.id, zoneId: zone.code, towerId: tower.id, towerNo: tower.no,
      floor: u.floor, unitNo: u.unit_no, code: u.code,
      bedrooms: u.bedrooms, bathrooms: u.bathrooms, areaM2: n(u.area_m2),
      serviceFee: n(u.service_fee), rooms: unitRooms,
      maintenance: !!u.maintenance, maintenanceNote: u.maintenance_note ?? undefined,
    };

    const cvms: ContractVM[] = (contractsByUnit.get(u.id) ?? []).map(c => toContractVM(
      c, crByContract.get(c.id) ?? [], occByContract.get(c.id) ?? [],
      periodsByContract.get(c.id) ?? [], extByContract.get(c.id) ?? [],
      reqByContract.get(c.id), today,
    ));
    const contractsCore = cvms.map(x => x.contract);
    const invoicesOf = new Map(cvms.map(x => [x.contract.id, x.invoices]));

    const money = computeMoneyState({
      contracts: contractsCore,
      scheduleOf: c => invoicesOf.get(c.id) ?? [],
      today,
      underMaintenance: unit.maintenance,
    });

    const needsQR = cvms.some(cv => {
      const due = cv.invoices.filter(iv => !iv.paid && iv.due <= today);
      if (!due.length) return false;
      const r = cv.openRequest;
      return !r || r.status !== 'SENT' || due.some(iv => !r.periodIds.includes(iv.periodId));
    });

    unitVMs.push({
      unit, zone, tower,
      state: computeUnitState(unit, contractsCore),
      money,
      contracts: cvms,
      endsSoon: contractsCore.some(c => { const d = daysBetween(c.endsOn, today); return d >= 0 && d <= 30; }),
      needsQR,
    });
  }

  // Sắp theo TRƯỜNG: khu → số hiệu tòa → tầng → mã căn. Không so chuỗi mã (H7 < H120).
  unitVMs.sort((a, b) =>
    a.zone.code.localeCompare(b.zone.code) || a.tower.no - b.tower.no ||
    a.unit.floor - b.unit.floor || a.unit.unitNo.localeCompare(b.unit.unitNo));

  const exceptions: ExceptionVM[] = exc.map(x => ({
    id: x.id, accountNumber: x.account_number, amount: n(x.amount), content: x.content ?? '',
    occurredAt: x.occurred_at, kind: x.match_kind, code: x.match_code ?? undefined,
    reason: x.match_reason ?? undefined, requestId: x.request_id ?? undefined,
    providerTxId: x.provider_tx_id, referenceCode: x.reference_code ?? undefined,
  }));

  return {
    today,
    zones: zoneVMs.sort((a, b) => a.code.localeCompare(b.code)),
    towers: towerVMs.sort((a, b) => a.no - b.no),
    units: unitVMs,
    exceptions,
  };
}

function toContractVM(
  c: any, crs: any[], occs: any[], periods: any[], exts: any[], req: any | undefined, today: Date,
): ContractVM {
  // Đơn khất đang CHỜ được ưu tiên hiện; không có thì đơn đã DUYỆT còn hiệu lực.
  const pending = exts.find(e => e.status === 'PENDING');
  const approved = exts
    .filter(e => e.status === 'APPROVED' && parseDay(e.new_due) >= today)
    .sort((a, b) => (a.new_due < b.new_due ? 1 : -1))[0];
  const e = pending ?? approved;
  const extension: Extension | undefined = e ? {
    id: e.id, status: e.status, newDue: parseDay(e.new_due), reason: e.reason,
    requestedAt: new Date(e.requested_at), decidedAt: e.decided_at ? new Date(e.decided_at) : undefined,
  } : undefined;

  const occupants: OccupantVM[] = occs.map(o => ({
    id: o.id, contractId: c.id, roomId: o.room_id, name: o.full_name, primary: !!o.is_primary,
    phone: o.phone ?? '', idNumber: o.id_number ?? undefined, idIssuedOn: o.id_issued_on ?? undefined,
    idIssuedBy: o.id_issued_by ?? undefined, address: o.address ?? undefined, dob: o.dob ?? undefined,
    idFrontPath: o.id_front_path ?? undefined, idBackPath: o.id_back_path ?? undefined,
  })).sort((a, b) => Number(b.primary) - Number(a.primary));

  const contract: Contract = {
    id: c.id, code: c.code, unitId: c.unit_id,
    rooms: crs.map(r => ({ roomId: r.room_id, mode: r.mode, slotsHeld: r.slots_held ?? undefined })),
    occupants: occupants.map(o => ({
      id: o.id, name: o.name, roomId: o.roomId, primary: o.primary, phone: o.phone,
      idNumber: o.idNumber ?? '', idIssuedOn: o.idIssuedOn, idIssuedBy: o.idIssuedBy,
      address: o.address, dob: o.dob,
    })),
    rent: n(c.rent), serviceFee: n(c.service_fee), cycleMonths: c.cycle_months,
    depositMonths: c.deposit_months, moveIn: parseDay(c.move_in), endsOn: parseDay(c.ends_on),
    payMode: c.pay_mode, renewedFromId: c.renewed_from_id ?? undefined, extension,
  };

  const invoices = periods.map((p): Invoice & { periodId: string } => {
    const due = parseDay(p.due_on);
    const amount = n(p.amount_due);
    const paid = p.status === 'PAID' || p.status === 'WAIVED';
    const paidAmount = Math.min(n(p.amount_paid), amount);
    return {
      periodId: p.id,
      key: invoiceKey(c.id, p.type, due),
      contractId: c.id, type: p.type, due,
      periodFrom: parseDay(p.period_from), periodTo: parseDay(p.period_to),
      amount, paidAmount,
      owed: paid ? 0 : amount - paidAmount,
      paid,
      late: !paid && due < today,
    };
  });

  const openRequest: OpenRequestVM | undefined = req ? {
    id: req.id, contractId: c.id, docNo: req.doc_no, code: req.code, amount: n(req.amount),
    status: req.status, sentAt: req.sent_at ?? undefined, createdAt: req.created_at,
    periodIds: (req.payment_request_lines ?? []).map((l: any) => l.period_id),
  } : undefined;

  return { contract, invoices, occupants, openRequest };
}

function group<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x); else m.set(k, [x]);
  }
  return m;
}

/* ------------------------------------------------------------------ ghi chú */

export interface NoteVM { id: number; body: string; createdAt: string; by: string }

export async function loadNotes(unitId: string): Promise<NoteVM[]> {
  const { data, error } = await supabase.from('unit_notes')
    .select('id, body, created_at, profiles(full_name)')
    .eq('unit_id', unitId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((x: any) => ({
    id: x.id, body: x.body, createdAt: x.created_at, by: x.profiles?.full_name ?? '—',
  }));
}

export async function addNote(unitId: string, body: string, me: string): Promise<void> {
  const { error } = await supabase.from('unit_notes').insert({ unit_id: unitId, body, created_by: me });
  if (error) throw error;
}

/* ------------------------------------------------------------------ nhật ký */

export interface LogVM { id: number; at: string; actor: string; action: string; entityId?: string; amount?: number; meta: any }

export async function loadUnitLog(unitId: string): Promise<LogVM[]> {
  const { data, error } = await supabase.from('audit_logs')
    .select('id, at, actor_type, action, entity_id, amount, meta, profiles(full_name)')
    .eq('unit_id', unitId).order('at', { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id, at: l.at,
    actor: l.actor_type === 'USER' ? (l.profiles?.full_name ?? 'Người dùng')
         : l.actor_type === 'SEPAY' ? 'SePay' : 'Hệ thống',
    action: l.action, entityId: l.entity_id ?? undefined,
    amount: l.amount != null ? n(l.amount) : undefined, meta: l.meta ?? {},
  }));
}

/* ------------------------------------------------------------------ phiếu thanh toán */

export interface RequestLine {
  period_id: string; type: 'RENT' | 'SERVICE'; due_on: string; period_from: string; period_to: string;
  amount: number; late_days: number; fee: number;
}
export interface RequestQuote {
  unit_code: string; contract_code: string; cycle_months: number;
  tenant: { name: string; phone: string | null } | null;
  lines: RequestLine[]; penalty: number; amount: number;
  bank: { id: string; bank_id: string; bank_name: string; number: string; holder: string };
  request?: { id: string; doc_no: string; code: string; amount: number; qr_payload: string; status: string; sent_at: string | null };
  reused?: boolean;
}

/** Bước 1 (preview) chỉ tính; bước 2 lập phiếu thật. Số tiền do SERVER tính bằng core. */
export async function requestQuote(contractId: string, preview: boolean): Promise<RequestQuote> {
  const { data, error } = await supabase.functions.invoke('create-payment-request', {
    body: { contract_id: contractId, preview },
  });
  if (error) throw error;
  return data as RequestQuote;
}

export async function markRequestSent(requestId: string): Promise<void> {
  const { error } = await supabase.from('payment_requests')
    .update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', requestId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ ghi tiền tay */

/** Tiền mặt / ngân hàng chưa nối. `recorded_by` bắt buộc là chính mình — RLS chặn ghi hộ. */
export async function recordCash(periodId: string, amount: number, me: string, note: string): Promise<void> {
  const { error } = await supabase.from('payments').insert({
    period_id: periodId, amount, source: 'MANUAL', recorded_by: me, note,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ ngoại lệ */

export async function resolveTx(txId: string, requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_bank_tx', { p_tx: txId, p_request: requestId });
  if (error) throw error;
  return String(data);
}

export async function dismissTx(txId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_bank_tx', { p_tx: txId, p_note: note });
  if (error) throw error;
}

/* ------------------------------------------------------------------ sổ quỹ */

export interface LedgerVM {
  accounts: { id: string; bankId: string; number: string; holder: string }[];
  collectedThisMonth: number;
  byAuto: number;
  byManual: number;
  receipts: { docNo: string; at: string; amount: number; periodId: string }[];
  manual: { at: string; amount: number; periodId: string; by: string; note?: string }[];
}

export async function loadLedger(monthStart: Date): Promise<LedgerVM> {
  const [accs, pays, recs] = await Promise.all([
    fetchAll('bank_accounts', 'id, bank_id, number, holder'),
    fetchAll('payments', 'amount, source, recorded_at, period_id, note, profiles(full_name)',
      q => q.gte('recorded_at', monthStart.toISOString()).order('recorded_at', { ascending: false })),
    supabase.from('receipts').select('doc_no, issued_at, payments!inner(amount, period_id)')
      .order('issued_at', { ascending: false }).limit(30),
  ]);
  if (recs.error) throw recs.error;
  const byAuto = pays.filter(p => p.source === 'AUTO').reduce((a, p) => a + n(p.amount), 0);
  const byManual = pays.filter(p => p.source === 'MANUAL').reduce((a, p) => a + n(p.amount), 0);
  return {
    accounts: accs.map(a => ({ id: a.id, bankId: a.bank_id, number: a.number, holder: a.holder })),
    collectedThisMonth: byAuto + byManual, byAuto, byManual,
    receipts: (recs.data ?? []).map((r: any) => ({
      docNo: r.doc_no, at: r.issued_at, amount: n(r.payments?.amount), periodId: r.payments?.period_id,
    })),
    manual: pays.filter(p => p.source === 'MANUAL').slice(0, 20).map(p => ({
      at: p.recorded_at, amount: n(p.amount), periodId: p.period_id,
      by: p.profiles?.full_name ?? '—', note: p.note ?? undefined,
    })),
  };
}

/* ------------------------------------------------------------------ tài khoản */

export interface MemberVM {
  profileId: string; name: string; phone?: string; role: string; tower?: string; lockedAt?: string;
}

export async function loadMembers(): Promise<MemberVM[]> {
  const { data, error } = await supabase.from('memberships')
    .select('profile_id, role, towers(code), profiles!inner(full_name, phone, locked_at)')
    .in('role', ['OWNER', 'MANAGER']);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    profileId: m.profile_id, name: m.profiles.full_name, phone: m.profiles.phone ?? undefined,
    role: m.role, tower: m.towers?.code ?? undefined, lockedAt: m.profiles.locked_at ?? undefined,
  }));
}

export async function lockMember(profileId: string, reason: string) {
  const { error } = await supabase.rpc('lock_member', { p_profile: profileId, p_reason: reason });
  if (error) throw error;
}
export async function unlockMember(profileId: string) {
  const { error } = await supabase.rpc('unlock_member', { p_profile: profileId });
  if (error) throw error;
}
export async function inviteMember(email: string, fullName: string, phone: string, towerId: string | null) {
  const { error } = await supabase.functions.invoke('invite-member', {
    body: { email, full_name: fullName, phone: phone || undefined, tower_id: towerId || undefined },
  });
  if (error) throw error;
}

export interface NotificationVM { id: number; title: string; body: string; createdAt: string; readAt?: string }

export async function loadNotifications(): Promise<NotificationVM[]> {
  const { data, error } = await supabase.from('notifications')
    .select('id, title, body, created_at, read_at').order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []).map((x: any) => ({
    id: x.id, title: x.title, body: x.body, createdAt: x.created_at, readAt: x.read_at ?? undefined,
  }));
}
export async function markAllRead(ids: number[]) {
  if (!ids.length) return;
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}

/** Ảnh CCCD: URL ký tạm 60 giây, KHÔNG lưu lại (SECURITY.md §3). */
export async function signedIdPhoto(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('id-docs').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
