import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import ZoneMap from './ZoneMap';
// MapLibre is large; load it only when a mission starts.
const WalkMap3D = lazy(() => import('./WalkMap3D'));
import { distanceM, walkSteps } from '../server/engine.mjs';

// Citizen app walk-through on synthetic data: scooters, unlock, GPS, photo check and points are all mock.
const NEAR_M = 500;
// Standpoints a short walk from the real towing hotspots, for viewers who are not in 관악구.
const SPOTS = [{ label: '신림역 주변', point: [37.4848, 126.9282] }, { label: '봉천동 주변', point: [37.4800, 126.9430] }];
const STEPS = ['킥보드 선택', '끌고 이동', '사진 확인'];
// Demo walk: positions sent to the server one by one; the marker only glides to a point after the server accepted it.
const WALK_STEPS = 4; const GLIDE_MS = 1200;
const moveText = (exit) => exit.designated ? `${exit.name}까지 ${exit.distanceM}m` : `${exit.distanceM}m만`;
const time = (value) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const row = { borderBottom: 'var(--border-width) solid var(--color-border)' };

export default function MobileDemo() {
  const [state, setState] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [me, setMe] = useState({ ...SPOTS[0], accuracy: 0 }); const [locating, setLocating] = useState(false);
  const [picked, setPicked] = useState(null); const [finished, setFinished] = useState(null);
  const [no3d, setNo3d] = useState(false); const on3dFail = useCallback(() => setNo3d(true), []);
  const [tools, setTools] = useState(false); const [failUnlock, setFailUnlock] = useState(false); const [focus, setFocus] = useState(null);
  // The parking photo stays in this browser as a local preview; only "a photo was taken" reaches the mock verdict.
  const camera = useRef(null); const [shot, setShot] = useState(null);
  const takeShot = (file) => setShot((old) => { if (old) URL.revokeObjectURL(old.url); return file && file.type.startsWith('image/') ? { url: URL.createObjectURL(file), name: file.name } : null; });
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);
  const load = useCallback(() => fetch('/api/demo/state', { cache: 'no-store' }).then((r) => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error)))).then(setState).catch((e) => setMessage(e.message || '시연 상태를 불러오지 못했습니다.')), []);
  useEffect(() => { load(); }, [load]);
  // Live crowd zones (same public verdicts as /service, at the real time): only crowded pieces exist as zones. Refreshed every
  // minute; on failure they are dropped rather than left stale.
  const [crowd, setCrowd] = useState(null);
  useEffect(() => {
    let controller;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      fetch(`/api/zones?active=1&at=${encodeURIComponent(new Date().toISOString())}`, { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zones'))))
        .then((d) => setCrowd({ at: d.at, zones: d.status === 'ready' ? d.zones.filter((z) => z.kind === 'area' && (z.status === 'closed' || z.status === 'reduced')) : [] }))
        .catch(() => { if (!controller.signal.aborted) setCrowd({ failed: true, zones: [] }); });
    };
    refresh(); const timer = setInterval(refresh, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); controller?.abort(); };
  }, []);
  const send = async (action, done) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/demo/command', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-PM-Demo': '1' }, body: JSON.stringify(action), signal: AbortSignal.timeout(10_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? '요청을 처리하지 못했습니다.');
      setState(data.state); if (done) setMessage(done); return data.result;
    } catch (error) { setMessage(error.name === 'TimeoutError' ? '서버 응답이 없습니다.' : error.message); await load(); return null; } finally { setBusy(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setMessage('이 브라우저에서는 위치를 확인할 수 없습니다. 시연 위치를 골라 주세요.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((r) => { setLocating(false); setMe({ point: [r.coords.latitude, r.coords.longitude], accuracy: r.coords.accuracy, label: '내 위치' }); },
      (e) => { setLocating(false); setMessage(e.code === 1 ? '위치 권한을 허용하지 않았습니다. 시연 위치를 골라 주세요.' : '위치를 확인하지 못했습니다. 시연 위치를 골라 주세요.'); }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  };

  const [walkStep, setWalkStep] = useState(0); const [walkPoint, setWalkPoint] = useState(null);
  const active = state?.missions.find((m) => ['moving', 'verifying'].includes(m.status));
  // Stay on the walking screen until every step is sent, even once a late step is inside the arrival radius.
  const arrived = walkStep === 0 && !!active?.position && distanceM(active.position.point, active.target) <= 15;
  const offers = new Map((state?.offers ?? []).map((o) => [o.id, o]));
  const nearby = (state?.scooters ?? []).filter((s) => s.point).map((s) => ({ ...s, distance: distanceM(me.point, s.point), exit: offers.get(s.id)?.destinations[0], rule: offers.get(s.id)?.rule }))
    .filter((s) => s.distance <= NEAR_M).sort((a, b) => !!b.exit - !!a.exit || a.distance - b.distance);
  const chosen = nearby.find((s) => s.id === picked);
  const vehicles = useMemo(() => nearby.map((s) => ({ id: s.id, point: s.point, alert: !!s.towingArea, label: `${s.id} · ${s.towingReason ? `견인 사유: ${s.towingReason}${s.exit ? ' · 미션 가능' : ''}` : '정상 주차'}` })), [nearby]);
  const areas = useMemo(() => [...(state?.towingAreas ?? []).map((a) => ({ point: a.point, radiusM: a.radiusM, label: `${a.name.replace('구역', '다발 지점')} (시연 가정 반경 ${a.radiusM}m)` })),
    // Other real towing hotspots nearby, shaded the same way so the map reads like a rental app's no-parking areas.
    ...(state?.towingSpots ?? []).map((h) => ({ point: h.point, radiusM: 30, label: `${h.address} · 2025 견인 ${h.count}건 (가정 반경 30m · 금지 경계 아님)` }))], [state]);
  // Frame me and the nearby PMs together (the map is short); during a mission, frame the route.
  const nearbyKey = nearby.map((s) => s.id).join();
  useEffect(() => { setFocus(active ? { points: active.route } : nearby.length ? { points: [me.point, ...nearby.map((s) => s.point)] } : { point: me.point }); }, [me, nearbyKey, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onVehicleSelect = useCallback((id) => { setPicked(id); setFinished(null); }, []);
  const noop = useCallback(() => {}, []);

  const start = async (s) => { if (await send({ type: 'accept', scooterId: s.id, destinationId: s.exit.id, failUnlock }, `잠금이 해제됐어요 (모의). ${moveText(s.exit)} 끌고 가면 돼요.`)) setPicked(null); };
  const locked = busy || walkStep > 0;
  const glide = (from, to) => new Promise((resolve) => {
    // Reduced motion: jump instead of gliding, but keep the pause so each step is still seen.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setWalkPoint(to); setTimeout(resolve, GLIDE_MS); return; }
    const begin = performance.now();
    const frame = (now) => { const t = Math.min(1, (now - begin) / GLIDE_MS); setWalkPoint([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]); if (t < 1) requestAnimationFrame(frame); else resolve(); };
    requestAnimationFrame(frame);
  });
  const walk = async () => {
    const { id, route } = active; const observedAt = state.now; let from = active.position?.point ?? route[0];
    const steps = walkSteps(route, WALK_STEPS);
    // Hold the marker where it is while a step is in flight; otherwise it jumps to the accepted point and back before gliding.
    setWalkPoint(from);
    for (const [i, point] of steps.entries()) {
      setWalkStep(i + 1);
      const last = i === steps.length - 1;
      if (!await send({ type: 'position', missionId: id, point, accuracy: 8, observedAt }, last ? '목적지에 도착했어요. 세워 둔 모습을 찍어 주세요.' : null)) break;
      await glide(from, point); from = point;
    }
    setWalkStep(0); setWalkPoint(null);
  };
  const photo = async () => {
    if (!shot) { setMessage('주차한 모습을 먼저 찍어 주세요.'); return; }
    const id = active.id; const scooterId = active.scooterId;
    if (await send({ type: 'complete', missionId: id, photoPresent: true, verdict: 'approved' })) { setFinished(scooterId); takeShot(null); }
  };
  const step = finished ? 3 : !active ? 0 : arrived ? 2 : 1;
  const protectedMove = active?.kind === 'protected';

  const sheet = !state ? <Text role="status">{message || '시연을 준비하고 있습니다.'}</Text> : <VStack gap={4}>
    <HStack gap={2} wrap="wrap">{STEPS.map((label, i) => <Text key={label} type="label" color={i === Math.min(step, 2) && !finished ? 'accent' : 'secondary'}>{i + 1}. {label}{i < 2 ? ' ›' : ''}</Text>)}</HStack>
    {message && <Text aria-live="assertive" weight="bold">{message}</Text>}

    {finished ? <VStack gap={3}>
      <Heading level={2}>이동 완료! +{state.policy.reward.toLocaleString('ko-KR')}P</Heading>
      <Text>{finished}를 견인되는 자리에서 옮겼어요. 보도가 한결 넓어졌어요.</Text>
      <Text type="supporting">시연 포인트입니다. 실제 지급은 운영사 제휴 후 정해집니다.</Text>
      <Button label="다른 킥보드 보기" onClick={() => { setFinished(null); setMessage(''); }} />
    </VStack> : active ? <VStack gap={3}>
      <Heading level={2}>{active.scooterId} {arrived ? '세워 두기' : '끌고 이동 중'}</Heading>
      {active.reason && <Text type="supporting">견인 사유: {active.reason}</Text>}
      {active.status === 'verifying' ? <Text>사진에서 정주차를 확인하지 못했어요. 다시 찍어 주세요.</Text>
        : arrived ? <Text>{protectedMove ? '지정 주차구역 안에 세웠다면' : '빨간 원 밖에 세웠다면'} 주차 모습을 찍어 제출해 주세요.</Text>
        : <Text type="large">{protectedMove ? `${active.destinationName}까지` : active.clearM ? `빨간 원(${active.reason}에서 ${active.clearM}m) 밖으로` : '빨간 원(견인 구역) 밖으로'} 걸어서 끌고 가 주세요. 타고 이동하지 마세요.</Text>}
      <Text type="supporting">{time(active.expiresAt)}까지 · {protectedMove ? '지도 선은 직선 안내예요. 실제 보도를 따라 가 주세요' : '원 밖이면 어디든 괜찮아요'}{active.alarmed ? ' · 경로 이탈 경보 발생' : ''}</Text>
      {!arrived ? <VStack gap={2}>
        <Button label={walkStep ? `끌고 이동 중 ${walkStep}/${WALK_STEPS}` : '끌고 이동 시작 (시연)'} isLoading={walkStep > 0} isDisabled={locked} onClick={walk} />
        <Text type="supporting" aria-live="polite">{walkStep ? `모의 위치 ${walkStep}/${WALK_STEPS}을 서버에 보내고 있어요.` : `시연에서는 경로를 따라 모의 위치 ${WALK_STEPS}개를 차례로 서버에 보내요. 지도의 킥보드는 서버가 받은 위치로만 움직여요.`}</Text>
      </VStack> : <VStack gap={3}>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { takeShot(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        {shot ? <>
          <Thumbnail src={shot.url} alt="찍은 주차 사진 미리보기" label={shot.name} />
          <Text type="supporting">사진은 이 휴대폰 화면에서만 보여 주고 서버로 보내지 않아요. 정주차 판정은 모의 결과입니다.</Text>
          <HStack gap={2} wrap="wrap"><Button label="이 사진으로 제출" isDisabled={locked} onClick={photo} /><Button label="다시 찍기" variant="secondary" isDisabled={locked} onClick={() => camera.current?.click()} /></HStack>
        </> : <Button label="카메라로 주차 사진 찍기" isDisabled={locked} onClick={() => camera.current?.click()} />}
      </VStack>}
      <Button label="미션 취소" variant="ghost" isDisabled={locked} onClick={() => send({ type: 'cancel', missionId: active.id }, '미션을 취소했어요. 기기는 운영사가 확인합니다.')} />
    </VStack> : chosen ? <VStack gap={3}>
      <Heading level={2}>{chosen.id}</Heading>
      <Text>나에게서 {Math.round(chosen.distance)}m · {chosen.towingReason ? `견인 사유: ${chosen.towingReason}` : '견인 다발 지점 밖'}</Text>
      {chosen.exit ? <>
        {chosen.rule.kind === 'protected' && <Text weight="bold">운영사 수거 대상이에요. 원하면 직접 옮길 수도 있어요.</Text>}
        <Text type="large">{chosen.rule.guide} {moveText(chosen.exit)} 옮기면 {state.policy.reward.toLocaleString('ko-KR')}P</Text>
        <Text type="supporting">{chosen.exit.designated ? '보호구역 경계 자료가 없어 가장 가까운 서울시 지정 PM 주차구역으로 안내해요. 정원 정보는 없고, 길 안내는 직선이며, 제한시간은 거리만큼 늘어나요.'
          : `${chosen.rule.assumed ? `기준 ${chosen.rule.clearM}m는 시연 가정이에요.` : `규정 ${chosen.rule.clearM}m`}에 여유 ${state.policy.exitMarginM}m를 더했어요. 시설의 실제 위치 자료가 없어 기기 바로 옆에 있다고 가정해요.`}</Text>
        <Button label="잠금 해제하고 시작" isDisabled={locked} onClick={() => start(chosen)} /></> : <Text>{chosen.handoff ? '운영사가 확인 중인 기기예요.' : chosen.towingKind === 'grace' ? '즉시 견인 사유가 아니라서 미션이 없어요.' : '정상 위치라 옮길 필요가 없어요.'}</Text>}
      <Button label="목록으로" variant="ghost" onClick={() => setPicked(null)} />
    </VStack> : <VStack gap={3}>
      <HStack hAlign="between" vAlign="center" gap={2}><Heading level={2}>내 주변 킥보드</Heading><Text type="label" color="accent">미션 {nearby.filter((s) => s.exit).length}건</Text></HStack>
      <HStack gap={2} wrap="wrap">
        <Button label={locating ? '확인 중' : '내 위치'} size="sm" variant={me.label === '내 위치' ? 'primary' : 'secondary'} isLoading={locating} onClick={locate} />
        {SPOTS.map((spot) => <Button key={spot.label} label={spot.label} size="sm" variant={me.label === spot.label ? 'primary' : 'ghost'} aria-pressed={me.label === spot.label} onClick={() => setMe({ ...spot, accuracy: 0 })} />)}
      </HStack>
      <VStack gap={0}>{nearby.map((s) => <HStack key={s.id} hAlign="between" vAlign="center" gap={2} paddingBlock={2} style={row}>
        <VStack gap={0}><Text type="label">{s.id} · {Math.round(s.distance)}m</Text><Text type="supporting">{s.exit ? (s.rule.kind === 'protected' ? `보호구역 · 운영사 수거 대상 · 지정 구역까지 ${s.exit.distanceM}m` : `${s.towingReason} · ${s.exit.distanceM}m 이동`) : s.handoff ? '운영사 확인 중' : s.towingKind === 'grace' ? `${s.towingReason} · 즉시 견인 사유 아님` : '정상 주차'}</Text></VStack>
        <Button label={s.exit ? '미션 가능' : '보기'} size="sm" variant={s.exit ? 'primary' : 'ghost'} onClick={() => setPicked(s.id)} />
      </HStack>)}</VStack>
      {!nearby.length && <Text type="supporting">{NEAR_M}m 안에 킥보드가 없어요. 시연 킥보드는 관악구에만 있어 위의 시연 위치를 골라 주세요.</Text>}
    </VStack>}

    <Divider />
    <Button label={tools ? '시연 도구 닫기' : '시연 도구'} size="sm" variant="ghost" aria-expanded={tools} onClick={() => setTools((v) => !v)} />
    {tools && <VStack gap={3}>
      <Text type="supporting">시연 시각 {time(state.now)} · 포인트 {state.points.toLocaleString('ko-KR')}P · 오늘 미션 {state.todayCount}/{state.policy.dailyLimit} · 운영사 인계 {state.operatorHandoffs}대</Text>
      <CheckboxInput label="다음 잠금 해제를 실패로 시연" value={failUnlock} onChange={setFailUnlock} />
      <HStack gap={2} wrap="wrap">
        {active?.status === 'moving' && <Button label="경로 이탈 위치 보내기" size="sm" variant="secondary" isDisabled={locked} onClick={() => send({ type: 'position', missionId: active.id, point: [active.route[0][0] + 0.002, active.route[0][1] + 0.002], accuracy: 8, observedAt: state.now }, '경로를 벗어난 위치를 보냈어요 (모의 경보).')} />}
        {active && <Button label="사진 판별 불가로 제출" size="sm" variant="secondary" isDisabled={locked || !arrived} onClick={() => send({ type: 'complete', missionId: active.id, photoPresent: true, verdict: 'uncertain' }, '판별할 수 없어 포인트를 주지 않았어요.')} />}
        <Button label="10분 진행" size="sm" variant="secondary" isDisabled={locked} onClick={() => send({ type: 'advance', minutes: 10 }, '시연 시계를 10분 진행했어요.')} />
        <Button label="시연 초기화" size="sm" variant="ghost" isDisabled={locked} onClick={() => { if (window.confirm('시연 미션·포인트·기록을 처음으로 되돌릴까요?')) { setFinished(null); setPicked(null); send({ type: 'reset', confirm: true }, '시연을 초기화했어요.'); } }} />
      </HStack>
      <VStack gap={1}>{state.events.slice(0, 8).map((e) => <Text key={e.id} type="supporting">{time(e.at)} · {e.message}</Text>)}</VStack>
    </VStack>}
  </VStack>;

  // During a mission the walker and the scooter share the last server-accepted point (or the glide toward it).
  const missionPoint = active && (walkPoint ?? active.position?.point ?? active.route[0]);
  const missionVehicles = active ? [{ id: active.scooterId, point: missionPoint, label: `${active.scooterId} · 끌고 이동 중 (시연·모의 위치)` }] : vehicles;
  const position = active?.position || walkPoint ? { point: missionPoint, accuracy: active.position?.accuracy ?? 8 } : { point: me.point, accuracy: me.accuracy || 8 };
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="시민 앱 시연" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} startContent={<Text type="supporting">시연 · 합성 자료</Text>} endContent={<Text type="label">{state ? `${state.points.toLocaleString('ko-KR')}P` : ''}</Text>} />}>
    <VStack height="100%" gap={0} style={{ minHeight: 0 }}>
      <VStack style={{ height: '45%', minHeight: 0, position: 'relative', flexShrink: 0 }}>
        {active && !no3d ? <Suspense fallback={<Text role="status">3D 지도를 불러오고 있어요.</Text>}><WalkMap3D route={active.route} point={missionPoint} clearM={active.clearM} startLabel={`견인 위치 · ${active.reason ?? '견인 구역'}`} targetLabel={protectedMove ? active.destinationName : '옮길 목표 지점 (원 밖 아무 곳)'} scooterLabel={`${active.scooterId} · 끌고 이동 중 (시연·모의 위치)`} onFail={on3dFail} /></Suspense>
        : <ZoneMap zones={active ? [] : crowd?.zones ?? []} designated={active ? [] : state?.designated ?? []} vehicles={missionVehicles} selectedVehicleId={active ? active.scooterId : picked} onVehicleSelect={onVehicleSelect} areas={areas} routes={active ? [active.route] : []} selectedId={null} onSelect={noop} onBoundsChange={noop} focus={focus} position={position} fitMaxZoom={active ? 19 : 17} />}
      </VStack>
      <VStack padding={4} gap={4} isScrollable style={{ flex: 1, minHeight: 0 }} aria-label="미션 패널">{sheet}</VStack>
    </VStack>
  </AppShell>;
}
