/**
 * Lọc · tìm · sắp xếp danh sách căn. Thuần — không đụng giao diện, không đọc đồng hồ.
 */
import { isUrgent, type MoneyStateKind, type UnitStatus } from '@homescare/core';
import type { UnitVM } from '../../data/model';

export type SortKey = 'code' | 'late' | 'amt' | 'due';
export interface Filters { house: UnitStatus[]; money: MoneyStateKind[]; endsSoon: boolean; sort: SortKey }
export const NO_FILTERS: Filters = { house: [], money: [], endsSoon: false, sort: 'code' };

export const SORT_LABEL: Record<SortKey, string> = {
  code: 'A → Z theo mã căn', late: 'Trễ lâu nhất', amt: 'Số tiền lớn nhất', due: 'Tới hạn gần nhất',
};

export const countFilters = (f: Filters) => f.house.length + f.money.length + (f.endsSoon ? 1 : 0);

export function passes(vm: UnitVM, f: Filters): boolean {
  if (f.house.length && !f.house.includes(vm.state.status)) return false;
  if (f.money.length && !f.money.includes(vm.money.kind)) return false;
  if (f.endsSoon && !vm.endsSoon) return false;
  return true;
}

export function sortUnits(list: UnitVM[], sort: SortKey): UnitVM[] {
  if (sort === 'code') return list;                       // bundle đã sắp theo trường
  const out = [...list];
  if (sort === 'late') out.sort((a, b) => (a.money.since?.getTime() ?? Infinity) - (b.money.since?.getTime() ?? Infinity));
  if (sort === 'amt') out.sort((a, b) => b.money.owed - a.money.owed);
  if (sort === 'due') out.sort((a, b) => (a.money.nextDue?.getTime() ?? Infinity) - (b.money.nextDue?.getTime() ?? Infinity));
  return out;
}

/** Bỏ dấu để so khớp — quản lý gõ nhanh trên điện thoại hiếm khi gõ dấu. */
const noTone = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const norm = (s: string) => noTone(s).toLowerCase().trim();
const normCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');

/** Tìm theo MÃ CĂN, TÊN và SỐ ĐIỆN THOẠI — khách gọi tới thì quản lý biết tên và số máy,
 *  không ai nhớ 'S219.2108'. Trả về người khớp để dòng căn hiện VÌ SAO nó xuất hiện. */
export function matchQuery(vm: UnitVM, q: string): { hit: boolean; people: { name: string; phone: string }[] } {
  const t = q.trim();
  if (!t) return { hit: true, people: [] };
  const qc = normCode(t), qt = norm(t), qd = digits(t);
  const people = vm.contracts.flatMap(c => c.occupants).filter(p =>
    (qt.length >= 2 && norm(p.name).includes(qt)) || (qd.length >= 3 && digits(p.phone).includes(qd)));
  const codeHit = qc.length > 0 && normCode(vm.unit.code).includes(qc);
  return { hit: codeHit || people.length > 0, people };
}

export const isSoon = (k: MoneyStateKind) => k === 'soon';
export const isTask = (vm: UnitVM) => isUrgent(vm.money.kind) || isSoon(vm.money.kind) || vm.state.status === 'empty';
