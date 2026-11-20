// Full-screen landing: animated hero scene, then scroll-revealed explainer sections.
import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Collapsible } from '@astryxdesign/core/Collapsible';

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

const card = { background: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)', boxShadow: 'var(--shadow-low)' };
const darkCard = { background: ink, color: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)' };
const band = (tone) => ({ ...screen, background: tone === 'light' ? 'var(--color-background-surface)' : 'var(--color-background-muted)' });
const inner = { width: '100%', maxWidth: '64rem' };

const audiences = {
  operator: { label: '운영사', title: '반납 가능한 곳을 시간대별로', text: '주차존마다 지금 열려 있는지, 몇 대까지 받을 수 있는지 확인합니다.', points: ['존별 개방·축소·폐쇄 상태', '폐쇄 전 수용량 단계 조절', '남은 기기 이동 미션 (연동 예정)'] },
  district: { label: '자치구', title: '어디에, 언제 열지 데이터로', text: '견인 이력과 보행 자료로 주차존 후보지와 운영시간을 분석합니다.', points: ['견인 다발 주소별 분석', '주차존 후보 탐색지', '시간대별 운영 분석'] },
  citizen: { label: '시민', title: '가까운 열린 주차존을 바로', text: '휴대폰 지도에서 주변 주차존의 상태와 반납 가능 대수를 확인합니다.', points: ['지도와 목록으로 상태 확인', '킥보드·전기자전거별 찾기', '걸어서 옮기는 이동 미션 (준비 중)'] },
};
const moments = ['출퇴근 시간\n보도가 기기로 막힐 때', '같은 자리에서\n견인이 반복될 때', '주차구역은 있지만\n붐비는 시간이 있을 때', '닫힌 자리에\n기기가 남아 있을 때'];
const process = [
  ['후보지 선정', '견인이 잦은 지점 주변의 제휴 가능한 공간 중, 기기를 세운 뒤 유효폭이 2.0m 이상 남는 곳'],
  ['보행량 판정', '15분 보행량과 남는 유효폭으로 보행류율을 계산해 보행 서비스 수준(LOS) 판정'],
  ['상태·수용량 조절', 'LOS A~C 개방, D 수용 대수 축소, E~F 폐쇄. 닫기 전에는 수용량을 단계적으로 낮춤'],
  ['남은 기기 이동', '닫히는 존의 기기를 시민이 걸어서 끌고 가까운 열린 존으로. 운영사 연동 후 제공'],
];
const facts = [
  ['2.0m', '남는 보도 유효폭', '기기를 세운 뒤에도 남아야 하는 폭 (사업계획 설계 기준)'],
  ['15분', '보행량 집계 단위', '15분 보행량 ÷ 15 ÷ 유효폭 = 보행류율(명/분/m)'],
  ['3단계', '운영 상태', '개방 · 축소 · 폐쇄. 자료가 부족하면 판정 불가로 두고 열지 않음'],
  ['5종', '연결한 공공데이터', '견인 이력, S-DoT 유동인구, 공식 PM 주차구역, TAGO PM 위치, SGIS 주소 좌표'],
];
const faqs = [
  ['지금 실제로 운영 중인가요?', '관악구 신림역~서울대입구역 일대를 시범 지역으로 준비하고 있습니다. 운영사 잠금 해제·포인트·사진 확인은 아직 연동 전입니다.'],
  ['보행량은 어떻게 측정하나요?', '현장에서 센 15분 보행량을 판정에 씁니다. S-DoT 10분 관측과 지하철 승하차는 참고 지표로만 봅니다.'],
  ['판정 자료가 부족하면 어떻게 되나요?', '판정 불가로 표시하고 자동으로 열지 않습니다. LOS 기준은 2022 보행업무편람 수록값을 참고 기준으로 씁니다.'],
  ['이동 미션 보상은 얼마인가요?', '보상 정책과 지급 수단은 아직 정해지지 않았습니다. 이동은 기기를 타지 않고 걸어서 끌고 가는 방식만 허용합니다.'],
  ['내 위치 정보는 어디로 가나요?', '브라우저에서만 쓰며 GPS 좌표를 서버로 보내지 않습니다. 주변 지도 타일 요청은 OpenStreetMap에 전달됩니다.'],
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
  return <VStack as="main" height="100dvh" gap={0} isScrollable style={{ scrollSnapType: 'y proximity', scrollBehavior: 'smooth', wordBreak: 'keep-all', background: 'var(--color-background-body)' }}>
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

    <VStack as="section" id="details" aria-labelledby="overview-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="overview-title" kicker="서비스 개요" before="PM 주차존은 " accent="시간제 동적 주차" after={<>로<br />보행과 주차를 함께 해결합니다.</>} />
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
      <Title id="moments-title" before="이런 순간, " accent="PM 주차존" after="이 필요해요" sub="보도는 사람이 먼저 걸어야 하는 공간입니다." />
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4} width="100%" maxWidth="64rem">
        {moments.map((moment, index) => <Reveal key={moment} delay={index * 0.1} padding={6} vAlign="end" style={{ ...darkCard, minHeight: '14rem' }}><Text type="display-3" style={{ color: 'var(--color-background-muted)' }}>{String(index + 1).padStart(2, '0')}</Text><Text type="large" weight="bold" color="inherit" style={{ whiteSpace: 'pre-line' }}>{moment}</Text></Reveal>)}
      </Grid>
    </VStack>

    <VStack as="section" aria-labelledby="process-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="process-title" kicker="HOW IT WORKS" before="보행량을 보고 " accent="주차존을 조절" after="합니다" sub="후보지 선정부터 남은 기기 이동까지 네 단계로 운영합니다." />
      <Grid columns={{ minWidth: 220, max: 2 }} gap={4} width="100%" maxWidth="56rem">
        {process.map(([title, text], index) => <Reveal key={title} delay={index * 0.1} gap={3} padding={6} hAlign="center" style={{ ...card, background: 'var(--color-background-body)' }}><Text type="label" color="accent">STEP {index + 1}</Text><Heading level={3} justify="center">{title}</Heading><Text color="secondary" justify="center">{text}</Text></Reveal>)}
      </Grid>
    </VStack>

    <VStack as="section" aria-labelledby="tech-title" gap={10} padding={8} hAlign="center" vAlign="center" style={band('dark')}>
      <Title id="tech-title" kicker="기술" before="같은 입력이면 " accent="같은 판정" after="이 나옵니다" sub="판정 계산은 화면·외부 API와 분리된 서버 엔진에서 처리합니다." />
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
        <Heading level={2} justify="center" style={{ color: 'var(--color-background-surface)' }}>보행을 먼저, 주차는 유연하게</Heading>
        <Text type="large" justify="center" style={{ color: 'var(--color-background-body)' }}>지도에서 지금 이용할 수 있는 주차존을 확인하세요.</Text>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="/mobile" type="large" style={{ ...pill, border: 'var(--border-width) solid var(--color-background-surface)', color: 'var(--color-background-surface)' }}>모바일 웹</Link></HStack>
      </VStack>
    </VStack>

    <Link href="#hero-title" aria-label="맨 위로" style={{ ...pill, position: 'fixed', right: 'var(--spacing-5)', bottom: 'var(--spacing-5)', zIndex: 5, background: ink, color: 'var(--color-background-surface)', boxShadow: 'var(--shadow-med)' }}>↑ 맨 위로</Link>
  </VStack>;
}
