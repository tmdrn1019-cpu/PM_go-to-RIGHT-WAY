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
// (08 유지 · 10 일부 개방 · 14 개방 · 18 유지 · 22 개방). Each hour holds for 3s of a 15s loop, then cross-fades.
const PHASES = [['08:00', 'closed'], ['10:00', 'reduced'], ['14:00', 'open'], ['18:00', 'closed'], ['22:00', 'open']];
const LABEL = { closed: '페널티 유지', reduced: '일부 개방', open: '주차존 개방' };
const DUR = '15s';
// Smooth loop: hold each phase, then ease into the next over the last 0.4s of its slot.
const RAMP = 0.027;
const smoothTimes = [0, ...PHASES.flatMap((_, i) => [(i + 1) / 5 - RAMP, (i + 1) / 5])].map((t) => +t.toFixed(3));
const ease = { dur: DUR, repeatCount: 'indefinite', calcMode: 'spline', keyTimes: smoothTimes.join(';'), keySplines: Array(smoothTimes.length - 1).fill('0.4 0 0.2 1').join(';') };
const glide = (values) => [values[0], ...values.flatMap((v, i) => [v, values[(i + 1) % values.length]])].join(';');
const per = (pick) => glide(PHASES.map(([clock, status]) => pick(status, clock)));
// Values that cannot be interpolated (dash patterns) switch at the slot edges.
const step = { dur: DUR, repeatCount: 'indefinite', calcMode: 'discrete', keyTimes: '0;0.2;0.4;0.6;0.8;1' };
const perStep = (pick) => [...PHASES.map(([, status]) => pick(status)), pick(PHASES[0][1])].join(';');
const CELL = { closed: { fill: 0.58, width: 4, dash: 'none' }, reduced: { fill: 0.34, width: 3.5, dash: '14 8' }, open: { fill: 0.12, width: 3, dash: '4 8' } };
const STATUS_COLOR = { open: 'var(--color-text-success)', reduced: 'var(--color-text-warning)', closed: red };
// How dark the street gets at each hour (dusk at 18, night at 22) and how many walkers are out.
const NIGHT = { '08:00': 0, '10:00': 0, '14:00': 0, '18:00': 0.05, '22:00': 0.12 };
const LIGHTS = { '08:00': 0, '10:00': 0, '14:00': 0, '18:00': 0.5, '22:00': 1 };

function Walker({ y, dur, begin, scale = 1, show, reverse }) {
  const [from, to] = reverse ? [1660, -60] : [-60, 1660];
  return <g>
    {show && <animate attributeName="opacity" values={per(show)} {...ease} />}
    <g fill={ink} opacity=".42">
      <animateTransform attributeName="transform" type="translate" from={`${from} ${y}`} to={`${to} ${y}`} dur={dur} begin={begin} repeatCount="indefinite" />
      <g transform={`scale(${reverse ? -scale : scale} ${scale})`}>
        {/* Bob slightly with each step. */}
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.6s" begin={begin} repeatCount="indefinite" additive="sum" />
        <circle cy="-44" r="9" />
        <path d="M-8-32h16l3 26h-22z" />
        <path d="M-5-7L-11 22M5-7L13 22" stroke={ink} strokeWidth="6" strokeLinecap="round">
          <animate attributeName="d" values="M-5-7L-11 22M5-7L13 22;M-5-7L-1 22M5-7L-3 22;M-5-7L-11 22M5-7L13 22" dur="0.6s" begin={begin} repeatCount="indefinite" />
        </path>
      </g>
    </g>
  </g>;
}

function Scooter({ x, y, show }) {
  return <g transform={`translate(${x} ${y})`} opacity="0">
    <animate attributeName="opacity" values={per(show)} {...ease} />
    <animateTransform attributeName="transform" type="translate" values={per((s) => (show(s) ? `${x} ${y}` : `${x} ${y - 14}`))} {...ease} />
    <g stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" fill="none">
      <path d="M2 26h30M28 26 22-6M16-6h12" />
    </g>
    <circle cx="4" cy="28" r="6" fill="var(--color-accent)" /><circle cx="32" cy="28" r="6" fill="var(--color-accent)" />
  </g>;
}

