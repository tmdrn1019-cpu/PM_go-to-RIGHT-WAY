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
      {zone.basis && <Text type="supporting">근거: 서울시가 지정한 PM 주차구역입니다. {zone.basis.period} 서울 견인 다발 지점({zone.basis.hotspotAddress}, 이 구역에서 {zone.basis.hotspotDistanceM}m) 반경 {zone.basis.spacingM}m 견인 {zone.basis.towingCount}건({zone.basis.addressCount}개 주소) · 혼잡도는 가장 가까운 {zone.basis.stationName}역({zone.basis.stationDistanceM}m)의 {zone.basis.month} 시간대별 승하차 일평균 · 이 장소에서 가장 붐비는 10% 시간 폐쇄, 상위 30% 시간 축소 · 보도 폭은 따로 확인하지 않았습니다</Text>}
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
    fetch(`/api/zones?at=${encodeURIComponent(new Date(clock).toISOString())}`, { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zones'))))
      .then((next) => { setData({ status: next.status, zones: next.zones, generatedAt: next.at, month: next.month }); setConnection('online'); })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setConnection('offline'); } });
    return () => controller.abort();
  }, [clock]);
  return { data, connection, clock, speed, setSpeed, playing, setPlaying, resetClock: () => setClock(Date.now()) };
}

