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
import { Card } from '@astryxdesign/core/Card';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
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
// Prose sits in tinted cards; full-width filled shapes are only ever tappable actions.
const Box = ({ tone = 'muted', children }) => <Card variant={tone} padding={4}><VStack gap={2}>{children}</VStack></Card>;
const Act = (props) => <Button size="lg" width="100%" variant="primary" {...props} />;

export default function MobileDemo() {
  const [state, setState] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  // Main flow (pivot 2026-11-22): return a scooter; only inside a towing-risk (penalty) area does it ask for one photo.
  const [mode, setMode] = useState('return'); const [returned, setReturned] = useState(null);
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
  // Live penalty zones (same public verdicts as /service, at the real time). Refreshed every minute; on failure they are
  // dropped rather than left stale.
  const [crowd, setCrowd] = useState(null);
  useEffect(() => {
    let controller;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      fetch(`/api/zones?at=${encodeURIComponent(new Date().toISOString())}`, { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zones'))))
        .then((d) => setCrowd({ at: d.at, zones: d.status === 'ready' ? d.zones.filter((z) => z.kind === 'penalty') : [] }))
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
  useEffect(() => { setFocus(active ? { points: active.route } : mode === 'return' ? { point: me.point } : nearby.length ? { points: [me.point, ...nearby.map((s) => s.point)] } : { point: me.point }); }, [me, nearbyKey, active?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const inCell = ([lat, lng], [south, west, north, east]) => lat >= south && lat <= north && lng >= west && lng <= east;
  const zoneHere = (crowd?.zones ?? []).find((z) => inCell(me.point, z.bounds));
  // Demo spots in 강남구: the busiest towing addresses' first cell, and a point just north of the top one that no cell covers.
  const firsts = [...new Map((crowd?.zones ?? []).map((z) => [z.address, z])).values()].slice(0, 3);
  const outside = firsts[0] && [firsts[0].bounds[2] + 0.0015, firsts[0].point[1]];
  const returnSpots = [...firsts.map((z) => ({ label: `${z.address.replace(/^서울특별시 \S+구 /, '')} (구역 안)`, point: z.point })),
    ...(outside && !(crowd?.zones ?? []).some((z) => inCell(outside, z.bounds)) ? [{ label: '구역 밖 (예시 위치)', point: outside }] : [])];
  // Start the return demo inside the first 강남구 cell instead of the mission demo's 관악구 standpoint.
  const firstSpot = returnSpots[0]?.label;
  useEffect(() => { if (firstSpot && me.label === SPOTS[0].label) setMe({ ...returnSpots[0], accuracy: 0 }); }, [firstSpot]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickSpot = (spot) => { setMe({ ...spot, accuracy: 0 }); setReturned(null); takeShot(null); setMessage(''); };
  const statusText = { open: '주차존 개방', reduced: '일부 개방', closed: '페널티 유지', unknown: '확인 중' };
  const statusTone = { open: 'green', reduced: 'orange', closed: 'red' };
  // One dropdown for where I am: my GPS, or a demo spot.
  const spotPicker = (spots, onPick) => <Selector label="위치" width="100%" value={me.label} isDisabled={locating || locked}
    options={[{ value: '내 위치', label: locating ? '내 위치 확인 중…' : '내 위치' }, ...spots.map((s) => s.label)]}
    onChange={(value) => (value === '내 위치' ? locate() : onPick(spots.find((s) => s.label === value)))} />;
  const alert = message && <Card variant="yellow" padding={3}><Text aria-live="assertive" weight="bold">{message}</Text></Card>;
  const cameraInput = <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { takeShot(e.target.files?.[0] ?? null); e.target.value = ''; }} />;
  const returnSheet = <VStack gap={4}>
    <Heading level={2}>여기에 반납할까요?</Heading>
    {spotPicker(returnSpots, pickSpot)}
    {alert}
    {!crowd ? <Box><Text role="status">페널티 구역을 확인하고 있어요.</Text></Box> : crowd.failed ? <Box><Text>페널티 구역 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</Text></Box>
    : returned ? <>
      <Box tone={returned === 'ok' ? 'green' : 'orange'}>
        <Heading level={3}>{returned === 'ok' ? '반납 완료 (모의)' : '다시 세워 주세요 (모의)'}</Heading>
        <Text>{returned === 'ok' ? '보행을 막지 않는 자리로 확인했어요.' : '횡단보도·점자블록·보도 중앙·차도를 막지 않게 옮긴 뒤 다시 찍어 주세요.'}</Text>
      </Box>
      <Act label={returned === 'ok' ? '처음으로' : '다시 찍기'} onClick={() => { setReturned(null); takeShot(null); }} />
    </>
    : !zoneHere ? <>
      <Box tone="green"><Text type="label">견인 위험 구역 아님</Text><Text>사진 없이 바로 반납돼요.</Text></Box>
      <Act label="반납하기 (모의)" onClick={() => setReturned('ok')} />
    </> : <>
      <Box tone={statusTone[zoneHere.status] ?? 'muted'}>
        <Text type="label">{statusText[zoneHere.status]} · {zoneHere.name}</Text>
        <Text>{zoneHere.reason}</Text>
      </Box>
      <Box>
        <Text type="label">견인 위험 구역 · 2025년 {zoneHere.towingCount}건</Text>
        <Text>세워 둔 모습을 한 장 찍어 주세요. 차도·보도 중앙·횡단보도·점자블록을 막는지 봅니다.</Text>
      </Box>
      {cameraInput}
      {shot ? <>
        <Thumbnail src={shot.url} alt="찍은 반납 사진 미리보기" label={shot.name} />
        <Text type="supporting">사진은 서버로 보내지 않아요. AI 판독 전이라 결과를 직접 골라요.</Text>
        <Act label="정상 반납으로 시연" onClick={() => setReturned('ok')} />
        <Act label="다시 세우기로 시연" variant="secondary" onClick={() => setReturned('again')} />
      </> : <Act label="카메라로 반납 사진 찍기" onClick={() => camera.current?.click()} />}
    </>}
  </VStack>;

  const sheet = !state ? <Box><Text role="status">{message || '시연을 준비하고 있습니다.'}</Text></Box> : <VStack gap={4}>
    <HStack gap={2} wrap="wrap">{STEPS.map((label, i) => <Text key={label} type="label" color={i === Math.min(step, 2) && !finished ? 'accent' : 'secondary'}>{i + 1}. {label}{i < 2 ? ' ›' : ''}</Text>)}</HStack>
    {alert}

    {finished ? <>
      <Box tone="green"><Heading level={2}>이동 완료! +{state.policy.reward.toLocaleString('ko-KR')}P</Heading><Text>{finished}를 견인되는 자리에서 옮겼어요. (시연 포인트)</Text></Box>
      <Act label="다른 킥보드 보기" onClick={() => { setFinished(null); setMessage(''); }} />
    </> : active ? <>
      <Box>
        <Heading level={2}>{active.scooterId} {arrived ? '세워 두기' : '끌고 이동 중'}</Heading>
        {active.reason && <Text type="label">견인 사유: {active.reason}</Text>}
        {active.status === 'verifying' ? <Text>사진에서 정주차를 확인하지 못했어요. 다시 찍어 주세요.</Text>
          : arrived ? <Text>{protectedMove ? '지정 주차구역 안에 세웠다면' : '빨간 원 밖에 세웠다면'} 주차 모습을 찍어 제출해 주세요.</Text>
          : <Text>{protectedMove ? `${active.destinationName}까지` : active.clearM ? `빨간 원(${active.reason}에서 ${active.clearM}m) 밖으로` : '빨간 원(견인 구역) 밖으로'} 걸어서 끌고 가 주세요. 타고 이동하지 마세요.</Text>}
        <Text type="supporting">{time(active.expiresAt)}까지{protectedMove ? ' · 직선 안내예요' : ''}{active.alarmed ? ' · 경로 이탈 경보 발생' : ''}</Text>
      </Box>
      {!arrived ? <Act label={walkStep ? `끌고 이동 중 ${walkStep}/${WALK_STEPS}` : '끌고 이동 시작 (시연)'} isLoading={walkStep > 0} isDisabled={locked} onClick={walk} />
      : <>
        {cameraInput}
        {shot ? <>
          <Thumbnail src={shot.url} alt="찍은 주차 사진 미리보기" label={shot.name} />
          <Text type="supporting">사진은 서버로 보내지 않아요. 판정은 모의 결과예요.</Text>
          <Act label="이 사진으로 제출" isDisabled={locked} onClick={photo} />
          <Act label="다시 찍기" variant="secondary" isDisabled={locked} onClick={() => camera.current?.click()} />
        </> : <Act label="카메라로 주차 사진 찍기" isDisabled={locked} onClick={() => camera.current?.click()} />}
      </>}
      <Act label="미션 취소" variant="secondary" isDisabled={locked} onClick={() => send({ type: 'cancel', missionId: active.id }, '미션을 취소했어요. 기기는 운영사가 확인합니다.')} />
    </> : chosen ? <>
      <Box>
        <Heading level={2}>{chosen.id}</Heading>
        <Text>나에게서 {Math.round(chosen.distance)}m · {chosen.towingReason ? `견인 사유: ${chosen.towingReason}` : '견인 다발 지점 밖'}</Text>
        {chosen.exit ? <>
          {chosen.rule.kind === 'protected' && <Text weight="bold">운영사 수거 대상이에요. 원하면 직접 옮길 수도 있어요.</Text>}
          <Text type="large">{chosen.rule.guide} {moveText(chosen.exit)} 옮기면 {state.policy.reward.toLocaleString('ko-KR')}P</Text>
          {chosen.exit.designated && <Text type="supporting">가장 가까운 서울시 지정 PM 주차구역으로 직선 안내해요.</Text>}
        </> : <Text>{chosen.handoff ? '운영사가 확인 중인 기기예요.' : chosen.towingKind === 'grace' ? '즉시 견인 사유가 아니라서 미션이 없어요.' : '정상 위치라 옮길 필요가 없어요.'}</Text>}
      </Box>
      {chosen.exit && <Act label="잠금 해제하고 시작" isDisabled={locked} onClick={() => start(chosen)} />}
      <Act label="목록으로" variant="secondary" onClick={() => setPicked(null)} />
    </> : <>
      <HStack hAlign="between" vAlign="center" gap={2}><Heading level={2}>내 주변 킥보드</Heading><Text type="label" color="accent">미션 {nearby.filter((s) => s.exit).length}건</Text></HStack>
      {spotPicker(SPOTS, (spot) => setMe({ ...spot, accuracy: 0 }))}
      {nearby.length ? <VStack gap={2}>{nearby.map((s) => <Card key={s.id} variant="muted" padding={3}><HStack hAlign="between" vAlign="center" gap={2}>
        <VStack gap={0}><Text type="label">{s.id} · {Math.round(s.distance)}m</Text><Text type="supporting">{s.exit ? (s.rule.kind === 'protected' ? `보호구역 · 지정 구역까지 ${s.exit.distanceM}m` : `${s.towingReason} · ${s.exit.distanceM}m 이동`) : s.handoff ? '운영사 확인 중' : s.towingKind === 'grace' ? `${s.towingReason} · 즉시 견인 사유 아님` : '정상 주차'}</Text></VStack>
        <Button label={s.exit ? '미션 보기' : '보기'} size="sm" variant={s.exit ? 'primary' : 'secondary'} onClick={() => setPicked(s.id)} />
      </HStack></Card>)}</VStack>
      : <Box><Text>{NEAR_M}m 안에 킥보드가 없어요. 위치를 시연 위치로 바꿔 주세요.</Text></Box>}
    </>}

    <Divider />
    <Button label={tools ? '시연 도구 닫기' : '시연 도구'} size="sm" variant="secondary" aria-expanded={tools} onClick={() => setTools((v) => !v)} />
    {tools && <VStack gap={3}>
      <Box><Text type="supporting">시연 시각 {time(state.now)} · 포인트 {state.points.toLocaleString('ko-KR')}P · 오늘 미션 {state.todayCount}/{state.policy.dailyLimit} · 운영사 인계 {state.operatorHandoffs}대</Text></Box>
      <CheckboxInput label="다음 잠금 해제를 실패로 시연" value={failUnlock} onChange={setFailUnlock} />
      <HStack gap={2} wrap="wrap">
        {active?.status === 'moving' && <Button label="경로 이탈 위치 보내기" size="sm" variant="secondary" isDisabled={locked} onClick={() => send({ type: 'position', missionId: active.id, point: [active.route[0][0] + 0.002, active.route[0][1] + 0.002], accuracy: 8, observedAt: state.now }, '경로를 벗어난 위치를 보냈어요 (모의 경보).')} />}
        {active && <Button label="사진 판별 불가로 제출" size="sm" variant="secondary" isDisabled={locked || !arrived} onClick={() => send({ type: 'complete', missionId: active.id, photoPresent: true, verdict: 'uncertain' }, '판별할 수 없어 포인트를 주지 않았어요.')} />}
        <Button label="10분 진행" size="sm" variant="secondary" isDisabled={locked} onClick={() => send({ type: 'advance', minutes: 10 }, '시연 시계를 10분 진행했어요.')} />
        <Button label="시연 초기화" size="sm" variant="destructive" isDisabled={locked} onClick={() => { if (window.confirm('시연 미션·포인트·기록을 처음으로 되돌릴까요?')) { setFinished(null); setPicked(null); send({ type: 'reset', confirm: true }, '시연을 초기화했어요.'); } }} />
      </HStack>
      <VStack gap={1}>{state.events.slice(0, 8).map((e) => <Text key={e.id} type="supporting">{time(e.at)} · {e.message}</Text>)}</VStack>
    </VStack>}
  </VStack>;

  // During a mission the walker and the scooter share the last server-accepted point (or the glide toward it).
  const missionPoint = active && (walkPoint ?? active.position?.point ?? active.route[0]);
  const missionVehicles = active ? [{ id: active.scooterId, point: missionPoint, label: `${active.scooterId} · 끌고 이동 중 (시연·모의 위치)` }] : vehicles;
  const position = mode === 'return' && !active ? { point: me.point, accuracy: me.accuracy || 8 } : active?.position || walkPoint ? { point: missionPoint, accuracy: active.position?.accuracy ?? 8 } : { point: me.point, accuracy: me.accuracy || 8 };
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="시민 앱 시연" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} startContent={<Text type="supporting">시연 · 합성 자료</Text>} endContent={<Text type="label">{state ? `${state.points.toLocaleString('ko-KR')}P` : ''}</Text>} />}>
    <VStack height="100%" gap={0} style={{ minHeight: 0 }}>
      <VStack style={{ height: '45%', minHeight: 0, position: 'relative', flexShrink: 0 }}>
        {active && !no3d ? <Suspense fallback={<Text role="status">3D 지도를 불러오고 있어요.</Text>}><WalkMap3D route={active.route} point={missionPoint} clearM={active.clearM} startLabel={`견인 위치 · ${active.reason ?? '견인 구역'}`} targetLabel={protectedMove ? active.destinationName : '옮길 목표 지점 (원 밖 아무 곳)'} scooterLabel={`${active.scooterId} · 끌고 이동 중 (시연·모의 위치)`} onFail={on3dFail} /></Suspense>
        : <ZoneMap zones={active ? [] : crowd?.zones ?? []} designated={active ? [] : state?.designated ?? []} vehicles={mode === 'return' ? [] : missionVehicles} selectedVehicleId={active ? active.scooterId : picked} onVehicleSelect={onVehicleSelect} areas={mode === 'return' ? [] : areas} routes={active ? [active.route] : []} selectedId={null} onSelect={noop} onBoundsChange={noop} focus={focus} position={position} fitMaxZoom={active ? 19 : 17} />}
      </VStack>
      <VStack padding={4} gap={4} isScrollable style={{ flex: 1, minHeight: 0 }} aria-label={mode === 'return' ? '반납 패널' : '미션 패널'}>
        {!active && <SegmentedControl label="기능" layout="fill" value={mode} onChange={(value) => {
          // Each tab has its own demo area (return: 강남구 cells, mission: 관악구 scooters); my GPS position stays.
          const spots = value === 'mission' ? SPOTS : returnSpots;
          if (me.label !== '내 위치' && spots[0] && !spots.some((s) => s.label === me.label)) setMe({ ...spots[0], accuracy: 0 });
          setMode(value); setMessage('');
        }}><SegmentedControlItem value="return" label="반납" /><SegmentedControlItem value="mission" label="이동 미션" /></SegmentedControl>}
        {mode === 'return' && !active ? returnSheet : sheet}
      </VStack>
    </VStack>
  </AppShell>;
}