function Car({ y, dur, begin, width = 150, reverse }) {
  const [from, to] = reverse ? [1700, -200] : [-200, 1700];
  return <g fill={ink} opacity=".16">
    <animateTransform attributeName="transform" type="translate" from={`${from} ${y}`} to={`${to} ${y}`} dur={dur} begin={begin} repeatCount="indefinite" />
    <rect x="0" y="-26" width={width} height="34" rx="12" />
    <rect x={width * 0.2} y="-46" width={width * 0.55} height="26" rx="10" />
    <circle cx={width * 0.2} cy="10" r="11" /><circle cx={width * 0.8} cy="10" r="11" />
  </g>;
}

function HeroScene({ svgRef }) {
  const cells = Array.from({ length: 12 }, (_, i) => [604 + (i % 6) * 66, 650 + Math.floor(i / 6) * 56]);
  const buildings = [[20, 250, 230], [270, 190, 300], [500, 280, 210], [1010, 220, 250], [1280, 170, 290], [1460, 260, 160]];
  return <svg ref={svgRef} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
    <defs>
      <radialGradient id="hero-lamp"><stop offset="0" stopColor="var(--color-warning)" stopOpacity=".5" /><stop offset="1" stopColor="var(--color-warning)" stopOpacity="0" /></radialGradient>
      <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ink} stopOpacity="0" /><stop offset="1" stopColor={ink} stopOpacity="1" /></linearGradient>
    </defs>
    {/* Skyline: faint blocks with window grids that light up after dusk. */}
    {buildings.map(([x, top, w]) => <g key={x}>
      <rect x={x} y={top} width={w} height={630 - top} rx="8" fill={ink} opacity=".05" />
      {Array.from({ length: Math.floor((600 - top) / 56) * Math.floor(w / 50) }, (_, i) => {
        const cols = Math.floor(w / 50); const wx = x + 18 + (i % cols) * 50; const wy = top + 22 + Math.floor(i / cols) * 56;
        return <rect key={i} x={wx} y={wy} width="22" height="26" rx="3" fill={(i * 7) % 5 < 2 ? 'var(--color-warning)' : ink} opacity=".04">
          {(i * 7) % 5 < 2 && <animate attributeName="opacity" values={per((_, clock) => 0.04 + LIGHTS[clock] * 0.14)} {...ease} />}
        </rect>;
      })}
    </g>)}
    {/* Sidewalk, curb and road with a crosswalk. */}
    <rect y="630" width="1600" height="132" fill={ink} opacity=".06" />
    <rect y="756" width="1600" height="8" fill={ink} opacity=".1" />
    <rect y="764" width="1600" height="136" fill={ink} opacity=".13" />
    <path d="M0 832H1600" stroke="var(--color-background-surface)" strokeWidth="4" strokeDasharray="56 40" opacity=".6" />
    {Array.from({ length: 6 }, (_, i) => <rect key={i} x={1140 + i * 30} y="770" width="16" height="124" fill="var(--color-background-surface)" opacity=".55" />)}
    {/* Station entrance sign and trees along the curb. */}
    <g transform="translate(520 586)"><rect width="8" height="170" x="20" y="0" fill={ink} opacity=".25" /><rect width="48" height="48" rx="10" fill="var(--color-accent)" opacity=".85" /><text x="24" y="33" fontSize="24" fontWeight="700" textAnchor="middle" fill="var(--color-background-surface)">역</text></g>
    {[180, 380, 1090, 1460].map((x) => <g key={x} opacity=".16" fill={ink}><rect x={x - 4} y="690" width="8" height="66" /><circle cx={x} cy="676" r="30" /><circle cx={x - 20} cy="690" r="20" /><circle cx={x + 20} cy="690" r="20" /></g>)}
    {/* Streetlights: glow at dusk and night. */}
    {[460, 1060].map((x) => <g key={x}>
      <rect x={x - 3} y="560" width="6" height="196" fill={ink} opacity=".22" /><rect x={x - 22} y="556" width="44" height="8" rx="4" fill={ink} opacity=".22" />
      <circle cx={x} cy="600" r="120" fill="url(#hero-lamp)" opacity="0"><animate attributeName="opacity" values={per((_, clock) => LIGHTS[clock])} {...ease} /></circle>
    </g>)}
    <Car y={812} dur="9s" begin="0s" /><Car y={874} dur="7s" begin="-3s" width={130} reverse /><Car y={812} dur="11s" begin="-6s" width={170} />
    {/* Penalty cells: always red, darker and solid while the penalty holds. */}
    {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="60" height="50" rx="4" fill={red} stroke={red} fillOpacity={CELL.closed.fill}>
      <animate attributeName="fill-opacity" values={per((s) => CELL[s].fill)} {...ease} />
      <animate attributeName="stroke-width" values={per((s) => CELL[s].width)} {...ease} />
      <animate attributeName="stroke-dasharray" values={perStep((s) => CELL[s].dash)} {...step} />
    </rect>)}
    {/* A soft pulse around the area while the penalty holds. */}
    <rect x="596" y="642" width="408" height="120" rx="10" fill="none" stroke={red} strokeWidth="3" opacity="0">
      <animate attributeName="opacity" values={per((s) => (s === 'closed' ? 0.5 : 0))} {...ease} />
    </rect>
    {/* Scooters parked once the cells open: two when partly open, five when open. */}
    {[0, 1, 2, 3, 4].map((i) => <Scooter key={i} x={618 + i * 80} y={668 + (i % 2) * 52} show={(s) => (s === 'open' || (s === 'reduced' && i < 2) ? 1 : 0)} />)}
    {/* Pedestrians: a few always, more when busy, a crowd at the peaks; dimmer at night. */}
    <Walker y={738} dur="22s" begin="0s" />
    <Walker y={700} dur="26s" begin="-11s" scale={0.9} reverse />
    {[[722, '18s', '-4s', false], [748, '20s', '-13s', true]].map(([y, dur, begin, reverse]) => <Walker key={begin} y={y} dur={dur} begin={begin} reverse={reverse} show={(s) => (s === 'open' ? 0 : 1)} />)}
    {[[690, '15s', '-2s', false], [730, '16s', '-8s', true], [752, '14s', '-5s', false], [712, '17s', '-12s', true], [742, '13s', '-9s', false], [704, '19s', '-6s', true]].map(([y, dur, begin, reverse]) => <Walker key={begin} y={y} dur={dur} begin={begin} reverse={reverse} scale={0.95} show={(s) => (s === 'closed' ? 1 : 0)} />)}
    {/* Dusk and night: darken only the street below the headline. */}
    <rect y="520" width="1600" height="380" fill="url(#hero-fade)" opacity="0"><animate attributeName="opacity" values={per((_, clock) => NIGHT[clock] * 3)} {...ease} /></rect>
    {/* Clock badge with the day's timeline; kept inside x 600–1000 so a portrait phone's crop shows all of it. */}
    <rect x="604" y="534" width="392" height="96" rx="24" fill="var(--color-background-surface)" opacity=".94" />
    <text x="628" y="574" fontSize="20" fill={ink} opacity=".6">역삼역</text>
    {PHASES.map(([clock, status], i) => <g key={clock} opacity={i === 0 ? 1 : 0}>
      <animate attributeName="opacity" values={glide(PHASES.map((_, j) => (j === i ? 1 : 0)))} {...ease} />
      <text x="698" y="576" fontSize="30" fontWeight="700" fill={ink}>{clock}</text>
      <text x="800" y="576" fontSize="27" fontWeight="700" fill={STATUS_COLOR[status]}>{LABEL[status]}</text>
    </g>)}
    <path d="M640 606H960" stroke={ink} strokeWidth="3" opacity=".15" strokeLinecap="round" />
    {PHASES.map(([clock, status], i) => <g key={clock}>
      <circle cx={640 + i * 80} cy="606" r="6" fill={STATUS_COLOR[status]} />
      <text x={640 + i * 80} y="626" fontSize="13" textAnchor="middle" fill={ink} opacity=".5">{clock.slice(0, 2)}시</text>
    </g>)}
    <circle cx="0" cy="606" r="10" fill="none" stroke={ink} strokeWidth="3">
      <animate attributeName="cx" values={glide(PHASES.map((_, i) => 640 + i * 80))} {...ease} />
    </circle>
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
