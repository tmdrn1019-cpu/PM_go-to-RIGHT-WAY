// Full-screen landing: a time-lapse of one penalty area through the day, then scroll-revealed explainer sections.
import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { statusTone } from './panel-ui';

const pill = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-3) var(--spacing-6)', borderRadius: 'var(--radius-full)', textDecoration: 'none', fontWeight: 500 };
const cta = { ...pill, background: 'var(--color-accent)', color: 'var(--color-on-accent, var(--color-background-surface))' };
const ghost = { ...pill, border: 'var(--border-width) solid var(--color-text-primary)', color: 'var(--color-text-primary)', background: 'var(--color-background-surface)' };
// The page scrolls as the document (an inner 100dvh scroller with scroll-snap stuck on phones); svh keeps sections from
// resizing while the mobile address bar shows and hides.
const screen = { minHeight: '100svh', flexShrink: 0, position: 'relative' };
const ink = 'var(--color-text-primary)';
const red = 'var(--color-error)';
const band = (tone) => ({ ...screen, background: tone === 'light' ? 'var(--color-background-surface)' : 'var(--color-background-muted)' });

// Hero time-lapse: 역삼역 앞 penalty cells through one day, using the engine's real verdicts for 역삼동 804
// (08 유지 · 10 일부 개방 · 14 개방 · 18 유지 · 22 개방). Each phase holds for 3s of a 15s loop.
const PHASES = [['08:00', 'closed'], ['10:00', 'reduced'], ['14:00', 'open'], ['18:00', 'closed'], ['22:00', 'open']];
const LABEL = { closed: '페널티 유지', reduced: '일부 개방', open: '주차존 개방' };
const loop = { dur: '15s', repeatCount: 'indefinite', calcMode: 'discrete', keyTimes: '0;0.2;0.4;0.6;0.8;1' };
// One value per phase (the sixth closes the loop and is never shown).
const per = (pick) => [...PHASES.map(([, status]) => pick(status)), pick(PHASES[0][1])].join(';');
const CELL = { closed: { fill: 0.55, dash: 'none', width: 5 }, reduced: { fill: 0.32, dash: '16 9', width: 4 }, open: { fill: 0.1, dash: '4 9', width: 3 } };

function Walker({ y, dur, begin, show }) {
  return <g opacity="1">
    {show && <animate attributeName="opacity" values={per(show)} {...loop} />}
    <g stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" opacity=".35">
      <animateTransform attributeName="transform" type="translate" from={`-60 ${y}`} to={`1660 ${y}`} dur={dur} begin={begin} repeatCount="indefinite" />
      <circle cy="-30" r="10" fill={ink} /><path d="M0-18v28m0-20-12 12m12-12 12 12M0 10-9 34m9-24 9 24" />
    </g>
  </g>;
}

function HeroScene({ svgRef }) {
  const cells = Array.from({ length: 12 }, (_, i) => [600 + (i % 6) * 66, 648 + Math.floor(i / 6) * 58]);
  // Pedestrians: a few always, more when partly open, a crowd at the peaks.
  const always = [[700, '21s', '0s'], [735, '24s', '-9s']];
  const busy = [[690, '17s', '-4s'], [725, '19s', '-12s']];
  const crowd = [[680, '15s', '-2s'], [715, '16s', '-8s'], [740, '14s', '-5s'], [700, '18s', '-13s'], [730, '13s', '-10s']];
  return <svg ref={svgRef} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
    {[0, 1, 2, 3, 4, 5].map((n) => <rect key={n} x={40 + n * 270} y={110 + (n % 2) * 50} width="210" height={300 - (n % 2) * 50} rx="10" fill={ink} opacity=".04" />)}
    <rect y="630" width="1600" height="130" fill={ink} opacity=".06" />
    <rect y="760" width="1600" height="140" fill={ink} opacity=".12" />
    <path d="M0 830H1600" stroke="var(--color-background-surface)" strokeWidth="5" strokeDasharray="60 40" opacity=".7" />
    {/* Penalty cells: always red, darker and solid while the penalty holds. */}
    {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="60" height="52" fill={red} stroke={red}>
      <animate attributeName="fill-opacity" values={per((s) => CELL[s].fill)} {...loop} />
      <animate attributeName="stroke-dasharray" values={per((s) => CELL[s].dash)} {...loop} />
      <animate attributeName="stroke-width" values={per((s) => CELL[s].width)} {...loop} />
    </rect>)}
    {/* Scooters parked in the cells once they open (two when partly open, five when open). */}
    {[0, 1, 2, 3, 4].map((i) => <g key={i} transform={`translate(${618 + i * 80} 682)`} stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round">
      <animate attributeName="opacity" values={per((s) => (s === 'open' || (s === 'reduced' && i < 2) ? 0.7 : 0))} {...loop} />
      <circle cy="30" r="8" /><circle cx="36" cy="30" r="8" /><path d="M0 24h28l-5-40H12M23-16h14" />
    </g>)}
    {always.map(([y, dur, begin]) => <Walker key={`a${begin}`} y={y} dur={dur} begin={begin} />)}
    {busy.map(([y, dur, begin]) => <Walker key={`b${begin}`} y={y} dur={dur} begin={begin} show={(s) => (s === 'open' ? 0 : 1)} />)}
    {crowd.map(([y, dur, begin]) => <Walker key={`c${begin}`} y={y} dur={dur} begin={begin} show={(s) => (s === 'closed' ? 1 : 0)} />)}
    {/* Clock and verdict badge above the cells. */}
    {/* Kept inside x 600–1000 so a portrait phone's crop still shows the whole badge. */}
    <rect x="604" y="556" width="392" height="68" rx="34" fill="var(--color-background-surface)" opacity=".92" />
    <text x="628" y="599" fontSize="20" fill={ink} opacity=".6">역삼역</text>
    {PHASES.map(([clock, status], i) => <g key={clock} opacity={i === 0 ? 1 : 0}>
      <animate attributeName="opacity" values={[...PHASES.map((_, j) => (j === i ? 1 : 0)), i === 0 ? 1 : 0].join(';')} {...loop} />
      <text x="698" y="601" fontSize="30" fontWeight="700" fill={ink}>{clock}</text>
      <text x="800" y="601" fontSize="27" fontWeight="700" fill={{ open: 'var(--color-text-success)', reduced: 'var(--color-text-warning)', closed: red }[status]}>{LABEL[status]}</text>
    </g>)}
  </svg>;
}

