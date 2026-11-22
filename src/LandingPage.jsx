// Full-screen landing: animated hero scene, then scroll-revealed explainer sections.
import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Collapsible } from '@astryxdesign/core/Collapsible';

const pill = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-3) var(--spacing-6)', borderRadius: 'var(--radius-full)', textDecoration: 'none', fontWeight: 500 };
const cta = { ...pill, background: 'var(--color-accent)', color: 'var(--color-on-accent, var(--color-background-surface))' };
const ghost = { ...pill, border: 'var(--border-width) solid var(--color-text-primary)', color: 'var(--color-text-primary)' };
// The page scrolls as the document (an inner 100dvh scroller with scroll-snap stuck on phones); svh keeps sections from
// resizing while the mobile address bar shows and hides.
const screen = { minHeight: '100svh', flexShrink: 0, position: 'relative' };
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

const card = { background: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)', boxShadow: 'var(--shadow-low)' };
const darkCard = { background: ink, color: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)' };
const band = (tone) => ({ ...screen, background: tone === 'light' ? 'var(--color-background-surface)' : 'var(--color-background-muted)' });
const inner = { width: '100%', maxWidth: '64rem' };

const audiences = {
  operator: { label: '운영사', title: '페널티 구역을 시간마다 열고 닫기', text: '앱의 페널티 구역을 견인·혼잡 데이터로 시간마다 판정해, 한산한 시간에는 주차존으로 엽니다.', points: ['구역별 페널티 유지 · 일부 개방 · 주차존 개방', '견인 위험 구역에서만 사진 판독', '견인 비용 절감 · 반납할 곳이 늘어 이용률 증가'] },
  district: { label: '자치구', title: '어디가, 언제 붐비는지 데이터로', text: '견인 이력과 지하철 승하차로 페널티 구역과 주차구역의 운영 시간을 분석합니다.', points: ['견인 다발 주소별 분석', '역 주변 시간대별 혼잡 판정', '보행 안전 민원 근거'] },
  citizen: { label: '이용자', title: '한산하면 바로 반납, 위험한 자리만 사진 한 장', text: '대부분의 자리에서는 그대로 반납하고, 견인 위험 구역에서만 사진으로 확인합니다.', points: ['지금 열린 구역을 지도에서 확인', '위험 구역 밖은 사진 없이 반납', '다시 세우기 안내로 견인 예방'] },
};
const moments = ['출퇴근 시간\n역 앞 보도가 붐빌 때', '같은 주소에서\n견인이 반복될 때', '한산한 시간에도\n반납을 막아 불편할 때', '횡단보도·점자블록을\n기기가 막을 때'];
const process = [
  ['페널티 구역 확인', '운영사 앱의 페널티 구역 중 견인 다발 지점 주변. 서울시 지정 PM 주차구역은 그대로 둠'],
  ['시간대별 판정', '가장 가까운 역의 그 시간 승하차가 그 역 평균+1표준편차 이상이면 페널티 유지, 평균 이상이면 일부 개방, 평균 미만이면 주차존 개방'],
  ['반납 위치 확인', '견인 위험 구역이 아니면 사진 없이 바로 반납'],
  ['위험 구역만 사진', '차도 위 · 보도 중앙 · 횡단보도 · 점자블록을 막는지 보고 정상 반납 또는 다시 세우기 요청 (AI는 개발 예정)'],
];
const facts = [
  ['13,303건', '사진으로 가려낼 수 있는 견인', '2025 강남구 견인 13,308건 중 차도·횡단보도·정류소·지하철역·점자블록 등 (오신고 3건 제외)'],
  ['2건', '위치로 판정하는 견인', '보호구역은 사진으로 알 수 없어 지오펜스로'],
  ['평균+1σ', '각 역 자신의 하루 분포', '역삼역 시간당 7,765명↑ 유지 · 4,525명↑ 일부 개방'],
  ['16시간', '역삼역 앞 하루 개방', '페널티 유지는 첨두 08·09·17·18시 4시간'],
];
const faqs = [
  ['기존 주차구역도 바뀌나요?', '아니요. 서울시 지정 PM 주차구역과 운영사의 주차가능구역은 그대로 두고, 페널티 구역만 시간마다 바꿉니다.'],
  ['보행량은 어떻게 판단하나요?', '15분 보행량 공개 자료가 없어, 역 300m 안 구역은 가장 가까운 역의 시간대별 승하차(2026년 10월 일평균)를 대리지표로 씁니다. 실증 때 현장 15분 계수로 검증합니다.'],
  ['견인이 출퇴근에 몰리나요?', '견인 데이터에는 시각이 없어 그렇게 말하지 않습니다. 장소는 견인 데이터로, 시간은 승하차 데이터로만 판단합니다.'],
  ['사진은 언제 찍나요?', '견인 위험 구역에 반납할 때만 한 장입니다. 얼굴·번호판은 자동으로 가리고 판독 후 삭제하는 것이 원칙이며, 지금 시연은 사진을 서버로 보내지 않는 모의 동작입니다.'],
  ['지금 실제로 운영 중인가요?', '강남구 2호선 역삼역 · 9호선 삼성중앙역 일대를 시범 지역으로 준비 중입니다. 기존 지정 PM 주차구역 58곳은 그대로 둡니다. 운영사 앱 연동과 사진 AI는 아직 연동 전입니다.'],
];

