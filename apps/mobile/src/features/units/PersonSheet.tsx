/** Thông tin một người ở — kèm ảnh CCCD qua URL ký tạm 60 giây, không lưu lại. */
import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { formatDay, parseDay } from '@homescare/core';
import { signedIdPhoto } from '../../data/api';
import type { ContractVM, OccupantVM, UnitVM } from '../../data/model';
import { useTheme } from '../../theme/useTheme';
import { Btn, Initials, KV, Panel, SecH, Sheet } from '../../ui/kit';

export function PersonSheet({ person, contract, vm, onClose }: {
  person: OccupantVM | null; contract?: ContractVM; vm: UnitVM; onClose: () => void;
}) {
  const c = useTheme();
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    setFront(null); setBack(null);
    if (!person) return;
    let alive = true;
    if (person.idFrontPath) void signedIdPhoto(person.idFrontPath).then(u => alive && setFront(u));
    if (person.idBackPath) void signedIdPhoto(person.idBackPath).then(u => alive && setBack(u));
    return () => { alive = false; };
  }, [person]);

  if (!person || !contract) return null;
  const room = vm.unit.rooms.find(r => r.id === person.roomId);
  const d = (s?: string) => (s ? formatDay(parseDay(s)) : '—');
  const shot = (uri: string | null, has: boolean, cap: string) => (
    <View style={{ flex: 1 }}>
      <View style={{ aspectRatio: 1.58, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          : <Text style={{ fontSize: 11.5, color: c.muted }}>{has ? 'Đang tải…' : 'Chưa có ảnh'}</Text>}
      </View>
      <Text style={{ fontSize: 11, color: c.muted, textAlign: 'center', marginTop: 5 }}>{cap}</Text>
    </View>
  );

  return (
    <Sheet visible={!!person} title="Thông tin người ở" onClose={onClose}
      footer={<>
        {person.phone ? <Btn kind="s" label="Gọi" onPress={() => Linking.openURL(`tel:${person.phone.replace(/\s/g, '')}`)} /> : null}
        <Btn label="Xong" onPress={onClose} style={{ flex: 1 }} />
      </>}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Initials name={person.name} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{person.name}</Text>
          <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>
            {person.primary ? <Text style={{ color: c.accentDeep, fontWeight: '700' }}>Người đại diện ký HĐ · </Text> : null}
            {room?.name ?? ''} · {vm.unit.code}
          </Text>
        </View>
      </View>

      <SecH>Giấy tờ tuỳ thân</SecH>
      <Panel>
        <KV k="Số CCCD" v={person.idNumber || '—'} monoV />
        <KV k="Ngày cấp" v={d(person.idIssuedOn)} />
        <KV k="Nơi cấp" v={person.idIssuedBy || '—'} />
        <KV k="Ngày sinh" v={d(person.dob)} />
        <KV k="Thường trú" v={person.address || '—'} last />
      </Panel>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {shot(front, !!person.idFrontPath, 'Mặt trước')}
        {shot(back, !!person.idBackPath, 'Mặt sau')}
      </View>

      <SecH style={{ marginTop: 20 }}>Liên hệ</SecH>
      <Panel><KV k="Điện thoại" v={person.phone || '—'} last /></Panel>

      <SecH style={{ marginTop: 20 }}>Hợp đồng đang ở</SecH>
      <Panel>
        <KV k="Số HĐ" v={contract.contract.code} monoV />
        <KV k="Phòng" v={room?.name ?? '—'} />
        <KV k="Thời hạn" v={`${formatDay(contract.contract.moveIn)} – ${formatDay(contract.contract.endsOn)}`} />
        <KV k="Cách đóng tiền" v={`${contract.contract.cycleMonths} cọc ${contract.contract.depositMonths}`} vColor={c.accentDeep} last />
      </Panel>
    </Sheet>
  );
}