const audiences = {
  operator: { label: '운영사', title: '페널티 구역을 시간마다 열고 닫기', points: ['구역별 유지 · 일부 개방 · 개방', '견인 위험 구역에서만 사진 판독', '견인 비용 절감 · 이용률 증가'] },
  district: { label: '자치구', title: '어디가, 언제 붐비는지 데이터로', points: ['견인 다발 주소별 분석', '역 주변 시간대별 혼잡 판정', '보행 안전 민원 근거'] },
  citizen: { label: '이용자', title: '한산하면 바로 반납, 위험한 자리만 사진', points: ['지금 열린 구역을 지도에서 확인', '위험 구역 밖은 사진 없이 반납', '다시 세우기 안내로 견인 예방'] },
};
const steps = [
  ['페널티 구역 확인', '견인 다발 지점 주변 칸. 서울시 지정 PM 주차구역은 그대로'],
  ['시간대별 판정', '그 역 평균+1표준편차 이상 유지, 평균 이상 일부 개방, 그 아래 개방'],
  ['반납 위치 확인', '견인 위험 구역이 아니면 사진 없이 바로 반납'],
  ['위험 구역만 사진', '차도·보도 중앙·횡단보도·점자블록을 막는지 확인 (AI 개발 예정)'],
];
const facts = [
  ['13,308건', '2025 강남구 견인', '서울 25개 구 중 1위'],
  ['13,303건', '사진으로 가려낼 수 있는 견인', '차도·횡단보도·정류소 등'],
  ['16시간', '역삼역 앞 하루 개방', '유지는 08·09·17·18시뿐'],
  ['7,765명', '역삼역 첨두 기준', '평균+1표준편차 · 평균 4,525명'],
];
const faqs = [
  ['기존 주차구역도 바뀌나요?', '아니요. 서울시 지정 PM 주차구역과 운영사의 주차가능구역은 그대로 두고, 페널티 구역만 시간마다 바꿉니다.'],
  ['보행량은 어떻게 판단하나요?', '15분 보행량 공개 자료가 없어, 역 300m 안 구역은 가장 가까운 역의 시간대별 승하차(2026년 10월 일평균)를 대리지표로 씁니다. 실증 때 현장 15분 계수로 검증합니다.'],
  ['견인이 출퇴근에 몰리나요?', '견인 데이터에는 시각이 없어 그렇게 말하지 않습니다. 장소는 견인 데이터로, 시간은 승하차 데이터로만 판단합니다.'],
  ['사진은 언제 찍나요?', '견인 위험 구역에 반납할 때만 한 장입니다. 지금 시연은 사진을 서버로 보내지 않는 모의 동작입니다.'],
  ['지금 실제로 운영 중인가요?', '강남구 역삼역 · 삼성중앙역 일대를 시범 지역으로 준비 중입니다. 운영사 앱 연동과 사진 AI는 아직 연동 전입니다.'],
];

// Fades a block in the first time it scrolls into view.
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

