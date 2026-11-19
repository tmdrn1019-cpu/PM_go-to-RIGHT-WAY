import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Divider } from '@astryxdesign/core/Divider';
import { fetchExternalData } from './service-client.mjs';
import { buildZone, zoneToForm, koreaInput } from './zone-form.mjs';

const blank = () => ({ id: '', name: '', address: '', lat: '', lng: '', boundary: '', scooter: true, ebike: false, parkingAuthorized: false, capacityAppliesToAllTypes: false, layouts: '', windows: '', preCloseMinutes: '', preCloseCapacity: '', count15: '', observedAt: koreaInput(Date.now()), observationMinutes: '15', observationSource: '', parked: '', reserved: '0', inventoryAt: koreaInput(Date.now()), inventoryMinutes: '15' });

export default function AdminPanel({ refresh }) {
  // Token lives only in memory for this tab; it is never stored or put in a URL.
  const [token, setToken] = useState(''); const [feed, setFeed] = useState(null); const [message, setMessage] = useState('');
  const [form, setForm] = useState(blank); const [candidates, setCandidates] = useState([]); const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    fetchExternalData('/api/towing/candidates', controller.signal).then((data) => setCandidates(Array.isArray(data.candidates) ? data.candidates : [])).catch(() => {});
    fetchExternalData('/api/parking/official', controller.signal).then((data) => setOfficial(Array.isArray(data.zones) ? data.zones.filter((z) => z.point) : [])).catch(() => {});
    return () => controller.abort();
  }, []);
  const [official, setOfficial] = useState([]);
  const pickOfficial = (id) => { const z = official.find((row) => row.id === id); if (z) setForm({ ...blank(), id: `seoul-${z.id}`, name: z.name, address: z.address, lat: String(z.point[0]), lng: String(z.point[1]), parkingAuthorized: true }); };
  const [log, setLog] = useState(null);
  const loadLog = () => fetch('/api/admin/log', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
    .then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setLog(data.entries)).catch(() => setLog(null));
  const call = async (method, path, body) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 401) setFeed(null); throw new Error(data.error ?? '요청을 처리하지 못했습니다.'); }
      setFeed(data); loadLog(); return data;
    } catch (error) { setMessage(error.name === 'TimeoutError' ? '서버 응답이 없습니다. 저장 여부를 운영 목록에서 다시 확인하세요.' : error.message); return null; } finally { setBusy(false); }
  };
  const save = async () => {
    let zone; try { zone = buildZone(form); } catch (error) { setMessage(error.message); return; }
    if (await call('PUT', `/zones/${encodeURIComponent(zone.id)}`, zone)) { setMessage(`${zone.name}을(를) 저장했습니다. 지도는 다음 갱신 때 반영됩니다.`); refresh?.(); }
  };
  const remove = async (zone) => { if (window.confirm(`${zone.name}을(를) 운영 목록에서 삭제할까요? 되돌릴 수 없습니다.`) && await call('DELETE', `/zones/${encodeURIComponent(zone.id)}`)) { setMessage(`${zone.name}을(를) 삭제했습니다.`); refresh?.(); } };
  const pick = (id) => { const c = candidates.find((row) => row.id === id); if (c) setForm({ ...blank(), id: `zone-${c.id.slice(0, 12)}`, name: `${c.address.replace('서울특별시 관악구 ', '')} 주변`, address: c.address, lat: String(c.point[0]), lng: String(c.point[1]) }); };

  if (!feed) return <VStack gap={4}>
    <Heading level={2}>운영자 존 등록</Heading>
    <Text color="secondary">현장에서 공간 사용 권한·주차 후 유효폭·15분 보행량을 확인한 주차존만 등록합니다. 서버에 설정한 관리자 토큰이 필요합니다.</Text>
    <TextInput label="관리자 토큰" type="password" value={token} onChange={setToken} autoComplete="off" />
    <Button label="운영 목록 열기" isDisabled={!token || busy} onClick={() => call('GET', '/feed')} />
    {message && <Text aria-live="assertive">{message}</Text>}
  </VStack>;

  return <VStack gap={4}>
    <Heading level={2}>운영자 존 등록</Heading>
    {message && <Text aria-live="assertive">{message}</Text>}
    <Text type="label">{feed.admin} 계정으로 작업 중</Text>
    <Text>등록된 존 {feed.zones?.length ?? 0}곳 · 운영 파일 발행 {new Date(feed.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</Text>
    <CheckboxInput label="보행 LOS 참고 기준을 운영 기준으로 승인" description="2022 보행업무편람 수록 보도 LOS(A≤20 … E≤106 명/분/m). 적용성을 검토한 운영 주체만 승인하세요. 승인 전에는 모든 존이 판정 보류입니다." value={feed.profile?.approvedForService === true} isDisabled={busy} onChange={(checked) => call('PUT', '/profile', { approvedForService: checked })} />
    <VStack gap={0}>{(feed.zones ?? []).map((zone) => <HStack key={zone.id} hAlign="between" gap={2} paddingBlock={2} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
      <Text>{zone.name} · {zone.id}</Text>
      <HStack gap={1}><Button label={`${zone.name} 수정`} size="sm" variant="secondary" onClick={() => { setForm(zoneToForm(zone)); setMessage(''); }} /><Button label={`${zone.name} 삭제`} size="sm" variant="ghost" isDisabled={busy} onClick={() => remove(zone)} /></HStack>
    </HStack>)}</VStack>
    <Divider />
    <Heading level={3}>존 정보</Heading>
    {!!official.length && <Selector label="서울시 지정 PM 주차구역에서 가져오기" description="서울시 예산으로 지정된 실제 주차구역입니다. 공간 사용 권한이 미리 체크되지만 경계·유효폭·보행량은 현장에서 측정해 입력하세요." value="" onChange={pickOfficial} options={[{ value: '', label: '선택 안 함' }, ...official.map((z) => ({ value: z.id, label: `${z.name} · ${z.address.replace('서울특별시 관악구 ', '')}${z.hasStand ? ' · 거치대' : ''}` }))]} />}
    {!!candidates.length && <Selector label="후보 탐색지에서 위치 가져오기" value="" onChange={pick} options={[{ value: '', label: '직접 입력' }, ...candidates.map((c) => ({ value: c.id, label: `${c.address} 주변 · 견인 ${c.towingCount}건` }))]} />}
    <TextInput label="존 ID (영문·숫자, 저장 후 변경하면 새 존이 됩니다)" value={form.id} onChange={set('id')} isRequired />
    <TextInput label="존 이름" value={form.name} onChange={set('name')} isRequired />
    <TextInput label="주소" value={form.address} onChange={set('address')} isRequired />
    <HStack gap={2}><TextInput label="대표 위도" value={form.lat} onChange={set('lat')} isRequired /><TextInput label="대표 경도" value={form.lng} onChange={set('lng')} isRequired /></HStack>
    <TextArea label="주차 경계 좌표" description="현장에서 측정한 꼭짓점을 한 줄에 '위도, 경도'로 3점 이상. 마지막 점은 자동으로 닫힙니다." value={form.boundary} onChange={set('boundary')} isRequired />
    <HStack gap={3}><CheckboxInput label="킥보드" value={form.scooter} onChange={set('scooter')} /><CheckboxInput label="전기자전거" value={form.ebike} onChange={set('ebike')} /></HStack>
    {form.scooter && form.ebike && <CheckboxInput label="두 기기 공통 정원을 현장에서 확인함" value={form.capacityAppliesToAllTypes} onChange={set('capacityAppliesToAllTypes')} />}
    <CheckboxInput label="공간 사용 권한 확인됨" description="제휴·허가 등 실제 사용 권한이 확인된 경우에만 선택하세요." value={form.parkingAuthorized} onChange={set('parkingAuthorized')} />
    <TextArea label="측정 배치" description="한 줄에 '수용 대수, 주차 후 남는 유효폭(m)'. 예: 10, 2.4" value={form.layouts} onChange={set('layouts')} isRequired />
    <TextArea label="운영시간 (한국 시각)" description="한 줄에 HH:mm-HH:mm, 요일 지정은 뒤에 월,화,수처럼 적습니다(예: 09:00-18:00 월,화,수,목,금). 자정을 넘겨도 되며 비우면 상시 운영." value={form.windows} onChange={set('windows')} isOptional />
    <HStack gap={2}><TextInput label="폐쇄 예고 (분 전)" value={form.preCloseMinutes} onChange={set('preCloseMinutes')} isOptional /><TextInput label="예고 시 정원" value={form.preCloseCapacity} onChange={set('preCloseCapacity')} isOptional /></HStack>
    <Heading level={3}>현장 관측</Heading>
    <Text type="supporting">15분 동안 실제로 센 보행자 수를 입력합니다. S-DoT 10분 값이나 역 승하차 추정을 넣지 마세요.</Text>
    <TextInput label="15분 보행량 (명)" value={form.count15} onChange={set('count15')} isRequired />
    <HStack gap={2}><TextInput label="관측 시각 (YYYY-MM-DDTHH:mm, KST)" value={form.observedAt} onChange={set('observedAt')} isRequired /><TextInput label="유효 시간 (분)" value={form.observationMinutes} onChange={set('observationMinutes')} isRequired /></HStack>
    <TextInput label="관측 출처" value={form.observationSource} onChange={set('observationSource')} isRequired />
    <HStack gap={2}><TextInput label="현재 주차 대수" value={form.parked} onChange={set('parked')} isRequired /><TextInput label="예약 대수" value={form.reserved} onChange={set('reserved')} isRequired /></HStack>
    <HStack gap={2}><TextInput label="주차 현황 확인 시각 (KST)" value={form.inventoryAt} onChange={set('inventoryAt')} isRequired /><TextInput label="유효 시간 (분)" value={form.inventoryMinutes} onChange={set('inventoryMinutes')} isRequired /></HStack>
    <HStack gap={2}><Button label="존 저장" isDisabled={busy} onClick={save} /><Button label="새로 입력" variant="ghost" onClick={() => { setForm(blank()); setMessage(''); }} /></HStack>
    <Divider />
    <Heading level={3}>최근 변경 기록</Heading>
    {log === null ? <Text type="supporting">변경 기록을 불러오지 못했습니다.</Text> : !log.length ? <Text type="supporting">아직 변경 기록이 없습니다.</Text> : <VStack gap={1}>{log.slice(0, 20).map((entry, index) => <Text key={index} type="supporting">
      {entry.at ? new Date(entry.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '시각 없음'} · {entry.admin ?? '알 수 없음'} · {({ 'save-zone': '존 저장', 'delete-zone': '존 삭제', 'approve-profile': 'LOS 기준 승인', 'revoke-profile': 'LOS 기준 승인 해제' })[entry.action] ?? '읽을 수 없는 기록'}{entry.zoneId ? ` · ${entry.zoneName ?? ''} (${entry.zoneId})` : ''}
    </Text>)}</VStack>}
  </VStack>;
}
