import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Box, Act } from './panel-ui';
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
  const ready = source?.status === 'ready';
  return <VStack gap={4}>
    <SegmentedControl label="자료 종류" layout="fill" value={kind} onChange={changeKind}><SegmentedControlItem value="parking" label="공식 주차구역" /><SegmentedControlItem value="pedestrians" label="보행 관측" /></SegmentedControl>
    <Box tone={connection === 'offline' || source?.status === 'error' ? 'orange' : ready && connection === 'online' ? 'green' : 'muted'}>
      <Text type="label" aria-live="polite">{connection === 'offline' ? '서비스 연결을 확인해 주세요' : connection === 'loading' ? '자료 확인 중' : labels[source?.status] ?? '자료 확인 중'}</Text>
      <Text>{pedestrian ? 'S-DoT 10분 센서 관측이에요. 개별 보도의 15분 실측이나 반납 가능 대수가 아니에요.' : '서울시가 설치한 전동킥보드 주차구역 목록이에요. 잔여 대수는 알 수 없어요.'}</Text>
      {ready && <Text type="supporting">수집 {formatTime(source.retrievedAt)} KST · {source.fetchedRows?.toLocaleString('ko-KR')} / {source.totalRows?.toLocaleString('ko-KR')}행{source.partial ? ' · 일부 조회' : ''}</Text>}
      {source?.sourceUrl && <Link href={source.sourceUrl} target="_blank" rel="noopener noreferrer">출처: {source.sourceName}</Link>}
    </Box>
    {source?.status === 'unconfigured' ? <Box><Text>공식 자료 연결을 준비하고 있어요.</Text></Box> : source?.status === 'error' ? <Box tone="orange"><Text>제공처 자료를 가져오지 못했어요. 마지막 수집 성공 {formatTime(source.lastSuccessAt)} KST</Text></Box> : ready && <>
      {connection === 'offline' && <Box tone="orange"><Text>아래는 마지막 조회 자료예요. 최신 여부를 확인할 수 없어요.</Text></Box>}
      <TextInput label="지역·주소·센서 검색" placeholder="예: 강남구" value={query} hasClear onChange={(value) => { setQuery(value); setLimit(50); }} />
      <Text type="label" color="secondary">검색 결과 {records.length}건{pedestrian ? ' · 센서 기준' : ''}</Text>
      {!records.length && <Box><Text>조건과 일치하는 자료가 없어요.</Text></Box>}
      <VStack gap={2}>{records.slice(0, limit).map((row) => <Card key={row.id} variant="muted" padding={3}><VStack gap={1}>
        <Text type="label">{pedestrian ? `${row.district} · ${row.area}` : row.name}</Text>
        {pedestrian ? <><Text>10분 관측 {row.count.toLocaleString('ko-KR')}명</Text><Text type="supporting">관측 {formatTime(row.observedAt)} KST · 센서 {row.id}{(row.delayed || Date.parse(data.generatedAt) - Date.parse(row.observedAt) >= 30 * 60_000) ? ' · 관측 지연' : ''}</Text></> : <><Text>{row.district} {row.address}</Text><Text type="supporting">거치대 {row.hasStand === true ? '있음' : row.hasStand === false ? '없음' : '확인 필요'} · 공식 번호 {row.id}</Text></>}
      </VStack></Card>)}</VStack>
      {records.length > limit && <Act label="자료 더 보기" variant="secondary" onClick={() => setLimit((value) => value + 50)} />}
    </>}
    <Act label="공공데이터 새로고침" variant="secondary" onClick={() => setVersion((value) => value + 1)} />
  </VStack>;
}
