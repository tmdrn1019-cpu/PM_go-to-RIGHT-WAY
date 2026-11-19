// Full-screen landing: animated hero scene, then a two-page service explainer.
import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';

const pill = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-3) var(--spacing-6)', borderRadius: 'var(--radius-full)', textDecoration: 'none', fontWeight: 700 };
const cta = { ...pill, background: 'var(--color-text-accent)', color: 'var(--color-background-surface)' };
const ghost = { ...pill, border: 'var(--border-width) solid var(--color-text-primary)', color: 'var(--color-text-primary)' };
const screen = { minHeight: '100dvh', flexShrink: 0, position: 'relative', scrollSnapAlign: 'start' };
const ink = 'var(--color-text-primary)';
const paprika = 'var(--color-text-accent)';
// One 14s cycle: quiet (zone open) -> crowded (zone shrinks) -> quiet.
const cycle = { dur: '14s', repeatCount: 'indefinite', keyTimes: '0;0.3;0.45;0.8;1' };

function Walker({ y, dur, begin, crowd }) {
  return <g opacity={crowd ? 0 : 1}>
    {crowd && <animate attributeName="opacity" values="0;0;1;1;0" {...cycle} />}
    <g stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" opacity=".35">
      <animateTransform attributeName="transform" type="translate" from={`-60 ${y}`} to={`1660 ${y}`} dur={dur} begin={begin} repeatCount="indefinite" />
      <circle cy="-30" r="10" fill={ink} /><path d="M0-18v28m0-20-12 12m12-12 12 12M0 10-9 34m9-24 9 24" />
    </g>
  </g>;
}

function HeroScene({ svgRef }) {
  const walkers = [[640, '19s', '0s'], [690, '23s', '-6s'], [655, '17s', '-11s'], [700, '21s', '-3s']];
  const crowd = [[630, '15s', '-2s'], [675, '16s', '-8s'], [710, '14s', '-5s'], [645, '18s', '-13s'], [690, '13s', '-9s'], [720, '17s', '-1s']];
  return <svg ref={svgRef} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
    {[0, 1, 2, 3, 4, 5].map((n) => <rect key={n} x={40 + n * 270} y={90 + (n % 2) * 50} width="210" height={330 - (n % 2) * 50} rx="10" fill={ink} opacity=".05" />)}
    <rect y="590" width="1600" height="160" fill={ink} opacity=".06" />
    <rect y="750" width="1600" height="150" fill={ink} opacity=".12" />
    <path d="M0 825H1600" stroke="var(--color-background-surface)" strokeWidth="5" strokeDasharray="60 40" opacity=".7" />
    <rect x="820" y="620" height="96" rx="14" fill={paprika} fillOpacity=".08" stroke={paprika} strokeWidth="4" strokeDasharray="14 10" width="420">
      <animate attributeName="width" values="420;420;150;150;420" {...cycle} />
    </rect>
    {[0, 1, 2, 3, 4, 5].map((i) => <g key={i} transform={`translate(${850 + i * 64} 668)`} stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round" opacity=".55">
      {i > 1 && <animate attributeName="opacity" values=".55;.55;0;0;.55" {...cycle} />}
      <circle cy="30" r="8" /><circle cx="36" cy="30" r="8" /><path d="M0 24h28l-5-40H12M23-16h14" />
    </g>)}
    {walkers.map(([y, dur, begin]) => <Walker key={`w${begin}`} y={y} dur={dur} begin={begin} />)}
    {crowd.map(([y, dur, begin]) => <Walker key={`c${begin}`} y={y} dur={dur} begin={begin} crowd />)}
  </svg>;
}

