import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import ZoneMap from './ZoneMap';

// Everything on this page is synthetic: zones, scooters, clock, unlock, GPS, photo verdicts and points.
const statuses = { open: '개방', reduced: '축소 운영', closed: '폐쇄', unknown: '판정 불가' };
const missionStatus = { moving: '이동 중', verifying: '사진 재확인 필요', completed: '완료', cancelled: '취소', expired: '시간 초과' };
const time = (value) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const square = ([lat, lng], d = 0.00012) => [[lat - d, lng - d], [lat + d, lng - d], [lat + d, lng + d], [lat - d, lng + d], [lat - d, lng - d]];

export default function DemoPage() {
  const mobile = useMediaQuery('(max-width: 56rem)');
  const [state, setState] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [destinations, setDestinations] = useState({}); const [failUnlock, setFailUnlock] = useState(false); const [focus, setFocus] = useState(null);
  const [tab, setTab] = useState('mission');
  const load = useCallback(() => fetch('/api/demo/state', { cache: 'no-store' }).then((r) => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error)))).then(setState).catch((e) => setMessage(e.message || '시연 상태를 불러오지 못했습니다.')), []);
  useEffect(() => { load(); }, [load]);
  const send = async (action, done) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/demo/command', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-PM-Demo': '1' }, body: JSON.stringify(action), signal: AbortSignal.timeout(10_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? '요청을 처리하지 못했습니다.');
      setState(data.state); if (done) setMessage(done);
    } catch (error) { setMessage(error.name === 'TimeoutError' ? '서버 응답이 없습니다.' : error.message); await load(); } finally { setBusy(false); }
  };
  const zones = useMemo(() => (state?.zones ?? []).map((z) => ({ ...z, boundary: square(z.point), vehicleTypes: ['scooter'] })), [state]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zone positions never change, so fit the map once.
  const overview = useMemo(() => (zones.length ? { points: zones.map((z) => z.point) } : null), [zones.length]);
  const zoneName = (id) => state?.zones.find((z) => z.id === id)?.name ?? id;
  const active = state?.missions.find((m) => ['moving', 'verifying'].includes(m.status));
  const report = (mission, point, label) => send({ type: 'position', missionId: mission.id, point, accuracy: 8, observedAt: state.now }, label);
  const areas = useMemo(() => (state?.towingAreas ?? []).map((a) => ({ point: a.point, radiusM: a.radiusM, label: `${a.name} · 반경 ${a.radiusM}m (시연 가정값)` })), [state]);
  const routes = useMemo(() => (active ? [active.route] : []), [active]);
  // Zoom to each new mission's route so a 30m towing circle and the short exit move are visible.
  useEffect(() => { if (active) setFocus({ points: active.route }); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState(null);
  const onVehicleSelect = useCallback((id) => { setPicked(id); setTab('mission'); }, []);
  const offerIds = useMemo(() => new Set((state?.offers ?? []).map((o) => o.id)), [state]);
  // Synthetic scooters in TAGO-like individual positions; red = inside a towing area.
  const vehicles = useMemo(() => (state?.scooters ?? []).filter((s) => s.point).map((s) => ({ id: s.id, point: s.point, alert: !!s.towingArea,
    label: `${s.id} · 합성 킥보드 · ${s.towingArea ? `${s.towingArea} 안` : '견인 구역 밖'}${offerIds.has(s.id) ? ' · 클릭해 이동 미션 선택' : ''}` })), [state, offerIds]);
  const towed = vehicles.filter((v) => v.alert).length;
  const pickedScooter = state?.scooters.find((s) => s.id === picked);
  const offers = (state?.offers ?? []).slice().sort((a, b) => (b.id === picked) - (a.id === picked));
  const onBoundsChange = useCallback(() => {}, []);
  const onSelect = useCallback(() => {}, []);

  const panel = !state ? <Text role="status">{message || '시연 상태를 불러오고 있습니다.'}</Text> : <VStack gap={5}>
    <Section variant="muted"><Text>시연 모드 · 합성 자료입니다. 잠금 해제·GPS·사진 판정·포인트는 모두 모의 동작입니다.</Text></Section>
    {message && <Text aria-live="assertive" weight="bold">{message}</Text>}
    <HStack gap={6} wrap="wrap">
      <VStack gap={1}><Text color="secondary">시연 시각</Text><Text type="large" weight="bold">{time(state.now)}</Text></VStack>
      <VStack gap={1}><Text color="secondary">시연 포인트</Text><Text type="large" weight="bold">{state.points.toLocaleString('ko-KR')}P</Text></VStack>
      <VStack gap={1}><Text color="secondary">오늘 미션</Text><Text type="large" weight="bold">{state.todayCount}/{state.policy.dailyLimit}</Text></VStack>
    </HStack>
    <HStack gap={2} wrap="wrap">
      <Button label="10분 진행" size="sm" variant="secondary" isDisabled={busy} onClick={() => send({ type: 'advance', minutes: 10 }, '시연 시계를 10분 진행했습니다.')} />
      <Button label="1시간 진행" size="sm" variant="secondary" isDisabled={busy} onClick={() => send({ type: 'advance', minutes: 60 }, '시연 시계를 1시간 진행했습니다.')} />
      <Button label="시연 초기화" size="sm" variant="ghost" isDisabled={busy} onClick={() => { if (window.confirm('시연 상태(미션·포인트·기록)를 처음으로 되돌릴까요?')) send({ type: 'reset', confirm: true }, '시연을 초기화했습니다.'); }} />
    </HStack>
    <HStack gap={2} wrap="wrap">{[['mission', '미션'], ['zones', '존 상태'], ['log', '기록']].map(([id, label]) => <Button key={id} label={label} size="sm" variant={tab === id ? 'primary' : 'ghost'} aria-pressed={tab === id} onClick={() => setTab(id)} />)}</HStack>
    <Divider />

    {tab === 'mission' && (active ? <VStack gap={3}>
      <Heading level={2}>진행 중인 미션</Heading>
      <Text>{active.scooterId} · {zoneName(active.originId)} → {active.destinationId === 'exit' ? '견인 구역 밖' : zoneName(active.destinationId)}</Text>
      <Text type="supporting">{missionStatus[active.status]} · {time(active.expiresAt)}까지 도착 · 걸어서 끌고 이동{active.alarmed ? ' · 경보 발생' : ''}</Text>
      {active.status === 'moving' && <>
        <Text type="label">1. 위치 전송 (모의 GPS, 오차 8m)</Text>
        <HStack gap={2} wrap="wrap">
          <Button label="경로 중간 위치" size="sm" variant="secondary" isDisabled={busy} onClick={() => report(active, active.route[1], '경로 위의 위치를 전송했습니다.')} />
          <Button label="경로 이탈 위치" size="sm" variant="secondary" isDisabled={busy} onClick={() => report(active, [active.route[1][0] + 0.002, active.route[1][1] + 0.002], '경로를 벗어난 위치를 전송했습니다.')} />
          <Button label={active.destinationId === 'exit' ? '견인 구역 밖 도착 위치' : '목적지 도착 위치'} size="sm" variant="secondary" isDisabled={busy} onClick={() => report(active, active.route.at(-1), '목적지 도착 위치를 전송했습니다.')} />
        </HStack>
      </>}
      <Text type="label">2. 사진 제출 (모의 판정)</Text>
      <HStack gap={2} wrap="wrap">
        <Button label="정주차 확인" size="sm" isDisabled={busy} onClick={() => send({ type: 'complete', missionId: active.id, photoPresent: true, verdict: 'approved' }, '이동을 완료했습니다.')} />
        <Button label="정주차 아님" size="sm" variant="secondary" isDisabled={busy} onClick={() => send({ type: 'complete', missionId: active.id, photoPresent: true, verdict: 'rejected' }, '사진이 거절돼 포인트를 지급하지 않았습니다.')} />
        <Button label="판별 불가" size="sm" variant="secondary" isDisabled={busy} onClick={() => send({ type: 'complete', missionId: active.id, photoPresent: true, verdict: 'uncertain' }, '판별할 수 없어 포인트를 지급하지 않았습니다.')} />
      </HStack>
      <Button label="미션 취소 (운영사 인계)" size="sm" variant="ghost" isDisabled={busy} onClick={() => send({ type: 'cancel', missionId: active.id }, '미션을 취소하고 운영사 인계로 남겼습니다.')} />
    </VStack> : <VStack gap={3}>
      <Heading level={2}>이동이 필요한 기기 {state.offers.length}대</Heading>
      <Text type="supporting">정원을 넘긴 존의 정상 반납 기기만 대상이며, 최근 {state.policy.recentMoveMinutes}분 안에 옮긴 기기는 빠집니다.</Text>
      <Text>견인 구역 안 기기 {towed}대 (지도의 빨간 점) · 지도에서 기기를 눌러 선택할 수 있습니다.</Text>
      {pickedScooter && <Text type="label" aria-live="polite">선택한 기기: {pickedScooter.id} · {pickedScooter.towingArea ? `${pickedScooter.towingArea} 안` : '견인 구역 밖'}{offerIds.has(pickedScooter.id) ? ' · 아래 맨 위에서 이동할 수 있습니다' : pickedScooter.needsOperator ? ' · 운영사 인계 대상이라 시민 미션으로 옮기지 않습니다' : ' · 지금은 이동 미션 대상이 아닙니다'}</Text>}
      <CheckboxInput label="잠금 해제 실패 상황 시연" value={failUnlock} onChange={setFailUnlock} />
      <VStack gap={0}>{offers.map((offer) => {
        const chosen = destinations[offer.id] ?? offer.destinations[0]?.id ?? '';
        return <VStack key={offer.id} gap={2} paddingBlock={3} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
          <Text type="label">{offer.id === picked ? '▶ 지도에서 선택 · ' : ''}{offer.id} · {offer.originName}</Text>
          {offer.destinations.length ? <>
            <Selector label={`${offer.id} 목적지`} value={chosen} onChange={(value) => setDestinations((prev) => ({ ...prev, [offer.id]: value }))} options={offer.destinations.map((d) => ({ value: d.id, label: `${d.name} · ${d.distanceM}m · ${d.id === 'exit' ? '가장 짧은 이동 · 정원·보행량 확인 없음' : `여유 ${d.available}대`}` }))} />
            <Button label={`${offer.id} 미션 수락·잠금 해제`} size="sm" isDisabled={busy} onClick={() => { send({ type: 'accept', scooterId: offer.id, destinationId: chosen, failUnlock }, '모의 잠금 해제에 성공했습니다. 걸어서 끌고 이동하세요.'); }} />
          </> : <Text type="supporting">걸어서 {state.policy.maxMoveM ?? 300}m 안에 받을 수 있는 열린 존이 없어 운영사 인계 대상입니다.</Text>}
        </VStack>;
      })}</VStack>
      {!state.offers.length && <Text type="supporting">지금은 옮길 기기가 없습니다. 시계를 진행해 존이 닫히는 시간대를 만들어 보세요.</Text>}
    </VStack>)}

    {tab === 'zones' && <><VStack gap={0}>{state.zones.map((z) => <VStack key={z.id} gap={1} paddingBlock={2} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
      <HStack hAlign="between" gap={2}><Text type="label">{z.name}</Text><Text type="label">{statuses[z.status]}</Text></HStack>
      <Text type="supporting">정원 {z.capacity} · 주차 {z.parked} · 예약 {z.reserved} · 여유 {z.available}{z.overflow ? ` · 초과 ${z.overflow}` : ''}{z.los ? ` · LOS ${z.los}` : ''}</Text>
      <Text type="supporting">{z.reason}</Text>
    </VStack>)}</VStack>
    <Text type="supporting">운영사 인계 대기 {state.operatorHandoffs}대</Text></>}

    {tab === 'log' && <VStack gap={1}>{state.events.slice(0, 15).map((e) => <Text key={e.id} type="supporting">{time(e.at)} · {e.message}</Text>)}{!state.events.length && <Text type="supporting">아직 기록이 없습니다.</Text>}</VStack>}
  </VStack>;

  const position = active?.position ? { point: active.position.point, accuracy: active.position.accuracy } : null;
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="시연 메뉴" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} startContent={<Text color="secondary">이동 미션 시연 · 합성 자료</Text>} endContent={<HStack gap={4}><Link href="/service">실제 서비스 지도</Link><Link href="/">상품 소개</Link></HStack>} />}>
    {mobile ? <VStack padding={4} gap={4} isScrollable style={{ height: '100%' }}>{panel}</VStack>
      : <HStack height="100%" gap={0} style={{ minHeight: 0, overflow: 'hidden' }}>
        <VStack as="aside" width="26rem" height="100%" padding={5} gap={4} isScrollable style={{ flexShrink: 0, borderInlineEnd: 'var(--border-width) solid var(--color-border)', background: 'var(--color-background-surface)' }} aria-label="이동 미션 시연 패널">{panel}</VStack>
        <VStack height="100%" style={{ flex: 1, minWidth: 0, position: 'relative' }}><ZoneMap zones={zones} vehicles={vehicles} selectedVehicleId={picked} onVehicleSelect={onVehicleSelect} areas={areas} routes={routes} selectedId={null} onSelect={onSelect} onBoundsChange={onBoundsChange} focus={focus ?? overview} position={position} /></VStack>
      </HStack>}
  </AppShell>;
}
