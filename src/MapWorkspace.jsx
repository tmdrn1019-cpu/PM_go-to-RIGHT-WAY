// Astryx shell-side-nav frame adapted into a map workspace with a mobile bottom panel.
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog } from '@astryxdesign/core/Dialog';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { filterZones } from './zone-search.mjs';
import { distanceM } from '../server/engine.mjs';
import ZoneMap from './ZoneMap';
import PublicDataPanel from './PublicDataPanel';
import ExternalDataPanel from './ExternalDataPanel';

const statuses = { open: '개방', reduced: '축소 운영', closed: '폐쇄', unknown: '확인 중' };
// Badge each P sign carries on the map, so the legend matches shapes, not only colours.
const signs = { open: '', reduced: '↓', closed: '×', unknown: '?' };
const colors = { open: 'var(--color-text-success)', reduced: 'var(--color-text-warning)', closed: 'var(--color-text-error)', unknown: 'var(--color-text-secondary)' };
const types = { scooter: '킥보드', ebike: '전기자전거' };
const formatTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '—';
const clockTime = (value) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const SPEEDS = [[600, '1초 = 10분'], [60, '1초 = 1분'], [1, '실제 속도']];
const distance = (meters) => meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
const surface = { background: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)', boxShadow: 'var(--shadow-med)' };

function ZoneStatus({ zone }) { return <Text type="label" style={{ color: colors[zone.status] }}>{statuses[zone.status]}</Text>; }

function ZoneDetails({ zone }) {
  const [more, setMore] = useState(false);
  return <VStack gap={5}>
    <VStack gap={2}><ZoneStatus zone={zone} /><Heading level={2}>{zone.name}</Heading><Text color="secondary">{zone.address}</Text></VStack>
    <VStack gap={1}><Text color="secondary">{zone.available === null ? '지금 수용 정원' : '지금 반납 가능'}</Text><Text type="display-3" color="accent">{zone.available ?? zone.capacity}대</Text></VStack>
    <Text type="large">{zone.reason}</Text>
    {more ? <VStack gap={3}><Divider />
      <Text>정원 {zone.capacity}대 · 현재 주차 {zone.parked ?? '운영사 연동 후 확인'}{zone.parked === null ? '' : '대'} · {zone.vehicleTypes.map((type) => types[type]).join(' · ')}</Text>
      {zone.kind === 'area' && <VStack gap={2}>
        <Text type="supporting">근거: OpenStreetMap {({ residential: '주거', commercial: '상업', retail: '판매' })[zone.basis.landuse]} 토지이용 구역(약 {Math.round(zone.basis.areaM2 / 100) / 100}ha)을 그대로 쓴 반납 구역입니다. 평소에는 열려 있고, 아래 두 기준 중 더 엄격한 쪽으로 축소·폐쇄합니다. 현장 확인·운영 승인은 하지 않았습니다.</Text>
        {zone.checks.map((check) => <Text key={check.label} type="supporting">{check.label} · {statuses[check.status]}: {check.reason}</Text>)}
        {zone.defaultOpen && <Text type="supporting">이 시간에는 1km 안 지하철역 승하차와 300m 안 2015 보도 조사 자료가 모두 없어 기본 개방입니다(가정).</Text>}
        {zone.basis.station && <Text type="supporting">역 기준: {zone.basis.station.name}역 {zone.basis.station.month} 시간대별 승하차 일평균을 서울 {zone.thresholds.stations}개 역·{zone.thresholds.stationHours.toLocaleString('ko-KR')}개 역·시간과 비교해 상위 {zone.thresholds.closeShare * 100}%({zone.thresholds.close.toLocaleString('ko-KR')}명) 이상 폐쇄, 상위 {zone.thresholds.reduceShare * 100}%({zone.thresholds.reduce.toLocaleString('ko-KR')}명) 이상 축소(비율은 가정). 역 승하차는 주변 보행량의 대리지표입니다.</Text>}
        {zone.basis.walk && <Text type="supporting">보도 기준: {zone.basis.walk.distanceM}m 떨어진 2015 조사 지점 「{zone.basis.walk.spotName}」(보도 폭 {zone.basis.walk.widthM}m). 1시간 보행량 ÷ 4를 15분 값으로 쓰며, 기기 10대 1.2m·5대 0.6m를 뺀 폭으로 LOS를 계산해 D 축소, E~F 폐쇄합니다.{zone.basis.walk.losUsable ? '' : ' 기기를 세우면 남는 폭이 2m 미만이라 이 구역 판정에는 쓰지 않습니다.'} 조사 시간(7~20시) 밖에는 쓰지 않습니다.</Text>}
      </VStack>}
      <Text>다음 변경 {zone.nextChange ? `${({ open: '개방', reduce: '수용량 조절', close: '폐쇄' })[zone.nextChange.type]} ${formatTime(zone.nextChange.at)} KST` : '등록되지 않음'}</Text>
      <Text>{zone.crowdLabel ? `${zone.crowdLabel} ${zone.crowdCount?.toLocaleString('ko-KR') ?? '—'}명` : `15분 보행량 ${(zone.currentPedestrianCount15Min ?? zone.pedestrianCount15Min)?.toLocaleString('ko-KR') ?? '—'}명`}{zone.crowdLabel ? '' : ` · 유효폭 ${zone.effectiveWidthM ?? '—'}m · LOS ${zone.los ?? '—'}`}</Text>
      <Text type="supporting">관측 {formatTime(zone.observedAt)} · {zone.observationSource ?? '자료 확인 중'} · 재고 확인 {formatTime(zone.inventoryObservedAt)} KST. 보행 상황에 따라 바뀔 수 있습니다.</Text>
    </VStack> : <Button label="판정 근거 보기" variant="secondary" onClick={() => setMore(true)} />}
  </VStack>;
}

