import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { fetchPublicData } from './service-client.mjs';

const formatTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
const labels = { ready: '수집 연결됨', error: '수집 확인 필요', unconfigured: '연결 준비 중' };

export default function PublicDataPanel() {
  const [data, setData] = useState(null); const [connection, setConnection] = useState('loading');
  const [version, setVersion] = useState(0); const [kind, setKind] = useState('parking');
  const [query, setQuery] = useState(''); const [limit, setLimit] = useState(50);
  useEffect(() => {
    let stopped = false; let timer; let controller;
    const read = async () => {
      if (document.hidden) { timer = setTimeout(read, 60_000); return; }
      controller = new AbortController(); setConnection('loading');
      try { const result = await fetchPublicData(controller.signal); if (!stopped) { setData(result); setConnection('online'); } }
      catch { if (!stopped) setConnection('offline'); }
      finally { if (!stopped) timer = setTimeout(read, 60_000); }
    };
    const visible = () => { if (!document.hidden) setVersion((value) => value + 1); };
    read(); document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [version]);
  const source = data?.[kind]; const pedestrian = kind === 'pedestrians';
  const keyword = query.trim().toLocaleLowerCase('ko-KR');
  const records = (source?.records ?? []).filter((row) => [row.id, row.district, row.name, row.address, row.area].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(keyword));
  const changeKind = (next) => { setKind(next); setQuery(''); setLimit(50); };
  return <VStack gap={4}>
    <Heading level={2}>서울시 공공데이터</Heading>
    <Text color="secondary">공식 주차구역과 주변 보행 관측을 확인합니다. 현재 반납 가능 여부는 주차존 탭의 운영 정보를 확인해 주세요.</Text>
    <HStack gap={2} wrap="wrap">{[['parking', '공식 주차구역'], ['pedestrians', '보행 관측']].map(([id, label]) => <Button key={id} label={label} size="sm" variant={kind === id ? 'primary' : 'secondary'} aria-pressed={kind === id} onClick={() => changeKind(id)} />)}</HStack>
    <Text type="label" aria-live="polite">{connection === 'offline' ? '서비스 연결을 확인해 주세요' : connection === 'loading' ? '자료 확인 중' : labels[source?.status] ?? '자료 확인 중'}</Text>
    {source?.sourceUrl && <Link href={source.sourceUrl} target="_blank" rel="noopener noreferrer">출처: {source.sourceName}</Link>}
    <Text type="supporting">{pedestrian ? '10분 단위 센서 관측이며, 개별 보도의 15분 실측이나 반납 가능 대수가 아닙니다.' : '서울시 예산으로 설치한 전동킥보드 주차구역 목록입니다. 전기자전거 허용·현재 잔여 대수는 이 자료로 확인할 수 없습니다.'}</Text>
    {source?.status === 'unconfigured' ? <VStack gap={2}><Text type="large">공식 자료 연결을 준비하고 있어요</Text><Text>연결 후 주차구역 위치 안내와 실제 보행 관측 시각을 확인할 수 있습니다.</Text></VStack> : source?.status === 'error' ? <Text>제공처의 자료를 가져오지 못했습니다. 마지막 수집 성공 {formatTime(source.lastSuccessAt)} KST. 수집 상태를 다시 확인하고 있습니다.</Text> : source?.status === 'ready' && <>
      <Text type="supporting">수집 {formatTime(source.retrievedAt)} KST · 조회 {source.fetchedRows?.toLocaleString('ko-KR')} / 원본 {source.totalRows?.toLocaleString('ko-KR')}행{source.partial ? ' · 일부 조회' : ''}<br />{pedestrian ? '조회 범위에서 센서별 최신 관측을 표시합니다.' : '자료 수집 시각은 주차구역 현장 확인 시각과 다릅니다.'}</Text>
      {connection === 'offline' && <Text type="label" color="secondary">아래는 마지막 조회 자료입니다. 최신 여부를 확인할 수 없습니다.</Text>}
      <TextInput label="지역·주소·센서 검색" placeholder="예: 관악구" value={query} hasClear onChange={(value) => { setQuery(value); setLimit(50); }} />
      <Text color="secondary">검색 결과 {records.length}건{pedestrian ? ' · 센서 기준' : ''}</Text>
      {!records.length && <Text>조회 범위에 조건과 일치하는 자료가 없습니다.</Text>}
      <VStack gap={0}>{records.slice(0, limit).map((row) => <VStack key={row.id} gap={2} paddingBlock={4} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
        <Text type="label">{pedestrian ? `${row.district} · ${row.area}` : row.name}</Text>
        {pedestrian ? <><Text>10분 관측 {row.count.toLocaleString('ko-KR')}명</Text><Text type="supporting">관측 {formatTime(row.observedAt)} KST · 센서 {row.id}</Text>{(row.delayed || Date.parse(data.generatedAt) - Date.parse(row.observedAt) >= 30 * 60_000) && <Text type="label" color="secondary">관측 지연 · 현재 상황과 다를 수 있습니다</Text>}</> : <><Text>{row.district} {row.address}</Text><Text type="supporting">거치대 {row.hasStand === true ? '있음' : row.hasStand === false ? '없음' : '확인 필요'} · 공식 번호 {row.id}</Text></>}
      </VStack>)}</VStack>
      {records.length > limit && <Button label="자료 더 보기" variant="secondary" onClick={() => setLimit((value) => value + 50)} />}
    </>}
    <Divider /><Text type="supporting">원자료에는 지도 좌표와 주차 경계가 없습니다. 현장 위치·공간 사용 권한·보도 유효폭·차량 재고 확인 후 동적 주차존과 연결합니다.</Text>
    <Button label="공공데이터 새로고침" variant="secondary" onClick={() => setVersion((value) => value + 1)} /><Text type="supporting">새로고침은 마지막 수집 결과를 조회합니다. 주차구역은 하루, 보행 관측은 10분 주기로 다시 수집합니다.</Text>
  </VStack>;
}
