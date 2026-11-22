import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Box } from './panel-ui';
import { fetchExternalData } from './service-client.mjs';

const time = (value) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const link = (p) => p.status === 'linked'
  ? `S-DoT ${p.sensorId} · ${p.distanceM}m · 10분 ${p.count}명 · ${time(p.observedAt)} KST${p.delayed ? ' · 관측 지연' : ''}`
  : p.status === 'no-sensor-nearby' ? '반경 안에 위치 확인된 S-DoT 센서 없음'
  : `센서 위치 미확인 · 관악구 센서 ${p.districtSensors}곳 관측(위치 매칭 안 함)`;

export default function CandidateList({ onTowing }) {
  const [data, setData] = useState(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // Re-read every minute so pedestrian delay flags never go stale; drop old data on failure.
    const read = () => { if (document.hidden) return; fetchExternalData('/api/towing/candidates', controller.signal).then((next) => { if (!Array.isArray(next.candidates)) throw new Error('invalid'); setData(next); setFailed(false); }).catch(() => { if (!controller.signal.aborted) { setData(null); setFailed(true); } }); };
    read(); const timer = setInterval(read, 60000); document.addEventListener('visibilitychange', read);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', read); };
  }, []);
  if (failed) return <Box tone="orange"><Text>후보 탐색지 자료를 확인할 수 없어요.</Text></Box>;
  if (!data) return <Box><Text type="supporting">후보 탐색지 계산 중</Text></Box>;
  return <VStack gap={2}>
    <Heading level={3}>주차존 후보 탐색지 {data.candidates.length}곳</Heading>
    <Box><Text type="supporting">견인 다발 주소 반경 {data.radiusM}m 탐색 영역이에요. 제휴 공간·보도 유효폭·15분 보행량을 확인하기 전에는 판정 불가라 열지 않아요.{data.unmappedTowingCount ? ` 좌표 미확인 견인 ${data.unmappedTowingCount}건은 합계에서 빠졌어요.` : ''}</Text></Box>
    {data.candidates.map((c, i) => <Card key={c.id} variant="muted" padding={3}><HStack hAlign="between" vAlign="center" gap={2}><VStack gap={1} style={{ minWidth: 0 }}>
      <Text type="label">{i + 1}. {c.address.replace(/^서울특별시 /, '')} 주변</Text>
      <Text>견인 {c.towingCount.toLocaleString('ko-KR')}건 · 주소 {c.addressCount}곳 · 판정 불가</Text>
      <Text type="supporting">{link(c.pedestrian)}</Text>
    </VStack><Button label="지도에서 보기" size="sm" variant="primary" onClick={() => onTowing([{ ...c, count: c.towingCount, firstDate: data.from, lastDate: data.to }], true)} /></HStack></Card>)}
  </VStack>;
}
