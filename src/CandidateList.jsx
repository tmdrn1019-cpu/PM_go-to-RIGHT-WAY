import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
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
    fetchExternalData('/api/towing/candidates', controller.signal).then((next) => { if (!Array.isArray(next.candidates)) throw new Error('invalid'); setData(next); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (failed) return <Text>후보 탐색지 자료를 확인할 수 없습니다.</Text>;
  if (!data) return <Text type="supporting">후보 탐색지 계산 중</Text>;
  return <VStack gap={2}>
    <Heading level={3}>주차존 후보 탐색지 {data.candidates.length}곳</Heading>
    <Text type="supporting">견인 다발 주소 반경 {data.radiusM}m를 묶은 탐색 영역입니다. 제휴 공간·보도 유효폭·15분 보행량을 확인하기 전에는 판정 불가이며 개방하지 않습니다.</Text>
    {data.candidates.map((c, i) => <VStack key={c.id} gap={1} paddingBlock={2} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
      <Text type="label">{i + 1}. {c.address} 주변</Text>
      <Text>견인 {c.towingCount.toLocaleString('ko-KR')}건 · 주소 {c.addressCount}곳 · 판정 불가</Text>
      <Text type="supporting">{link(c.pedestrian)}</Text>
      <Button label={`${c.address} 주변 지도에서 보기`} size="sm" variant="secondary" onClick={() => onTowing([{ ...c, count: c.towingCount, firstDate: data.from, lastDate: data.to }], true)} />
    </VStack>)}
  </VStack>;
}