// Web view: Seoul-designated zones judged from public data, replayed on a fast clock so hour-by-hour changes are visible.
function useZonePlayback() {
  const [clock, setClock] = useState(() => Date.now()); const [speed, setSpeed] = useState(SPEEDS[0][0]); const [playing, setPlaying] = useState(true);
  const [data, setData] = useState(null); const [connection, setConnection] = useState('loading');
  useEffect(() => { if (!playing) return undefined; const timer = setInterval(() => setClock((c) => c + 1000 * speed), 1000); return () => clearInterval(timer); }, [playing, speed]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/zones?active=1&at=${encodeURIComponent(new Date(clock).toISOString())}`, { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zones'))))
      .then((next) => { setData({ status: next.status, counts: next.counts, zones: next.zones, designated: next.designated ?? [], generatedAt: next.at, month: next.month }); setConnection('online'); })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setConnection('offline'); } });
    return () => controller.abort();
  }, [clock]);
  return { data, connection, clock, speed, setSpeed, playing, setPlaying, resetClock: () => setClock(Date.now()) };
}

export default function MapWorkspace() {
  const mobile = useMediaQuery('(max-width: 56rem)');
  const { data, connection, clock, speed, setSpeed, playing, setPlaying, resetClock } = useZonePlayback();
  const loaded = Boolean(data);
  // Frame the crowd zones once on first load; zones that appear later during playback must not move the map.
  useEffect(() => { if (loaded && data.zones.length) setFocus({ points: data.zones.map((zone) => zone.point) }); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState('zones'); const [query, setQuery] = useState('');
  const [vehicleType, setVehicleType] = useState('all'); const [layers, setLayers] = useState(Object.keys(statuses));
  const [bounds, setBounds] = useState(null); const [boundsOnly, setBoundsOnly] = useState(true);
  const [selectedId, setSelectedId] = useState(null); const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState(null); const [position, setPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState(''); const [locating, setLocating] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [towingAreas, setTowingAreas] = useState([]);
  // Synthetic demo devices are fixed for a given build, so one fetch is enough.
  const [synthetic, setSynthetic] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/zones/synthetic-pm', { cache: 'no-store', signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('synthetic'))))
      .then((next) => { if (!next.synthetic || !Array.isArray(next.vehicles)) throw new Error('invalid'); setSynthetic(next); }).catch(() => { if (!controller.signal.aborted) setSynthetic({ failed: true, vehicles: [] }); });
    return () => controller.abort();
  }, []);
  const receiveTowing = useCallback((next, move = false) => { setTowingAreas(next); if (move) setFocus({ points: next.map(row => row.point) }); }, []);
  const receiveVehicles = useCallback((next, move = false) => { setVehicles(next); if (move) setFocus({ points: next.map(row => row.point) }); }, []);
  const bottomFraction = mobile ? expanded ? 0.55 : 0.35 : 0;
  const online = connection === 'online';
  const zones = (data?.zones ?? []).map((zone) => online ? zone : { ...zone, status: 'unknown', capacity: 0, available: 0, reason: '최신 운영 상태를 다시 확인하고 있습니다.' });
  // Crowd zones exist only while crowded (user request 2026-11-21): open area pieces are watched but not shown.
  const active = zones.filter((zone) => zone.kind !== 'area' || zone.status === 'closed' || zone.status === 'reduced');
  const visibleZones = filterZones(active, { query, vehicleType, statuses: layers, bounds: boundsOnly ? bounds : null, origin: position?.point });
  const mapZones = filterZones(active, { query, vehicleType, statuses: layers });
  const selected = zones.find((zone) => zone.id === selectedId);
  // Real TAGO devices and towing analysis get the map to themselves so synthetic devices never mix with real ones.
  const overlay = !['fleet', 'towing'].includes(view);
  const riskVehicles = (synthetic?.vehicles ?? []).filter((v) => v.risk).sort((a, b) => a.risk.distanceM - b.risk.distanceM || a.id.localeCompare(b.id));
  // Phones have no bottom legend (the panel covers it), so the extra layers' key also sits in the bottom panel header there.
  const legend = overlay && <HStack gap={3} wrap="wrap"><Text type="label" color="secondary">P 지정 구역(상태 없음)</Text><Text type="label">점선 = 축소·폐쇄 구역</Text><Text type="label">핀 합성 PM</Text><Text type="label" style={{ color: colors.closed }}>핀! 견인 위험(합성)</Text></HStack>;
  const syntheticMarkers =(synthetic?.vehicles ?? []).map((v) => ({ id: v.id, point: v.point, alert: Boolean(v.risk), label: v.risk ? `합성 ${v.id} · 견인 위험 · ${v.risk.address}에서 ${v.risk.distanceM}m (실제 기기 아님)` : `합성 ${v.id} · 견인 주소 ${synthetic.riskRadiusM}m 밖 (실제 기기 아님)` }));
  const onBoundsChange = useCallback((next) => setBounds(next), []);
  const select = useCallback((id) => { setSelectedId(id); setFocus(null); setView('zones'); setExpanded(true); }, []);
  const switchView = (next) => { if (view === 'fleet' || view === 'towing') setFocus({ points: [] }); setView(next); setSelectedId(null); setExpanded(true); };
  const showAll = () => { setQuery(''); setVehicleType('all'); setLayers(Object.keys(statuses)); setBoundsOnly(false); setSelectedId(null); setFocus({ points: zones.map((zone) => zone.point) }); };
  const locate = () => {
    if (!navigator.geolocation) { setLocationStatus('이 브라우저에서는 위치를 확인할 수 없습니다. 지도를 직접 이동해 주세요.'); return; }
    setLocating(true); setLocationStatus('');
    navigator.geolocation.getCurrentPosition((result) => {
      const next = { point: [result.coords.latitude, result.coords.longitude], accuracy: result.coords.accuracy };
      setSelectedId(null); setPosition(next); setFocus(next); setLocating(false); setLocationStatus(`내 위치를 확인했습니다. 위치 오차 약 ${Math.round(next.accuracy)}m`);
    }, (error) => { setLocating(false); setLocationStatus(error.code === 1 ? '위치 권한을 허용하지 않았습니다. 지도를 직접 이동하거나 주차존 이름으로 검색할 수 있습니다.' : '위치를 확인하지 못했습니다. 지도를 직접 이동해 주세요.'); }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  };
  const dataLabel = connection === 'loading' ? '정보 확인 중' : !online ? '연결 끊김' : data?.status === 'unconfigured' ? '공공데이터 존 자료 준비 전' : `판정 시각 ${clockTime(clock)}`;
  const clockControls = <VStack gap={2}>
    <Text type="label" aria-live="polite">{dataLabel}</Text>
    <Text type="supporting">동작·관악·서초·강남 · 혼잡한 곳에만 축소·폐쇄 존이 생김</Text>
    <HStack gap={2} wrap="wrap">
      <Button label={playing ? '일시정지' : '재생'} size="sm" variant="secondary" aria-pressed={playing} onClick={() => setPlaying((value) => !value)} />
      {SPEEDS.map(([value, label]) => <Button key={value} label={label} size="sm" variant={speed === value ? 'primary' : 'ghost'} aria-pressed={speed === value} onClick={() => setSpeed(value)} />)}
      <Button label="지금으로" size="sm" variant="ghost" onClick={resetClock} />
    </HStack>
  </VStack>;
  const menu = [['help', '이용 안내', '상태 표시와 위치 정보 사용'], ['status', '판정 시계', '재생 속도와 판정 시각'], ['towing', '견인 분석', '견인 다발 주소와 후보지'], ['fleet', 'PM 위치', '공식 기기 위치 조회'], ['public', '공공데이터', '공식 주차구역·보행 관측'], ['risk', '견인 위험 PM', '합성 시연 기기 중 견인 주소 근처 기기']];
  const panelTitle = selected ? selected.name : view === 'zones' ? '주차존 찾기' : view === 'menu' ? '메뉴' : menu.find(([id]) => id === view)?.[1];
  const nav = <HStack gap={2}>{(view !== 'zones' || selected) && <Button label="주차존으로" size="sm" variant="ghost" onClick={() => switchView('zones')} />}{view !== 'menu' && <Button label="메뉴" size="sm" variant="secondary" onClick={() => switchView('menu')} />}</HStack>;
  const filters = <VStack gap={3}><TextInput label="주차존 이름·주소 검색" value={query} onChange={(value) => { setQuery(value); setSelectedId(null); }} hasClear placeholder="주차존 이름 또는 주소" /><Selector label="기기 종류" value={vehicleType} onChange={(value) => { setVehicleType(value); setSelectedId(null); }} options={[{ value: 'all', label: '전체 기기' }, { value: 'scooter', label: '킥보드' }, { value: 'ebike', label: '전기자전거' }]} /></VStack>;
  const body = selected ? <ZoneDetails zone={selected} /> : view === 'menu' ? <VStack gap={0}>{menu.map(([id, label, hint]) => <VStack key={id} gap={1} paddingBlock={3} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}><Button label={label} variant="ghost" onClick={() => switchView(id)} /><Text type="supporting">{hint}</Text></VStack>)}</VStack> : ['towing','fleet'].includes(view) ? <ExternalDataPanel key={view} kind={view} onVehicles={receiveVehicles} onTowing={receiveTowing} /> : view === 'public' ? <PublicDataPanel /> : view === 'risk' ? <VStack gap={4}>
    <Text type="label">합성 시연 자료 · 실제 기기 아님</Text>
    <Text type="supporting">서울은 공식 PM 위치 자료(TAGO)가 없어, {synthetic?.period ?? '2025년'} 서울 견인 상위 주소 주변과 서울시 지정 주차구역에 시연용 기기를 만들어 놓았습니다. 견인 주소 대표점에서 {synthetic?.riskRadiusM ?? 30}m 안이면 견인 위험으로 표시합니다. 반경은 가정이며 법적 반납금지 경계가 아닙니다.</Text>
    {!synthetic ? <Text>합성 기기를 불러오고 있어요.</Text> : synthetic.failed || synthetic.status !== 'ready' ? <Text>합성 기기를 불러오지 못했습니다. 공공데이터 존 자료(npm run build:zones)를 확인해 주세요.</Text> : <>
      <Text>합성 기기 {synthetic.vehicles.length}대 중 견인 위험 {riskVehicles.length}대</Text>
      <VStack gap={0}>{riskVehicles.map((v) => <VStack key={v.id} paddingBlock={3} gap={1} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}><HStack hAlign="between" vAlign="center" gap={2}><Button label={`${v.id} · ${v.risk.distanceM}m`} variant="ghost" size="sm" onClick={() => { setFocus({ point: v.point }); if (mobile) setExpanded(false); }} /><Text type="label" style={{ color: colors.closed }}>견인 위험</Text></HStack><Text type="supporting">{v.risk.address} · 2025 견인 {v.risk.towingCount}건</Text></VStack>)}</VStack>
    </>}
  </VStack> : view === 'status' ? <VStack gap={5}>
    {clockControls}<Text>지금 생긴 혼잡 존 {active.length}곳 · 축소 {data?.counts?.reduced ?? 0}곳 · 폐쇄 {data?.counts?.closed ?? 0}곳 · 지켜보는 구역 조각 {data?.counts?.watched ?? 0}곳</Text>
    <Text type="supporting">평소에는 존이 없고, 혼잡한 곳에만 축소·폐쇄 존이 생깁니다. 동작·관악·서초·강남의 OpenStreetMap 주거·상업·판매 구역을 100m 격자로 잘라 실제 경계를 따르는 작은 조각으로 쓰고, 지하철역 300m 안이나 2015 보도 조사 지점 150m 안의 조각만 지켜봅니다(거리와 격자 크기는 가정). 가장 가까운 역 승하차가 서울 역·시간 상위 15% 이상이면 축소, 상위 5% 이상이면 폐쇄하고, 보행 LOS(D 축소, E~F 폐쇄)도 함께 봐 더 엄격한 쪽을 따릅니다. 견인 자료는 구역 선정에 쓰지 않습니다. 주차 대수는 운영사 연동 후 표시합니다.</Text>
  </VStack> : view === 'help' ? <VStack gap={5}>
    <VStack gap={3}>{Object.entries(statuses).map(([key, label]) => <HStack key={key} gap={3}><Text type="label" style={{ color: colors[key] }}>{label}</Text><Text>{({ open: '현재 운영 중인 주차존', reduced: '수용량을 줄여 운영하는 주차존', closed: '신규 반납을 받지 않는 주차존', unknown: '최신 정보를 확인 중인 주차존' })[key]}</Text></HStack>)}</VStack><Divider /><Text type="supporting">내 위치는 브라우저에서만 쓰며 GPS 좌표를 서버로 보내지 않습니다. 단, 주변 지도 타일 요청은 OpenStreetMap에 전달됩니다. 등록된 주차존만 안내하며, 빈 보도는 주차 허용 공간이 아닙니다.</Text>
  </VStack> : <VStack gap={4}>
    <HStack hAlign="between" vAlign="center" gap={2}><Text color="secondary">{position ? '가까운 순' : boundsOnly ? '지도 범위' : '전체 지역'} · {visibleZones.length}곳</Text><Button label={filtersOpen ? '필터 닫기' : '검색·필터'} size="sm" variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} /></HStack>
    {filtersOpen && <VStack gap={3}>{filters}<HStack gap={2} wrap="wrap">{Object.entries(statuses).map(([key, label]) => <Button key={key} label={label} size="sm" variant={layers.includes(key) ? 'secondary' : 'ghost'} aria-pressed={layers.includes(key)} onClick={() => { setLayers((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]); setSelectedId(null); }} />)}</HStack>
<Button label={boundsOnly ? '지도 범위만' : '전체 지역'} size="sm" variant="ghost" aria-pressed={boundsOnly} onClick={() => setBoundsOnly((value) => !value)} /></VStack>}
    {!visibleZones.length ? <VStack gap={4} paddingBlock={5}><Heading level={2}>{connection === 'loading' ? '주차존을 확인하고 있어요' : !online ? '최신 정보를 확인할 수 없어요' : data?.status === 'unconfigured' ? '주차존 연결을 준비하고 있어요' : data?.status === 'error' ? '운영 정보를 다시 확인하고 있어요' : active.length ? '조건에 맞는 혼잡 존이 없어요' : '지금은 혼잡 존이 없어요'}</Heading><Text color="secondary">{data?.status === 'unconfigured' ? '운영이 확인된 주차존부터 안내합니다.' : active.length ? '검색 조건을 바꾸거나 지도 범위를 넓혀 주세요.' : '혼잡으로 축소·폐쇄된 구역이 없습니다. 횡단보도·점자블록 등 법규상 금지된 곳에는 세우지 마세요.'}</Text><Button label="전체 주차존 보기" onClick={showAll} /></VStack> : <VStack gap={0}>{visibleZones.map((zone) => <VStack key={zone.id} paddingBlock={4} gap={2} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}><HStack hAlign="between" gap={2}><Button label={zone.name} variant="ghost" size="sm" onClick={() => select(zone.id)} /><ZoneStatus zone={zone} /></HStack><Text>{zone.vehicleTypes.map((type) => types[type]).join(' · ')} · {zone.available === null ? `정원 ${zone.capacity}대` : `반납 여유 ${zone.available}대`}{position ? ` · 직선 ${distance(distanceM(position.point, zone.point))}` : ''}</Text></VStack>)}</VStack>}
  </VStack>;
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="지도 서비스 메뉴" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} endContent={<Link href="/mobile">모바일 미션 시연</Link>} />}>
    <HStack height="100%" gap={0} style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {!mobile && <VStack as="aside" width="24rem" height="100%" gap={0} style={{ flexShrink: 0, borderInlineEnd: 'var(--border-width) solid var(--color-border)', background: 'var(--color-background-surface)' }} aria-label="주차존 탐색 패널"><HStack padding={5} hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading>{nav}</HStack><Divider /><VStack key={selected?.id ?? view} padding={5} gap={4} isScrollable style={{ flex: 1, minHeight: 0 }}>{body}</VStack></VStack>}
      <VStack height="100%" style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        <ZoneMap zones={mapZones} vehicles={overlay ? [...vehicles, ...syntheticMarkers] : vehicles} designated={overlay ? data?.designated ?? [] : []} towingAreas={towingAreas} selectedId={selectedId} onSelect={select} onBoundsChange={onBoundsChange} focus={focus} position={position} bottomFraction={bottomFraction} topInset={mobile ? 200 : 0} />
        <VStack gap={2} style={{ position: 'absolute', top: 'var(--spacing-4)', left: 'var(--spacing-4)', zIndex: 2, maxWidth: mobile ? 'calc(100% - 5rem)' : '24rem' }}>
          <VStack padding={3} gap={1} style={surface}>{view === 'fleet' ? <Text type="label">PM 위치 · TAGO</Text> : view === 'towing' ? <><Text type="label">견인 이력 · 주소별 분석</Text><Text type="supporting">원의 크기 = 견인 건수 · 주소 대표점</Text></> : clockControls}</VStack>
          {/* Solid card: the secondary buttons are translucent and dense markers showed through their labels. */}
          {!(mobile && selected) && <HStack gap={2} wrap="wrap" padding={2} style={{ ...surface, alignSelf: 'flex-start' }}><Button label={locating ? '위치 확인 중' : '내 위치'} isLoading={locating} onClick={() => setLocationConsent(true)} /><Button label="전체 존" onClick={() => setFocus({ points: zones.map((zone) => zone.point) })} /></HStack>}          {locationStatus && <VStack padding={3} style={surface}><Text role="status">{locationStatus}</Text><Button label="위치 안내 닫기" size="sm" variant="ghost" onClick={() => setLocationStatus('')} /></VStack>}
        </VStack>
        {!mobile && <VStack padding={3} style={{ ...surface, position: 'absolute', bottom: 'var(--spacing-5)', left: 'var(--spacing-5)', zIndex: 2, maxWidth: 'calc(100% - 2 * var(--spacing-5))' }}><HStack gap={4} wrap="wrap">{view === 'towing' && <Text type="label">견인 건수별 주소 위치 · 금지 경계 아님</Text>}{(view === 'towing' ? [] : Object.keys(statuses)).map((status) => <Text key={status} type="label" style={{ color: colors[status] }}>P{signs[status]} {statuses[status]}</Text>)}{legend}</HStack></VStack>}
      </VStack>
      {mobile && <VStack as="aside" aria-label="시민용 탐색 패널" gap={0} style={{ ...surface, position: 'absolute', insetInline: 0, bottom: 0, zIndex: 3, maxHeight: `${bottomFraction * 100}%`, paddingBottom: 'env(safe-area-inset-bottom)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <VStack padding={3} gap={2}><HStack hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading><Button label={expanded ? '줄이기' : '펼치기'} size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} /></HStack>{nav}{!selected && legend}</VStack>
        <VStack key={selected?.id ?? view} padding={4} gap={4} isScrollable style={{ minHeight: 0 }}>{body}</VStack>
      </VStack>}
    </HStack>
    <Dialog isOpen={locationConsent} onOpenChange={setLocationConsent} aria-label="내 위치 사용 안내"><VStack gap={4}><Heading level={2}>내 위치로 주변을 찾을까요?</Heading><Text>현재 위치는 주변 주차존 탐색에 사용합니다. 정확한 GPS 좌표는 이 서비스 서버에 보내지 않습니다.</Text><Text>내 위치로 지도를 이동하면 OpenStreetMap 지도 제공자에게 주변 지역을 식별할 수 있는 지도 타일 요청이 전달됩니다.</Text><HStack gap={3} wrap="wrap"><Button label="직접 지도 탐색" onClick={() => setLocationConsent(false)} /><Button label="동의하고 내 위치 찾기" variant="primary" onClick={() => { setLocationConsent(false); locate(); }} /></HStack></VStack></Dialog>
  </AppShell>;
}
