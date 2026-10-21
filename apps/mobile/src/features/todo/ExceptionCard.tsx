/**
 * Thẻ một giao dịch NGOẠI LỆ — tiền THẬT đã về tài khoản mà máy không tự ghi nhận được.
 * Chỉ những ca này mới cần người quyết (lệch tiền dù 1.000đ cũng không tự ghi).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { formatVND } from '@homescare/core';
import type { ExceptionVM, UnitVM } from '../../data/model';
import { useTheme } from '../../theme/useTheme';
import { Btn, Panel, Pill, Row, mono } from '../../ui/kit';
import { fmtTime } from '../units/UnitDetailScreen';

export const EXC_LABEL: Record<string, string> = {
  PARTIAL: 'khách chuyển thiếu', OVERPAID: 'khách chuyển thừa', MULTI_PERIOD: 'một lần trả nhiều kỳ',
  UNMATCHED: 'không ghi nhận được',
};

export function ExceptionCard({ x, unit, requestAmount, onMatch, onDismiss }: {
  x: ExceptionVM; unit?: UnitVM; requestAmount?: number;
  onMatch: () => void; onDismiss: () => void;
}) {
  const c = useTheme();
  const tone = x.kind === 'PARTIAL' ? [c.mLate, c.mLateBg] : x.kind === 'OVERPAID' ? [c.mExt, c.mExtBg] : [c.mSoon, c.mSoonBg];
  const gap = requestAmount != null && x.amount < requestAmount ? `Thiếu ${formatVND(requestAmount - x.amount)}`
    : requestAmount != null && x.amount > requestAmount ? `Thừa ${formatVND(x.amount - requestAmount)}`
    : x.reason ?? '';
  return (
    <Panel style={{ padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill label={EXC_LABEL[x.kind] ?? x.kind} fg={tone[0]!} bg={tone[1]!} />
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{formatVND(x.amount)}</Text>
      </View>
      <Text style={{ fontFamily: mono, fontSize: 12.5, color: c.ink, marginTop: 9, backgroundColor: c.surface2, padding: 8, borderRadius: 8 }}>{x.content || '(không có nội dung)'}</Text>
      <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 7 }}>
        {unit ? <Text style={{ fontFamily: mono }}>{unit.unit.code} · </Text> : 'Chưa rõ căn nào · '}
        {fmtTime(x.occurredAt)} · <Text style={{ fontFamily: mono }}>{x.providerTxId}</Text>
      </Text>
      {gap ? <Text style={{ fontSize: 13, fontWeight: '700', color: tone[0], marginTop: 6 }}>{gap}</Text> : null}
      {x.reason && gap !== x.reason ? <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{x.reason}</Text> : null}
      <Row style={{ marginTop: 10 }}>
        <Btn label={x.requestId ? 'Ghép vào phiếu này' : 'Chọn phiếu để ghép'} onPress={onMatch} style={{ flex: 1 }} />
        <Btn kind="s" label="Đã xử lý ngoài" onPress={onDismiss} />
      </Row>
    </Panel>
  );
}