const pages = [
  { label: '서비스 개요 · 동작 과정', title: '보행량에 맞춰 열고, 줄이고, 닫는 주차존', lead: '보도 유효폭과 시간대별 보행량으로 공유 킥보드·전기자전거 주차존의 운영 상태와 수용 대수를 계산합니다. 운영사에는 반납 가능한 위치를, 자치구에는 후보지·운영시간 분석을 제공합니다. 시범 지역은 관악구 신림역~서울대입구역 일대입니다.', items: [
    ['후보지 선정', '견인이 잦은 지점 주변의 제휴 가능한 공간 가운데, 기기를 세운 뒤에도 보도 유효폭이 2.0m 이상 남는 곳을 고릅니다.'],
    ['보행량 판정', '15분 보행량과 남는 유효폭으로 보행류율을 계산해 보행 서비스 수준(LOS)을 정합니다.'],
    ['상태·수용량 조절', 'LOS A~C는 개방, D는 수용 대수 축소, E~F는 폐쇄합니다. 닫기 전에는 수용량을 단계적으로 낮춥니다.'],
    ['남은 기기 이동', '닫히는 존에 남은 기기를 시민이 걸어서 끌고 가까운 열린 존으로 옮깁니다. 운영사 연동 후 제공합니다.'],
  ] },
  { label: '기술', title: '같은 입력이면 같은 판정이 나오도록', lead: '판정 계산은 화면·외부 API와 분리된 서버 엔진에서 처리합니다. 입력이나 기준표가 부족하면 판정 불가로 두고 자동으로 열지 않습니다.', items: [
    ['판정 엔진', '보행류율 = 15분 보행량 ÷ 15 ÷ 유효폭(m), 단위 명/분/m. 2022 보행업무편람의 보도 LOS 기준(A≤20 … E≤106)을 참고 기준으로 씁니다.'],
    ['공공데이터', '서울시 전동킥보드 견인 이력(주소별 집계), S-DoT 유동인구(10분 관측), 서울시 지정 PM 주차구역, TAGO PM 위치, SGIS 주소 좌표를 조회합니다.'],
    ['시간 처리', '운영 시간대는 한국 시각(Asia/Seoul) 기준이며, 자정을 넘는 운영 구간과 폐쇄 전 축소를 계산합니다.'],
    ['서비스 구성', 'React·Vite·Astryx 화면, Express 조회 API, Leaflet·OpenStreetMap 지도. 운영사 잠금 해제·포인트·사진 확인은 아직 연동 전입니다.'],
  ] },
];

export default function LandingPage() {
  const svgRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [page, setPage] = useState(0);
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false); }, []);
  useEffect(() => { const svg = svgRef.current; if (svg) (playing ? svg.unpauseAnimations() : svg.pauseAnimations()); }, [playing]);
  const current = pages[page];
  return <VStack as="main" height="100dvh" gap={0} isScrollable style={{ scrollSnapType: 'y proximity', scrollBehavior: 'smooth', background: 'var(--color-background-body)' }}>
    <VStack as="section" aria-labelledby="hero-title" gap={0} style={{ ...screen, overflow: 'hidden' }}>
      <HeroScene svgRef={svgRef} />
      <HStack padding={6} hAlign="between" vAlign="center" style={{ position: 'relative' }}><Link href="/" type="large" weight="bold">PM 주차존</Link><Link href="/mobile" weight="semibold">모바일 웹</Link></HStack>
      <VStack gap={6} hAlign="center" vAlign="center" padding={6} style={{ flex: 1, position: 'relative' }}>
        <Heading level={1} id="hero-title" type="display-2" justify="center" textWrap="balance">사람이 붐비면 비우고,<br />한산하면 <Text as="span" type="inherit" color="accent">주차존</Text>으로.</Heading>
        <Text type="large" color="secondary" justify="center" textWrap="balance">보행량에 맞춰 킥보드·전기자전거 주차존을 열고 닫습니다.</Text>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="#details" type="large" style={ghost}>상세 설명</Link></HStack>
      </VStack>
      <HStack padding={6} hAlign="end" style={{ position: 'relative' }}><Button label={playing ? '배경 영상 일시정지' : '배경 영상 재생'} size="sm" variant="secondary" aria-pressed={!playing} onClick={() => setPlaying((value) => !value)} /></HStack>
    </VStack>
    <VStack as="section" id="details" aria-labelledby="details-title" gap={8} padding={8} vAlign="center" style={{ ...screen, background: 'var(--color-background-surface)' }}>
      <HStack hAlign="between" vAlign="end" gap={4} wrap="wrap">
        <VStack gap={2}><Text type="label" color="accent" aria-live="polite">{page + 1} / {pages.length} · {current.label}</Text><Heading level={2} id="details-title">{current.title}</Heading></VStack>
        <HStack gap={2}><Button label="이전" variant="secondary" isDisabled={page === 0} onClick={() => setPage(page - 1)} /><Button label="다음" variant="primary" isDisabled={page === pages.length - 1} onClick={() => setPage(page + 1)} /></HStack>
      </HStack>
      <Text type="large" color="secondary" style={{ maxWidth: '48rem' }}>{current.lead}</Text>
      <Grid columns={{ minWidth: 220, max: 4 }} gap={6}>
        {current.items.map(([title, text], index) => <VStack key={title} gap={2}><Text type="display-3" color="accent">{String(index + 1).padStart(2, '0')}</Text><Heading level={3}>{title}</Heading><Text color="secondary">{text}</Text></VStack>)}
      </Grid>
      <HStack gap={4} wrap="wrap"><Link href="#hero-title">맨 위로</Link><Link href="/service" weight="semibold">서비스 시작</Link></HStack>
    </VStack>
  </VStack>;
}
