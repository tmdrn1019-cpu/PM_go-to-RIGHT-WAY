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
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Box, Act, statusTone } from './panel-ui';
import { filterZones } from './zone-search.mjs';
import { distanceM } from '../server/engine.mjs';
import ZoneMap from './ZoneMap';
import PublicDataPanel from './PublicDataPanel';
import ExternalDataPanel from './ExternalDataPanel';

const statuses = { open: '주차존 개방', reduced: '일부 개방', closed: '페널티 유지', unknown: '확인 중' };
const colors = { open: 'var(--color-text-success)', reduced: 'var(--color-text-warning)', closed: 'var(--color-text-error)', unknown: 'var(--color-text-secondary)' };
const formatTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '—';
const clockTime = (value) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const SPEEDS = [[600, '초당 10분'], [60, '초당 1분'], [1, '실시간']];
const distance = (meters) => meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
const surface = { background: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)', boxShadow: 'var(--shadow-med)' };

function ZoneStatus({ zone }) { return <Text type="label" style={{ color: colors[zone.status] }}>{statuses[zone.status]}</Text>; }

function ZoneDetails({ zone }) {
  const [more, setMore] = useState(false);
  const c = zone.cutoffs; const n = (v) => v?.toLocaleString('ko-KR') ?? '—';
  return <VStack gap={4}>
    <Box tone={statusTone[zone.status] ?? 'muted'}><Text type="label">{statuses[zone.status]}</Text><Heading level={2}>{zone.name}</Heading><Text>{zone.address}</Text></Box>
    <Box><Text color="secondary">{zone.crowdLabel}</Text><Text type="display-3" color="accent">{n(zone.crowdCount)}명</Text><Text>{zone.reason}</Text></Box>
    <Box tone="red"><Text type="label">견인 위험 구역 · 2025 견인 {zone.towingCount}건</Text>
      <Text>{zone.towingAddresses.map((h) => `${h.address.replace(/^서울특별시 \S+구 /, '')} ${h.count}건`).join(' · ')}</Text>
      <Text type="supporting">반납할 때 사진 한 장으로 확인해요 (시연은 모의)</Text></Box>
    {more ? <Box>
      <Text type="label">판정 기준 · {zone.basis.station.name}역 {zone.basis.station.month}</Text>
      <Text>평균+1표준편차 {n(c?.keep)}명↑ 페널티 유지 · 평균 {n(c?.mean)}명↑ 일부 개방 · 그 아래 또는 서울 중앙값 {n(c?.median)}명 미만 개방</Text>
      <Text type="supporting">역 300m·{zone.cellM}m 칸은 가정, 승하차는 보행량 대리지표, 법적 반납금지 경계 아님 · 관측 {formatTime(zone.observedAt)} KST</Text>
    </Box> : <Act label="판정 근거 보기" variant="secondary" onClick={() => setMore(true)} />}
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
  // Frame the penalty zones once on first load; zones that appear later during playback must not move the map.
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
  const active = zones;
  const visibleZones = filterZones(active, { query, vehicleType, statuses: layers, bounds: boundsOnly ? bounds : null, origin: position?.point });
  const mapZones = filterZones(active, { query, vehicleType, statuses: layers });
  const selected = zones.find((zone) => zone.id === selectedId);
  // Real TAGO devices and towing analysis get the map to themselves so synthetic devices never mix with real ones.
  const overlay = !['fleet', 'towing'].includes(view);
  const riskVehicles = (synthetic?.vehicles ?? []).filter((v) => v.risk).sort((a, b) => a.risk.distanceM - b.risk.distanceM || a.id.localeCompare(b.id));
  // Phones have no bottom legend (the panel covers it), so the extra layers' key also sits in the bottom panel header there.
  const legend = overlay && <HStack gap={3} wrap="wrap"><Text type="label" color="secondary">P 지정 구역(상태 없음)</Text><Text type="label">핀 합성 PM</Text><Text type="label" style={{ color: colors.closed }}>핀! 견인 위험(합성)</Text></HStack>;
  // Penalty cells are drawn red; the key names each line style (see ZoneMap).
  const cellKey = <HStack gap={4} wrap="wrap"><Text type="label" style={{ color: colors.closed }}>■ 빨간 칸 = 견인 위험 구역</Text><Text type="label">진한 실선 페널티 유지</Text><Text type="label">긴 점선 일부 개방</Text><Text type="label">옅은 짧은 점선 주차존 개방</Text></HStack>;
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
  const dataLabel = connection === 'loading' ? '정보 확인 중' : !online ? '연결 끊김' : data?.status === 'unconfigured' ? '페널티 구역 자료 준비 전' : `판정 시각 ${clockTime(clock)}`;
  const clockControls = <VStack gap={2} style={{ minWidth: '17rem' }}>
    <Text type="label" aria-live="polite">{dataLabel}</Text>
    <SegmentedControl label="재생 속도" size="sm" layout="fill" value={String(speed)} onChange={(value) => setSpeed(Number(value))}>{SPEEDS.map(([value, label]) => <SegmentedControlItem key={value} value={String(value)} label={label} />)}</SegmentedControl>
    <HStack gap={2}>
      <Button label={playing ? '일시정지' : '재생'} size="sm" variant="primary" aria-pressed={playing} onClick={() => setPlaying((value) => !value)} />
      <Button label="지금으로" size="sm" variant="secondary" onClick={resetClock} />
    </HStack>
  </VStack>;
  const menu = [['help', '이용 안내', '상태 표시와 위치 정보 사용'], ['status', '판정 시계', '재생 속도와 판정 기준'], ['towing', '견인 분석', '견인 다발 주소와 후보지'], ['fleet', 'PM 위치', '공식 기기 위치 조회'], ['public', '공공데이터', '공식 주차구역·보행 관측'], ['risk', '견인 위험 PM', '합성 시연 기기 중 페널티 구역 안 기기']];
  const panelTitle = selected ? selected.name : view === 'zones' ? '페널티 구역' : view === 'menu' ? '메뉴' : menu.find(([id]) => id === view)?.[1];
  const nav = <HStack gap={2}>{(view !== 'zones' || selected) && <Button label="구역 목록" size="sm" variant="secondary" onClick={() => switchView('zones')} />}{view !== 'menu' && <Button label="메뉴" size="sm" variant="secondary" onClick={() => switchView('menu')} />}</HStack>;
  const filters = <VStack gap={3}><TextInput label="구역 주소 검색" value={query} onChange={(value) => { setQuery(value); setSelectedId(null); }} hasClear placeholder="예: 역삼동, 논현동" /><Selector label="기기 종류" value={vehicleType} onChange={(value) => { setVehicleType(value); setSelectedId(null); }} options={[{ value: 'all', label: '전체 기기' }, { value: 'scooter', label: '킥보드' }, { value: 'ebike', label: '전기자전거' }]} /></VStack>;
  // A row card: text on the left, one clearly drawn button on the right.
  const rowCard = (key, title, detail, button) => <Card key={key} variant="muted" padding={3}><HStack hAlign="between" vAlign="center" gap={2}><VStack gap={1} style={{ minWidth: 0 }}>{title}<Text type="supporting">{detail}</Text></VStack>{button}</HStack></Card>;
  const body = selected ? <ZoneDetails zone={selected} /> : view === 'menu' ? <VStack gap={2}>{menu.map(([id, label, hint]) => rowCard(id, <Text type="label">{label}</Text>, hint, <Button label="열기" size="sm" variant="primary" onClick={() => switchView(id)} />))}</VStack> : ['towing','fleet'].includes(view) ? <ExternalDataPanel key={view} kind={view} onVehicles={receiveVehicles} onTowing={receiveTowing} /> : view === 'public' ? <PublicDataPanel /> : view === 'risk' ? <VStack gap={4}>
    <Box tone="yellow"><Text type="label">합성 시연 자료 · 실제 기기 아님</Text><Text>견인 주소에서 {synthetic?.riskRadiusM ?? 30}m 안(가정)이면 견인 위험으로 표시해요.</Text></Box>
    {!synthetic ? <Box><Text>합성 기기를 불러오고 있어요.</Text></Box> : synthetic.failed || synthetic.status !== 'ready' ? <Box><Text>합성 기기를 불러오지 못했습니다.</Text></Box> : <>
      <Text type="label">합성 기기 {synthetic.vehicles.length}대 중 견인 위험 {riskVehicles.length}대</Text>
      <VStack gap={2}>{riskVehicles.map((v) => rowCard(v.id, <Text type="label" style={{ color: colors.closed }}>{v.id} · 견인 위험 {v.risk.distanceM}m</Text>, `${v.risk.address.replace(/^서울특별시 \S+구 /, '')} · 2025 견인 ${v.risk.towingCount}건`, <Button label="지도에서 보기" size="sm" variant="primary" onClick={() => { setFocus({ point: v.point }); if (mobile) setExpanded(false); }} />))}</VStack>
    </>}
  </VStack> : view === 'status' ? <VStack gap={4}>
    <Box>{clockControls}</Box>
    <HStack gap={2} wrap="wrap">{['closed', 'reduced', 'open'].map((key) => <Card key={key} variant={statusTone[key]} padding={3}><VStack gap={0} hAlign="center"><Text type="display-3">{data?.counts?.[key] ?? 0}</Text><Text type="label">{statuses[key]}</Text></VStack></Card>)}</HStack>
    <Box><Text type="label">판정 기준</Text><Text>가장 가까운 역의 그 시간 승하차가 그 역 평균+1표준편차 이상이면 페널티 유지, 평균 이상이면 일부 개방, 그 아래는 주차존 개방</Text><Text type="supporting">강남구 시연 · 견인 주소 30m에 닿는 50m 칸 · 역 300m 안 (가정)</Text></Box>
  </VStack> : view === 'help' ? <VStack gap={4}>
    {['closed', 'reduced', 'open'].map((key) => <Box key={key} tone={statusTone[key]}><Text type="label">{statuses[key]}</Text><Text>{({ open: '한산한 시간이라 주차존으로 열었어요', reduced: '붐비는 편이라 일부만 열었어요', closed: '그 역의 첨두 시간이라 반납 페널티를 유지해요' })[key]}</Text></Box>)}
    <Box><Text type="supporting">내 위치는 브라우저에서만 쓰고 서버로 보내지 않아요. 열린 구역에서도 횡단보도·점자블록·차도는 막지 마세요.</Text></Box>
  </VStack> : <VStack gap={4}>
    <HStack hAlign="between" vAlign="center" gap={2}><Text color="secondary">{position ? '가까운 순' : boundsOnly ? '지도 범위' : '전체 지역'} · {visibleZones.length}곳</Text><Button label={filtersOpen ? '필터 닫기' : '검색·필터'} size="sm" variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} /></HStack>
    {filtersOpen && <Box>{filters}<HStack gap={2} wrap="wrap">{Object.entries(statuses).map(([key, label]) => <Button key={key} label={label} size="sm" variant={layers.includes(key) ? 'primary' : 'secondary'} aria-pressed={layers.includes(key)} onClick={() => { setLayers((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]); setSelectedId(null); }} />)}</HStack>
<Button label={boundsOnly ? '지도 범위만' : '전체 지역'} size="sm" variant="secondary" aria-pressed={boundsOnly} onClick={() => setBoundsOnly((value) => !value)} /></Box>}
    {!visibleZones.length ? <><Box><Heading level={2}>{connection === 'loading' ? '주차존을 확인하고 있어요' : !online ? '최신 정보를 확인할 수 없어요' : data?.status === 'unconfigured' ? '주차존 연결을 준비하고 있어요' : data?.status === 'error' ? '운영 정보를 다시 확인하고 있어요' : '조건에 맞는 구역이 없어요'}</Heading><Text color="secondary">{data?.status === 'unconfigured' ? '운영이 확인된 주차존부터 안내합니다.' : '검색 조건을 바꾸거나 지도 범위를 넓혀 주세요.'}</Text></Box><Act label="전체 구역 보기" onClick={showAll} /></>
    : <VStack gap={2}>{visibleZones.map((zone) => rowCard(zone.id, <><ZoneStatus zone={zone} /><Text type="label">{zone.name}</Text></>, `2025 견인 ${zone.towingCount}건 · ${zone.basis.station.name}역 ${zone.basis.station.distanceM}m${position ? ` · 직선 ${distance(distanceM(position.point, zone.point))}` : ''}`, <Button label="보기" size="sm" variant="primary" onClick={() => select(zone.id)} />))}</VStack>}
  </VStack>;
  return <AppShell height="fill" variant="surface" topNav={<TopNav label="지도 서비스 메뉴" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} endContent={<Link href="/mobile">모바일 시연</Link>} />}>
    <HStack height="100%" gap={0} style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {!mobile && <VStack as="aside" width="24rem" height="100%" gap={0} style={{ flexShrink: 0, borderInlineEnd: 'var(--border-width) solid var(--color-border)', background: 'var(--color-background-surface)' }} aria-label="주차존 탐색 패널"><HStack padding={5} hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading>{nav}</HStack><Divider /><VStack key={selected?.id ?? view} padding={5} gap={4} isScrollable style={{ flex: 1, minHeight: 0 }}>{body}</VStack></VStack>}
      <VStack height="100%" style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        <ZoneMap zones={mapZones} vehicles={overlay ? [...vehicles, ...syntheticMarkers] : vehicles} designated={overlay ? data?.designated ?? [] : []} towingAreas={towingAreas} selectedId={selectedId} onSelect={select} onBoundsChange={onBoundsChange} focus={focus} position={position} bottomFraction={bottomFraction} topInset={mobile ? 200 : 0} />
        <VStack gap={2} style={{ position: 'absolute', top: 'var(--spacing-4)', left: 'var(--spacing-4)', zIndex: 2, maxWidth: mobile ? 'calc(100% - 5rem)' : '24rem' }}>
          <VStack padding={3} gap={1} style={surface}>{view === 'fleet' ? <Text type="label">PM 위치 · TAGO</Text> : view === 'towing' ? <><Text type="label">견인 이력 · 주소별 분석</Text><Text type="supporting">원의 크기 = 견인 건수 · 주소 대표점</Text></> : clockControls}</VStack>
          {/* Solid card: the secondary buttons are translucent and dense markers showed through their labels. */}
          {!(mobile && selected) && <HStack gap={2} wrap="wrap" padding={2} style={{ ...surface, alignSelf: 'flex-start' }}><Button label={locating ? '위치 확인 중' : '내 위치'} isLoading={locating} onClick={() => setLocationConsent(true)} /><Button label="전체 구역" onClick={() => setFocus({ points: zones.map((zone) => zone.point) })} /></HStack>}          {locationStatus && <VStack padding={3} style={surface}><Text role="status">{locationStatus}</Text><Button label="위치 안내 닫기" size="sm" variant="secondary" onClick={() => setLocationStatus('')} /></VStack>}
        </VStack>
        {!mobile && <VStack padding={3} style={{ ...surface, position: 'absolute', bottom: 'var(--spacing-5)', left: 'var(--spacing-5)', zIndex: 2, maxWidth: 'calc(100% - 2 * var(--spacing-5))' }}><VStack gap={2}>{view === 'towing' ? <Text type="label">견인 건수별 주소 위치 · 금지 경계 아님</Text> : cellKey}{legend}</VStack></VStack>}
      </VStack>
      {mobile && <VStack as="aside" aria-label="시민용 탐색 패널" gap={0} style={{ ...surface, position: 'absolute', insetInline: 0, bottom: 0, zIndex: 3, maxHeight: `${bottomFraction * 100}%`, paddingBottom: 'env(safe-area-inset-bottom)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <VStack padding={3} gap={2}><HStack hAlign="between" vAlign="center" gap={2}><Heading level={3} accessibilityLevel={1}>{panelTitle}</Heading><Button label={expanded ? '줄이기' : '펼치기'} size="sm" variant="secondary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} /></HStack>{nav}{!selected && overlay && cellKey}</VStack>
        <VStack key={selected?.id ?? view} padding={4} gap={4} isScrollable style={{ minHeight: 0 }}>{body}</VStack>
      </VStack>}
    </HStack>
    <Dialog isOpen={locationConsent} onOpenChange={setLocationConsent} aria-label="내 위치 사용 안내"><VStack gap={4}><Heading level={2}>내 위치로 주변을 찾을까요?</Heading><Text>현재 위치는 주변 주차존 탐색에 사용합니다. 정확한 GPS 좌표는 이 서비스 서버에 보내지 않습니다.</Text><Text>내 위치로 지도를 이동하면 OpenStreetMap 지도 제공자에게 주변 지역을 식별할 수 있는 지도 타일 요청이 전달됩니다.</Text><HStack gap={3} wrap="wrap"><Button label="직접 지도 탐색" onClick={() => setLocationConsent(false)} /><Button label="동의하고 내 위치 찾기" variant="primary" onClick={() => { setLocationConsent(false); locate(); }} /></HStack></VStack></Dialog>
  </AppShell>;
}