export default function MapWorkspace() {
  const mobile = useMediaQuery('(max-width: 56rem)');
  const { data, connection, clock, speed, setSpeed, playing, setPlaying, resetClock } = useZonePlayback();
  const zoneCount = data?.zones?.length ?? 0;
  // Frame every demo zone once when they first arrive; later playback ticks must not move the map.
  useEffect(() => { if (zoneCount) setFocus({ points: data.zones.map((zone) => zone.point) }); }, [zoneCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const receiveTowing = useCallback((next, move = false) => { setTowingAreas(next); if (move) setFocus({ points: next.map(row => row.point) }); }, []);
  const receiveVehicles = useCallback((next, move = false) => { setVehicles(next); if (move) setFocus({ points: next.map(row => row.point) }); }, []);
  const bottomFraction = mobile ? expanded ? 0.55 : 0.35 : 0;
  const online = connection === 'online';
  const zones = (data?.zones ?? []).map((zone) => online ? zone : { ...zone, status: 'unknown', capacity: 0, available: 0, reason: '최신 운영 상태를 다시 확인하고 있습니다.' });
  const visibleZones = filterZones(zones, { query, vehicleType, statuses: layers, bounds: boundsOnly ? bounds : null, origin: position?.point });
  const mapZones = filterZones(zones, { query, vehicleType, statuses: layers });
  const selected = zones.find((zone) => zone.id === selectedId);
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
    <Text type="supporting">견인 다발 지점 옆 서울시 지정 PM 주차구역 · 인근 역이 붐비는 시간에 축소·폐쇄</Text>
    <HStack gap={2} wrap="wrap">
      <Button label={playing ? '일시정지' : '재생'} size="sm" variant="secondary" aria-pressed={playing} onClick={() => setPlaying((value) => !value)} />
      {SPEEDS.map(([value, label]) => <Button key={value} label={label} size="sm" variant={speed === value ? 'primary' : 'ghost'} aria-pressed={speed === value} onClick={() => setSpeed(value)} />)}
      <Button label="지금으로" size="sm" variant="ghost" onClick={resetClock} />
    </HStack>
  </VStack>;
  const menu = [['help', '이용 안내', '상태 표시와 위치 정보 사용'], ['status', '판정 시계', '재생 속도와 판정 시각'], ['towing', '견인 분석', '견인 다발 주소와 후보지'], ['fleet', 'PM 위치', '공식 기기 위치 조회'], ['public', '공공데이터', '공식 주차구역·보행 관측']];
  const panelTitle = selected ? selected.name : view === 'zones' ? '주차존 찾기' : view === 'menu' ? '메뉴' : menu.find(([id]) => id === view)?.[1];
  const nav = <HStack gap={2}>{(view !== 'zones' || selected) && <Button label="주차존으로" size="sm" variant="ghost" onClick={() => switchView('zones')} />}{view !== 'menu' && <Button label="메뉴" size="sm" variant="secondary" onClick={() => switchView('menu')} />}</HStack>;
  const filters = <VStack gap={3}><TextInput label="주차존 이름·주소 검색" value={query} onChange={(value) => { setQuery(value); setSelectedId(null); }} hasClear placeholder="주차존 이름 또는 주소" /><Selector label="기기 종류" value={vehicleType} onChange={(value) => { setVehicleType(value); setSelectedId(null); }} options={[{ value: 'all', label: '전체 기기' }, { value: 'scooter', label: '킥보드' }, { value: 'ebike', label: '전기자전거' }]} /></VStack>;
  const body = selected ? <ZoneDetails zone={selected} /> : view === 'menu' ? <VStack gap={0}>{menu.map(([id, label, hint]) => <VStack key={id} gap={1} paddingBlock={3} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}><Button label={label} variant="ghost" onClick={() => switchView(id)} /><Text type="supporting">{hint}</Text></VStack>)}</VStack> : ['towing','fleet'].includes(view) ? <ExternalDataPanel key={view} kind={view} onVehicles={receiveVehicles} onTowing={receiveTowing} /> : view === 'public' ? <PublicDataPanel /> : view === 'status' ? <VStack gap={5}>
    {clockControls}<Text>주차존 {zones.length}곳 · 개방 {zones.filter((z) => z.status === 'open').length}곳 · 축소 {zones.filter((z) => z.status === 'reduced').length}곳 · 폐쇄 {zones.filter((z) => z.status === 'closed').length}곳</Text>
    <Text type="supporting">2025년 서울 견인 다발 지점에서 500m 안에 있는 서울시 지정 PM 주차구역 중, 인근 지하철역 승하차가 서울 역 중앙값 이상이고 견인이 많은 20곳입니다. 인근 역의 시간대별 승하차(일평균)에서 그 장소가 가장 붐비는 10% 시간은 폐쇄, 상위 30% 시간은 축소합니다. 주차 대수는 운영사 연동 후 표시합니다. 시민 이동 미션은 모바일 화면에서 시연합니다.</Text>
  </VStack> : view === 'help' ? <VStack gap={5}>
    <VStack gap={3}>{Object.entries(statuses).map(([key, label]) => <HStack key={key} gap={3}><Text type="label" style={{ color: colors[key] }}>{label}</Text><Text>{({ open: '현재 운영 중인 주차존', reduced: '수용량을 줄여 운영하는 주차존', closed: '신규 반납을 받지 않는 주차존', unknown: '최신 정보를 확인 중인 주차존' })[key]}</Text></HStack>)}</VStack><Divider /><Text type="supporting">내 위치는 브라우저에서만 쓰며 GPS 좌표를 서버로 보내지 않습니다. 단, 주변 지도 타일 요청은 OpenStreetMap에 전달됩니다. 등록된 주차존만 안내하며, 빈 보도는 주차 허용 공간이 아닙니다.</Text>
  </VStack> : <VStack gap={4}>
    <HStack hAlign="between" vAlign="center" gap={2}><Text color="secondary">{position ? '가까운 순' : boundsOnly ? '지도 범위' : '전체 지역'} · {visibleZones.length}곳</Text><Button label={filtersOpen ? '필터 닫기' : '검색·필터'} size="sm" variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} /></HStack>
    {filtersOpen && <VStack gap={3}>{filters}<HStack gap={2} wrap="wrap">{Object.entries(statuses).map(([key, label]) => <Button key={key} label={label} size="sm" variant={layers.includes(key) ? 'secondary' : 'ghost'} aria-pressed={layers.includes(key)} onClick={() => { setLayers((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]); setSelectedId(null); }} />)}</HStack>
<Button label={boundsOnly ? '지도 범위만' : '전체 지역'} size="sm" variant="ghost" aria-pressed={boundsOnly} onClick={() => setBoundsOnly((value) => !value)} /></VStack>}
    {!visibleZones.length ? <VStack gap={4} paddingBlock={5}><Heading level={2}>{connection === 'loading' ? '주차존을 확인하고 있어요' : !online ? '최신 정보를 확인할 수 없어요' : data?.status === 'unconfigured' ? '주차존 연결을 준비하고 있어요' : data?.status === 'error' ? '운영 정보를 다시 확인하고 있어요' : '조건에 맞는 주차존이 없어요'}</Heading><Text color="secondary">{data?.status === 'unconfigured' ? '운영이 확인된 주차존부터 안내합니다.' : '검색 조건을 바꾸거나 지도 범위를 넓혀 주세요.'}</Text><Button label="전체 주차존 보기" onClick={showAll} /></VStack> : <VStack gap={0}>{visibleZones.map((zone) => <VStack key={zone.id} paddingBlock={4} gap={2} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}><HStack hAlign="between" gap={2}><Button label={zone.name} variant="ghost" size="sm" onClick={() => select(zone.id)} /><ZoneStatus zone={zone} /></HStack><Text>{zone.vehicleTypes.map((type) => types[type]).join(' · ')} · {zone.available === null ? `정원 ${zone.capacity}대` : `반납 여유 ${zone.available}대`}{position ? ` · 직선 ${distance(distanceM(position.point, zone.point))}` : ''}</Text></VStack>)}</VStack>}
  </VStack>;
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="지도 서비스 메뉴" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} endContent={<Link href="/mobile">모바일 미션 시연</Link>} />}>
    <HStack height="100%" gap={0} style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {!mobile && <VStack as="aside" width="24rem" height="100%" gap={0} style={{ flexShrink: 0, borderInlineEnd: 'var(--border-width) solid var(--color-border)', background: 'var(--color-background-surface)' }} aria-label="주차존 탐색 패널"><HStack padding={5} hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading>{nav}</HStack><Divider /><VStack key={selected?.id ?? view} padding={5} gap={4} isScrollable style={{ flex: 1, minHeight: 0 }}>{body}</VStack></VStack>}
      <VStack height="100%" style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        <ZoneMap zones={mapZones} vehicles={vehicles} towingAreas={towingAreas} selectedId={selectedId} onSelect={select} onBoundsChange={onBoundsChange} focus={focus} position={position} bottomFraction={bottomFraction} />
        <VStack gap={2} style={{ position: 'absolute', top: 'var(--spacing-4)', left: 'var(--spacing-4)', zIndex: 2, maxWidth: mobile ? 'calc(100% - 5rem)' : '24rem' }}>
          <VStack padding={3} gap={1} style={surface}>{view === 'fleet' ? <Text type="label">PM 위치 · TAGO</Text> : view === 'towing' ? <><Text type="label">견인 이력 · 주소별 분석</Text><Text type="supporting">원의 크기 = 견인 건수 · 주소 대표점</Text></> : clockControls}</VStack>
          {!(mobile && selected) && <HStack gap={2} wrap="wrap"><Button label={locating ? '위치 확인 중' : '내 위치'} isLoading={locating} onClick={() => setLocationConsent(true)} elevation="low" /><Button label="전체 존" onClick={() => setFocus({ points: zones.map((zone) => zone.point) })} elevation="low" /></HStack>}
          {locationStatus && <VStack padding={3} style={surface}><Text role="status">{locationStatus}</Text><Button label="위치 안내 닫기" size="sm" variant="ghost" onClick={() => setLocationStatus('')} /></VStack>}
        </VStack>
        {!mobile && <VStack padding={3} style={{ ...surface, position: 'absolute', bottom: 'var(--spacing-5)', left: 'var(--spacing-5)', zIndex: 2 }}><HStack gap={4}>{view === 'towing' && <Text type="label">견인 건수별 주소 위치 · 금지 경계 아님</Text>}{(view === 'towing' ? [] : Object.keys(statuses)).map((status) => <Text key={status} type="label" style={{ color: colors[status] }}>{statuses[status]}</Text>)}</HStack></VStack>}
      </VStack>
      {mobile && <VStack as="aside" aria-label="시민용 탐색 패널" gap={0} style={{ ...surface, position: 'absolute', insetInline: 0, bottom: 0, zIndex: 3, maxHeight: `${bottomFraction * 100}%`, paddingBottom: 'env(safe-area-inset-bottom)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <VStack padding={3} gap={2}><HStack hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading><Button label={expanded ? '줄이기' : '펼치기'} size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} /></HStack>{nav}</VStack>
        <VStack key={selected?.id ?? view} padding={4} gap={4} isScrollable style={{ minHeight: 0 }}>{body}</VStack>
      </VStack>}
    </HStack>
    <Dialog isOpen={locationConsent} onOpenChange={setLocationConsent} aria-label="내 위치 사용 안내"><VStack gap={4}><Heading level={2}>내 위치로 주변을 찾을까요?</Heading><Text>현재 위치는 주변 주차존 탐색에 사용합니다. 정확한 GPS 좌표는 이 서비스 서버에 보내지 않습니다.</Text><Text>내 위치로 지도를 이동하면 OpenStreetMap 지도 제공자에게 주변 지역을 식별할 수 있는 지도 타일 요청이 전달됩니다.</Text><HStack gap={3} wrap="wrap"><Button label="직접 지도 탐색" onClick={() => setLocationConsent(false)} /><Button label="동의하고 내 위치 찾기" variant="primary" onClick={() => { setLocationConsent(false); locate(); }} /></HStack></VStack></Dialog>
  </AppShell>;
}