function Title({ kicker, before, accent, after, id }) {
  return <Reveal gap={3} hAlign="center">
    {kicker && <Text type="label" color="accent">{kicker}</Text>}
    <Heading level={2} id={id} type="display-3" justify="center" textWrap="balance">{before}<Text as="span" type="inherit" color="accent">{accent}</Text>{after}</Heading>
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
      <VStack gap={6} hAlign="center" padding={6} style={{ flex: 1, position: 'relative', paddingTop: '8svh' }}>
        <Heading level={1} id="hero-title" type="display-2" justify="center" textWrap="balance">한산할 땐 열고,<br />위험한 자리만 <Text as="span" type="inherit" color="accent">사진으로</Text>.</Heading>
        <Text type="large" color="secondary" justify="center" textWrap="balance">운영사 앱의 페널티 구역을 견인·혼잡 데이터로 시간마다 바꿉니다.</Text>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="#details" type="large" style={ghost}>자세히 보기</Link></HStack>
      </VStack>
      <HStack padding={6} hAlign="start" style={{ position: 'relative' }}><Button label={playing ? '배경 영상 일시정지' : '배경 영상 재생'} size="sm" variant="secondary" aria-pressed={!playing} onClick={() => setPlaying((value) => !value)} /></HStack>
    </VStack>

    <VStack as="section" id="details" aria-labelledby="overview-title" gap={8} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="overview-title" kicker="서비스 개요" before="바꾸는 것은 " accent="페널티 구역의 시간" after="뿐입니다" />
      <Reveal gap={5} hAlign="center" delay={0.1} style={{ width: '100%', maxWidth: '48rem' }}>
        <SegmentedControl label="대상" layout="fill" value={audience} onChange={setAudience}>{Object.entries(audiences).map(([id, item]) => <SegmentedControlItem key={id} value={id} label={item.label} />)}</SegmentedControl>
        <Card variant="muted" padding={8} width="100%"><VStack gap={5} hAlign="center" aria-live="polite">
          <Heading level={3} justify="center">{who.title}</Heading>
          <Grid columns={{ minWidth: 180, max: 3 }} gap={3} width="100%">{who.points.map((point) => <Card key={point} padding={4}><Text type="label" justify="center">{point}</Text></Card>)}</Grid>
        </VStack></Card>
      </Reveal>
    </VStack>

    <VStack as="section" aria-labelledby="process-title" gap={8} padding={8} hAlign="center" vAlign="center" style={band('dark')}>
      <Title id="process-title" kicker="작동 방식" before="장소는 견인, " accent="시간은 승하차" after="로" />
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4} width="100%" maxWidth="64rem">
        {steps.map(([title, text], index) => <Reveal key={title} delay={index * 0.1}><Card padding={6} minHeight="12rem"><VStack gap={3}><Text type="label" color="accent">STEP {index + 1}</Text><Heading level={3}>{title}</Heading><Text color="secondary">{text}</Text></VStack></Card></Reveal>)}
      </Grid>
      <Reveal><HStack gap={2} wrap="wrap" hAlign="center">{['closed', 'reduced', 'open'].map((s) => <Card key={s} variant={statusTone[s]} padding={3}><Text type="label">{LABEL[s]}</Text></Card>)}</HStack></Reveal>
    </VStack>

    <VStack as="section" aria-labelledby="facts-title" gap={8} padding={8} hAlign="center" vAlign="center" style={band('light')}>
      <Title id="facts-title" kicker="데이터" before="공공데이터로 " accent="확인한 숫자" />
      <Grid columns={{ minWidth: 200, max: 4 }} gap={4} width="100%" maxWidth="64rem">
        {facts.map(([value, label, text], index) => <Reveal key={label} delay={index * 0.1}><Card variant="muted" padding={6}><VStack gap={2} hAlign="center"><Text type="display-3" color="accent">{value}</Text><Text type="label" justify="center">{label}</Text><Text type="supporting" justify="center">{text}</Text></VStack></Card></Reveal>)}
      </Grid>
      <Reveal><Text type="supporting" justify="center">서울시 전동킥보드 견인 현황 2025 · 지하철 시간대별 승하차 2026.10 일평균</Text></Reveal>
    </VStack>

    <VStack as="section" aria-labelledby="faq-title" gap={0} style={band('dark')}>
      <VStack gap={8} padding={8} hAlign="center" vAlign="center" style={{ flex: 1 }}>
        <Title id="faq-title" before="자주 묻는 " accent="질문" />
        <Reveal gap={3} style={{ width: '100%', maxWidth: '48rem' }}>{faqs.map(([question, answer]) => <Card key={question} padding={4}><Collapsible trigger={<Text type="label">Q. {question}</Text>} defaultIsOpen={false}><Text color="secondary">A. {answer}</Text></Collapsible></Card>)}</Reveal>
      </VStack>
      <VStack gap={5} padding={10} hAlign="center" style={{ background: ink }}>
        <Heading level={2} justify="center" style={{ color: 'var(--color-background-surface)' }}>지금 페널티 구역이 열렸는지 확인하세요</Heading>
        <HStack gap={3} wrap="wrap" hAlign="center"><Link href="/service" type="large" style={cta}>서비스 시작</Link><Link href="/mobile" type="large" style={{ ...pill, border: 'var(--border-width) solid var(--color-background-surface)', color: 'var(--color-background-surface)' }}>모바일 웹</Link></HStack>
      </VStack>
    </VStack>

    <Link href="#hero-title" aria-label="맨 위로" style={{ ...pill, position: 'fixed', right: 'var(--spacing-5)', bottom: 'var(--spacing-5)', zIndex: 5, background: ink, color: 'var(--color-background-surface)', boxShadow: 'var(--shadow-med)' }}>↑ 맨 위로</Link>
  </VStack>;
}