// Fades a block in the first time it scrolls into view, like the reference page.
function Reveal({ children, delay = 0, ...props }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setShown(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect(); } }, { threshold: 0.15 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <VStack ref={ref} gap={0} {...props} style={{ ...props.style, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(var(--spacing-6))', transition: `opacity .7s ease ${delay}s, transform .7s ease ${delay}s` }}>{children}</VStack>;
}

function Title({ kicker, before, accent, after, sub, id }) {
  return <Reveal gap={3} hAlign="center">
    {kicker && <Text type="label" color="accent">{kicker}</Text>}
    <Heading level={2} id={id} type="display-3" justify="center" textWrap="balance">{before}<Text as="span" type="inherit" color="accent">{accent}</Text>{after}</Heading>
    {sub && <Text type="large" color="secondary" justify="center">{sub}</Text>}
  </Reveal>;
}

export default function LandingPage() {
  const svgRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [audience, setAudience] = useState('operator');
  useEffect(() => { const svg = svgRef.current; if (svg) (playing ? svg.unpauseAnimations() : svg.pauseAnimations()); }, [playing]);
  const who = audiences[audience];
  return <VStack as="main" gap={0} style={{ wordBreak: 'keep-all', background: 'var(--color-background-body)' }}>
    <VStack as="section" aria-labelledby="hero-title" gap={0} style={{ ...screen, overflow: 'hidden' }}>
      <HeroScene svgRef={svgRef} />
      <HStack padding={6} hAlign="between" vAlign="center" style={{ position: 'relative' }}><Link href="/" type="large" weight="bold">PM 주차존</Link><Link href="/mobile" weight="semibold">모바일 웹</Link></HStack>
      <VStack gap={6} hAlign="center" vAlign="center" padding={6} style={{ flex: 1, position: 'relative' }}>
        <Heading level={1} id="hero-title" type="display-2" justify="center" textWrap="balance">한산할 땐 열고,<br />위험한 자리만 <Text as="span" type="inherit" color="accent">사진으로</Text>.</Heading>
        <Text type="large" color="secondary" justify="center" textWrap="balance">운영사 앱의 페널티 구역을 견인·혼잡 데이터로 시간마다 바꿉니다.</Text>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="#details" type="large" style={ghost}>상세 설명</Link></HStack>
      </VStack>
      <HStack padding={6} hAlign="end" style={{ position: 'relative' }}><Button label={playing ? '배경 영상 일시정지' : '배경 영상 재생'} size="sm" variant="secondary" aria-pressed={!playing} onClick={() => setPlaying((value) => !value)} /></HStack>
    </VStack>

    <VStack as="section" id="details" aria-labelledby="overview-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="overview-title" kicker="서비스 개요" before="바꾸는 것은 " accent="페널티 구역의 시간" after={<>입니다.<br />기존 주차가능구역은 그대로 둡니다.</>} />
      <Reveal gap={8} hAlign="center" delay={0.1} style={inner}>
        <HStack gap={2} hAlign="center" wrap="wrap">{Object.entries(audiences).map(([id, item]) => <Button key={id} label={item.label} variant={audience === id ? 'primary' : 'secondary'} aria-pressed={audience === id} onClick={() => setAudience(id)} />)}</HStack>
        <VStack gap={6} padding={8} hAlign="center" style={{ ...card, width: '100%', background: 'var(--color-background-body)' }} aria-live="polite">
          <Heading level={3} type="display-3" justify="center">{who.title}</Heading>
          <Text type="large" color="secondary" justify="center">{who.text}</Text>
          <Grid columns={{ minWidth: 200, max: 3 }} gap={4} width="100%">{who.points.map((point) => <VStack key={point} padding={5} hAlign="center" style={card}><Text type="label" justify="center">{point}</Text></VStack>)}</Grid>
        </VStack>
      </Reveal>
    </VStack>

    <VStack as="section" aria-labelledby="moments-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('dark')}>
      <Title id="moments-title" before="이런 순간, " accent="PM 주차존" after="이 필요해요" sub="강남구는 2025년 킥보드 견인 13,308건으로 서울 1위(21%)입니다." />
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4} width="100%" maxWidth="64rem">
        {moments.map((moment, index) => <Reveal key={moment} delay={index * 0.1} padding={6} vAlign="end" style={{ ...darkCard, minHeight: '14rem' }}><Text type="display-3" style={{ color: 'var(--color-background-muted)' }}>{String(index + 1).padStart(2, '0')}</Text><Text type="large" weight="bold" color="inherit" style={{ whiteSpace: 'pre-line' }}>{moment}</Text></Reveal>)}
      </Grid>
    </VStack>

    <VStack as="section" aria-labelledby="process-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="process-title" kicker="HOW IT WORKS" before="장소는 견인, " accent="시간은 승하차" after="로 판정합니다" sub="페널티 구역 판정과 위험 구역 사진 확인, 네 단계입니다." />
      <Grid columns={{ minWidth: 220, max: 2 }} gap={4} width="100%" maxWidth="56rem">
        {process.map(([title, text], index) => <Reveal key={title} delay={index * 0.1} gap={3} padding={6} hAlign="center" style={{ ...card, background: 'var(--color-background-body)' }}><Text type="label" color="accent">STEP {index + 1}</Text><Heading level={3} justify="center">{title}</Heading><Text color="secondary" justify="center">{text}</Text></Reveal>)}
      </Grid>
    </VStack>

    <VStack as="section" aria-labelledby="tech-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('dark')}>
      <Title id="tech-title" kicker="데이터" before="공공데이터로 " accent="확인한 것" after="만 씁니다" sub="판정 계산은 화면과 분리된 서버 엔진에서 처리합니다." />
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4} width="100%" maxWidth="64rem">
        {facts.map(([value, label, text], index) => <Reveal key={label} delay={index * 0.1} gap={2} padding={6} hAlign="center" style={card}><Text type="label" color="secondary">{label}</Text><Text type="display-2" color="accent">{value}</Text><Text type="supporting" justify="center">{text}</Text></Reveal>)}
      </Grid>
      <Reveal><Text type="supporting" justify="center">React · Vite · Astryx 화면 / Express 조회 API / Leaflet · OpenStreetMap 지도 / 한국 시각(Asia/Seoul) 기준 운영 시간 계산</Text></Reveal>
    </VStack>

    <VStack as="section" aria-labelledby="faq-title" gap={0} style={band('light')}>
      <VStack gap={8} padding={8} hAlign="center" vAlign="center" style={{ flex: 1 }}>
        <Title id="faq-title" before="자주 묻는 " accent="질문" />
        <Reveal gap={3} style={{ width: '100%', maxWidth: '48rem' }}>{faqs.map(([question, answer]) => <VStack key={question} padding={4} style={{ ...card, background: 'var(--color-background-body)' }}><Collapsible trigger={<Text type="label">Q. {question}</Text>} defaultIsOpen={false}><Text color="secondary">A. {answer}</Text></Collapsible></VStack>)}</Reveal>
      </VStack>
      <VStack gap={5} padding={10} hAlign="center" style={{ background: ink }}>
        <Heading level={2} justify="center" style={{ color: 'var(--color-background-surface)' }}>한산할 땐 열고, 위험한 자리만 사진으로</Heading>
        <Text type="large" justify="center" style={{ color: 'var(--color-background-body)' }}>지도에서 지금 페널티 구역이 열렸는지 확인하세요.</Text>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="/mobile" type="large" style={{ ...pill, border: 'var(--border-width) solid var(--color-background-surface)', color: 'var(--color-background-surface)' }}>모바일 웹</Link></HStack>
      </VStack>
    </VStack>

    <Link href="#hero-title" aria-label="맨 위로" style={{ ...pill, position: 'fixed', right: 'var(--spacing-5)', bottom: 'var(--spacing-5)', zIndex: 5, background: ink, color: 'var(--color-background-surface)', boxShadow: 'var(--shadow-med)' }}>↑ 맨 위로</Link>
  </VStack>;
}
