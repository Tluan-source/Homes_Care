/**
 * Ghi nhận tiền mặt / ngân hàng chưa nối — đường dự phòng, KHÔNG phải đường chính.
 * Người ghi = chính mình (RLS bắt buộc), lưu vĩnh viễn, không sửa không xoá.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatDay, formatVND } from '@homescare/core';
import { recordCash } from '../../data/api';
import type { ContractVM } from '../../data/model';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Btn, Callout, SecH, Sheet, Txt } from '../../ui/kit';

export function CashSheet({ contract, me, onClose, onDone }: {
  contract: ContractVM | null; me: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const c = useTheme();
  const open = contract?.invoices.filter(iv => !iv.paid) ?? [];
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const first = contract?.invoices.find(iv => !iv.paid);
    setPeriodId(first?.periodId ?? null);
    setAmount(first ? String(first.owed) : '');
    setNote(''); setErr(null);
  }, [contract]);

  if (!contract) return null;
  const sel = open.find(iv => iv.periodId === periodId);
  const value = Number(amount.replace(/\D/g, ''));

  const submit = async () => {
    if (!sel || !value) return;
    if (value > sel.owed) { setErr(`Số tiền lớn hơn phần còn nợ của kỳ (${formatVND(sel.owed)})`); return; }
    setBusy(true); setErr(null);
    try {
      await recordCash(sel.periodId, value, me, note.trim() || 'Tiền mặt');
      onDone(`Đã ghi nhận ${formatVND(value)}`);
    } catch (e) { setErr(await errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!contract} title="Ghi nhận tiền mặt" onClose={onClose}
      footer={<>
        <Btn kind="s" label="Huỷ" onPress={onClose} />
        <Btn label="Ghi nhận" onPress={submit} busy={busy} disabled={!sel || !value} style={{ flex: 1 }} />
      </>}>
      <Callout tone="warn"><Txt>Chỉ dùng khi khách <Txt b>trả tiền mặt</Txt> hoặc chuyển từ ngân hàng chưa nối SePay. Khoản ghi tay lưu tên bạn và <Txt b>không sửa, không xoá được</Txt>.</Txt></Callout>
      <SecH style={{ marginTop: 16 }}>Kỳ thu</SecH>
      {open.length === 0 ? <Txt muted>Không còn kỳ nào chưa đóng.</Txt> : open.slice(0, 8).map(iv => {
        const on = iv.periodId === periodId;
        return (
          <Pressable key={iv.periodId} onPress={() => { setPeriodId(iv.periodId); setAmount(String(iv.owed)); }}
            style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, marginBottom: 7, borderRadius: 12, borderWidth: 1.5,
              borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
            <View>
              <Text style={{ fontWeight: '600', color: c.ink }}>{iv.type === 'RENT' ? `Tiền nhà · ${contract.contract.cycleMonths} tháng` : 'Tiền dịch vụ'}</Text>
              <Text style={{ fontSize: 11.5, color: iv.late ? c.danger : c.muted, marginTop: 2 }}>Hạn {formatDay(iv.due)}{iv.late ? ' · quá hạn' : ''}</Text>
            </View>
            <Text style={{ fontWeight: '700', color: c.ink }}>{formatVND(iv.owed)}</Text>
          </Pressable>
        );
      })}
      <SecH style={{ marginTop: 12 }}>Số tiền nhận (đ)</SecH>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" accessibilityLabel="Số tiền"
        style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '700', color: c.ink, backgroundColor: c.surface }} />
      {value ? <Text style={{ fontSize: 12, color: c.muted, marginTop: 5 }}>{formatVND(value)}</Text> : null}
      <SecH style={{ marginTop: 12 }}>Ghi chú</SecH>
      <TextInput value={note} onChangeText={setNote} placeholder="VD: khách đưa tiền mặt tại phòng" placeholderTextColor={c.muted}
        style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, fontSize: 14, color: c.ink, backgroundColor: c.surface }} />
      {err ? <Text style={{ color: c.danger, marginTop: 10, fontWeight: '600' }}>{err}</Text> : null}
    </Sheet>
  );
}
