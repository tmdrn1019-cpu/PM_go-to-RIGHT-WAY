// Adapted from Astryx centered-hero: centered introduction, paired actions and a wide visual.
import { useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack, HStack, Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';

const cta = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-3) var(--spacing-6)', borderRadius: 'var(--radius-full)', background: 'var(--color-text-accent)', color: 'var(--color-background-surface)', fontWeight: 700, textDecoration: 'none' };

function ParkingIllustration({ crowded }) {
  return <svg viewBox="0 0 1120 390" role="img" aria-label={`운영 방식 설명 그림. ${crowded ? '혼잡할 때 주차 공간을 줄이고 보행 공간을 확보합니다.' : '한산할 때 지정된 공간을 주차존으로 엽니다.'}`} style={{ width: '100%', display: 'block' }}>
    <rect width="1120" height="390" rx="28" fill="var(--color-background-body)" />
    <path d="M0 295H1120" stroke="var(--color-text-secondary)" strokeOpacity=".12" strokeWidth="120" />
    {[0, 1, 2, 3, 4].map((n) => <g key={n} opacity=".3"><rect x={45 + n * 228} y="30" width="165" height="100" rx="8" fill="var(--color-text-secondary)" /><rect x={60 + n * 228} y="45" width="135" height="18" rx="3" fill="var(--color-background-surface)" /></g>)}
    <path d="M0 153H1120M0 234H1120" stroke="var(--color-text-secondary)" strokeOpacity=".2" strokeWidth="2" />
    <rect x="620" y="168" width={crowded ? 110 : 330} height="54" rx="12" fill={crowded ? 'var(--color-warning-muted)' : 'var(--color-success-muted)'} stroke={crowded ? 'var(--color-warning)' : 'var(--color-success)'} strokeWidth="2" strokeDasharray="7 5" />
    {Array.from({ length: crowded ? 2 : 6 }, (_, i) => <g key={i} transform={`translate(${645 + i * 48} 183)`} stroke="var(--color-text-primary)" strokeWidth="3" fill="none" strokeLinecap="round"><circle cx="0" cy="22" r="5" /><circle cx="25" cy="22" r="5" /><path d="M0 18h20l-3-27h-8M17-9h10" /></g>)}
    {Array.from({ length: crowded ? 11 : 3 }, (_, i) => <g key={i} transform={`translate(${60 + i * (crowded ? 48 : 140)} ${i % 2 ? 202 : 183})`} stroke="var(--color-text-accent)" strokeWidth="4" fill="none" strokeLinecap="round"><circle cy="-7" r="5" fill="var(--color-text-accent)" /><path d="M0 1v13m0-9-8 6m8-6 8 6M0 14l-6 12m6-12 6 12" /></g>)}
    <path d="M50 295H1070" stroke="var(--color-background-surface)" strokeWidth="3" strokeDasharray="45 32" />
    <text x="55" y="355" fontSize="20" fill="var(--color-text-secondary)">보행을 먼저, 주차는 유연하게</text>
    <text x="620" y="150" fontSize="18" fill="var(--color-text-primary)">{crowded ? '혼잡 시간 · 수용량 축소' : '한산한 시간 · 주차존 개방'}</text>
  </svg>;
}

const steps = [
  { title: '한산할 때는 주차존을 엽니다', text: '기기를 세운 뒤에도 보행 공간이 충분히 남는 곳만 엽니다.', crowded: false },
  { title: '붐비면 자리를 줄이거나 닫습니다', text: '보행량에 따라 수용 대수를 줄이고, 더 붐비면 닫습니다.', crowded: true },
  { title: '남은 기기는 열린 존으로 옮깁니다', text: '시민이 기기를 걸어서 끌고 가까운 열린 존으로 옮깁니다.', crowded: true },
];

export default function LandingPage() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  return <AppShell height="auto" variant="surface" topNav={<TopNav label="상품 안내" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} endContent={<Link href="/mobile" weight="semibold">모바일 웹</Link>} />}>
    <Layout height="auto" contentWidth="64rem" content={<LayoutContent padding={6}><VStack gap={10}>
      <VStack gap={6} hAlign="center" paddingBlock={10}>
        <Heading level={1} type="display-2" justify="center" textWrap="balance">사람이 붐비면 비우고,<br />한산하면 <Text as="span" type="inherit" color="accent">주차존</Text>으로.</Heading>
        <Text type="large" color="secondary" justify="center" textWrap="balance">보행량에 맞춰 킥보드·전기자전거 주차존을 열고 닫습니다.</Text>
        <Link href="/service" type="large" style={cta}>서비스 시작</Link>
      </VStack>
      <VStack gap={4} as="section" aria-labelledby="how-title">
        <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
          <VStack gap={1}><Text type="label" color="accent" aria-live="polite">{step + 1} / {steps.length}</Text><Heading level={2} id="how-title">{current.title}</Heading></VStack>
          <HStack gap={2}><Button label="이전" variant="secondary" isDisabled={step === 0} onClick={() => setStep(step - 1)} /><Button label="다음" variant="primary" isDisabled={step === steps.length - 1} onClick={() => setStep(step + 1)} /></HStack>
        </HStack>
        <Text type="large" color="secondary">{current.text}</Text>
        <ParkingIllustration crowded={current.crowded} />
        <Text type="supporting">설명용 그림입니다. 실제 주차존은 지도에서 확인하세요.</Text>
      </VStack>
    </VStack></LayoutContent>} />
  </AppShell>;
}
