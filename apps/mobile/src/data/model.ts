/**
 * Dữ liệu đã dựng sẵn cho màn hình. Mọi con số tiền / trạng thái do `@homescare/core`
 * tính từ dữ liệu database — màn hình chỉ vẽ lại, không tự tính.
 */
import type { Contract, Invoice, MoneyState, Unit, UnitState } from '@homescare/core';

export interface ZoneVM { id: string; code: string; name: string }
export interface TowerVM { id: string; zoneId: string; code: string; no: number; name: string }

export interface OccupantVM {
  id: string; contractId: string; roomId: string; name: string; primary: boolean;
  phone: string; idNumber?: string; idIssuedOn?: string; idIssuedBy?: string;
  address?: string; dob?: string; idFrontPath?: string; idBackPath?: string;
}

export interface OpenRequestVM {
  id: string; contractId: string; docNo: string; code: string; amount: number;
  status: 'DRAFT' | 'SENT'; sentAt?: string; createdAt: string; periodIds: string[];
}

export interface ContractVM {
  contract: Contract;
  /** Kỳ thu lấy THẲNG từ bảng payment_periods — sổ thật, không suy đoán. */
  invoices: (Invoice & { periodId: string })[];
  occupants: OccupantVM[];
  openRequest?: OpenRequestVM;
}

export interface UnitVM {
  unit: Unit;
  zone: ZoneVM;
  tower: TowerVM;
  state: UnitState;
  money: MoneyState;
  contracts: ContractVM[];
  /** Hợp đồng kết thúc trong ≤ 30 ngày. */
  endsSoon: boolean;
  /** Kỳ tới hạn (≤ hôm nay) chưa đóng mà CHƯA có phiếu nào được gửi cho khách. */
  needsQR: boolean;
}

export interface ExceptionVM {
  id: string; accountNumber: string; amount: number; content: string; occurredAt: string;
  kind: string; code?: string; reason?: string; requestId?: string;
  providerTxId: string; referenceCode?: string;
}

export interface Bundle {
  today: Date;
  zones: ZoneVM[];
  towers: TowerVM[];
  units: UnitVM[];
  exceptions: ExceptionVM[];
}
