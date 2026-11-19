// Adapted from Astryx centered-hero: centered introduction, paired actions and a wide visual.
import { useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack, HStack, Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Divider } from '@astryxdesign/core/Divider';

const cta = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-3) var(--spacing-6)', borderRadius: 'var(--radius-full)', background: 'var(--color-accent)', color: 'var(--color-on-accent)', textDecoration: 'none' };

function ParkingIllustration({ crowded }) {
  return <svg viewBox="0 0 1120 390" role="img" aria-label={`운영 방식 설명 그림. ${crowded ? '혼잡할 때 주차 공간을 줄이고 보행 공간을 확보합니다.' : '한산할 때 지정된 공간을 주차존으로 엽니다.'}`} style={{ width: '100%', display: 'block' }}>
    <rect width="1120" height="390" rx="28" fill="var(--color-background-body)" />
    <path d="M0 295H1120" stroke="var(--color-text-secondary)" strokeOpacity=".12" strokeWidth="120" />
    {[0, 1, 2, 3, 4].map((n) => <g key={n} opacity=".3"><rect x={45 + n * 228} y="30" width="165" height="100" rx="8" fill="var(--color-text-secondary)" /><rect x={60 + n * 228} y="45" width="135" height="18" rx="3" fill="var(--color-background-surface)" /></g>)}
    <path d="M0 153H1120M0 234H1120" stroke="var(--color-text-secondary)" strokeOpacity=".2" strokeWidth="2" />
    <rect x="620" y="168" width={crowded ? 110 : 330} height="54" rx="12" fill={crowded ? 'var(--color-warning-muted)' : 'var(--color-success-muted)'} stroke={crowded ? 'var(--color-warning)' : 'var(--color-success)'} strokeWidth="2" strokeDasharray="7 5" />
    {Array.from({ length: crowded ? 2 : 6 }, (_, i) => <g key={i} transform={`translate(${645 + i * 48} 183)`} stroke="var(--color-text-primary)" strokeWidth="3" fill="none" strokeLinecap="round"><circle cx="0" cy="22" r="5" /><circle cx="25" cy="22" r="5" /><path d="M0 18h20l-3-27h-8M17-9h10" /></g>)}
    {Array.from({ length: crowded ? 11 : 3 }, (_, i) => <g key={i} transform={`translate(${60 + i * (crowded ? 48 : 140)} ${i % 2 ? 202 : 183})`} stroke="var(--color-accent)" strokeWidth="4" fill="none" strokeLinecap="round"><circle cy="-7" r="5" fill="var(--color-accent)" /><path d="M0 1v13m0-9-8 6m8-6 8 6M0 14l-6 12m6-12 6 12" /></g>)}
    <path d="M50 295H1070" stroke="var(--color-background-surface)" strokeWidth="3" strokeDasharray="45 32" />
    <text x="55" y="355" fontSize="20" fill="var(--color-text-secondary)">보행을 먼저, 주차는 유연하게</text>
    <text x="620" y="150" fontSize="18" fill="var(--color-text-primary)">{crowded ? '혼잡 시간 · 수용량 축소' : '한산한 시간 · 주차존 개방'}</text>
  </svg>;
}

export default function LandingPage() {
  const [crowded, setCrowded] = useState(false);
  return <AppShell height="auto" variant="surface" topNav={<TopNav label="상품 안내" heading={<Link href="/" type="large" weight="bold">PM 주차존</Link>} startContent={<HStack gap={5} wrap="wrap"><Link href="#how">운영 방식</Link><Link href="#citizens">시민 이용</Link><Link href="#partners">운영사·자치구</Link></HStack>} endContent={<Link href="/service" weight="semibold">지도 서비스</Link>} />}>
    <Layout height="auto" contentWidth="76rem" content={<LayoutContent padding={6}><VStack gap={10}>
      <VStack gap={6} hAlign="center" paddingBlock={10}>
        <Text type="label" color="accent">보행을 먼저 생각하는 동적 PM 주차</Text>
        <Heading level={1} type="display-2" justify="center" textWrap="balance">사람의 흐름에 따라,<br />주차 공간도 유연하게.</Heading>
        <Text type="large" color="secondary" justify="center" textWrap="balance" style={{ maxWidth: '42rem' }}>붐비는 시간에는 길을 비우고, 한산할 때는 주차 공간으로.<br />보행량과 보도 유효폭을 바탕으로 킥보드·전기자전거 주차존을 운영합니다.</Text>
        <HStack gap={5} wrap="wrap" hAlign="center"><Link href="#how" type="large" hasUnderline>어떻게 운영되나요?</Link><Link href="/mobile" type="large" hasUnderline>모바일에서 이용하기</Link></HStack>
      </VStack>
      <VStack gap={4}>
        <HStack hAlign="between" gap={3} wrap="wrap"><Text type="label">같은 공간, 시간에 따라 다른 쓰임</Text><HStack gap={2}><Button label="한산할 때" size="sm" variant={!crowded ? 'primary' : 'secondary'} aria-pressed={!crowded} onClick={() => setCrowded(false)} /><Button label="혼잡할 때" size="sm" variant={crowded ? 'primary' : 'secondary'} aria-pressed={crowded} onClick={() => setCrowded(true)} /></HStack></HStack>
        <ParkingIllustration crowded={crowded} />
        <Text type="supporting">운영 방식을 설명하는 그림입니다. 실제 운영 지역과 현재 주차존은 지도 서비스에서 확인할 수 있습니다.</Text>
      </VStack>
      <VStack gap={6} id="how" paddingBlock={8}>
        <VStack gap={2}><Text type="label" color="accent">동적 주차존이 만드는 변화</Text><Heading level={2}>주차 위치뿐 아니라,<br />언제 얼마나 세울지도 함께.</Heading></VStack>
        <Grid columns={{ minWidth: 240, max: 3 }} gap={8}>
          <VStack gap={3}><Heading level={3}>통행 가능한 공간부터</Heading><Text type="large" color="secondary">보도 폭만 보고 자리를 정하지 않습니다. 기기를 세운 뒤에도 남는 보행 공간을 확인합니다.</Text></VStack>
          <VStack gap={3}><Heading level={3}>사람이 모이면 조절</Heading><Text type="large" color="secondary">관측된 보행량과 운영시간에 따라 존을 열고, 수용량을 줄이거나 닫습니다.</Text></VStack>
          <VStack gap={3}><Heading level={3}>남은 기기는 열린 존으로</Heading><Text type="large" color="secondary">이동이 필요한 기기를 가까운 열린 존으로 모아, 보행과 주차가 함께 가능한 흐름을 만듭니다.</Text></VStack>
        </Grid>
      </VStack>
      <Section variant="muted" padding={8}><VStack gap={5} hAlign="center"><Text type="label" color="accent">지도에서 만나는 동적 주차</Text><Heading level={2} justify="center">지금 이용할 수 있는<br />주차 공간을 찾아보세요.</Heading><Text type="large" color="secondary" justify="center">큰 지도에서 주차존의 상태와 기기 종류를 확인하세요.</Text><Link href="/service" type="large" weight="semibold" style={cta}>지도에서 서비스 시작</Link><Link href="/mobile" type="large">시민용 모바일 웹 열기</Link></VStack></Section>
      <Grid columns={{ minWidth: 280, max: 2 }} gap={10}>
        <VStack gap={5} paddingBlock={6} id="citizens"><Text type="label" color="accent">시민과 함께하는 이동</Text><Heading level={2}>가까운 주차존 확인부터<br />도보 이동 참여까지.</Heading><Text type="large" color="secondary">휴대폰에서 주변의 주차존과 이동 미션을 살펴보세요. 이동은 기기를 타지 않고 걸어서 끌고 가는 방식으로 진행합니다.</Text><VStack as="ol" gap={4} style={{ listStyle: 'decimal', paddingInlineStart: 'var(--spacing-6)' }}><Text as="li" type="large">주변 주차존과 이동 대상 확인</Text><Text as="li" type="large">목적지·조건을 확인하고 이동 참여</Text><Text as="li" type="large">열린 존에 정주차하고 완료 확인</Text></VStack><Text type="supporting">이동 미션은 참여 운영사와 이용자 인증이 연결된 지역에서 제공됩니다.</Text><Link href="/mobile" type="large" hasUnderline>휴대폰용 지도 열기</Link></VStack>
        <Section variant="muted" padding={8}><VStack gap={5} id="partners"><Text type="label" color="accent">운영사·자치구를 위한 공간 운영</Text><Heading level={2}>고정된 자리에서,<br />시간에 반응하는 운영으로.</Heading><Text type="large" color="secondary">주차존별 보행 흐름과 수용량을 한 지도에서 확인하고, 혼잡해지기 전에 남은 기기의 이동을 준비합니다.</Text><Divider /><VStack gap={4}><Text type="large">공간별 운영 상태와 판정 근거 확인</Text><Text type="large">폐쇄 전 수용량 사전 조절</Text><Text type="large">기기 종류에 맞춘 주차존 탐색</Text></VStack><Link href="/service" type="large" hasUnderline>지도 운영 화면 살펴보기</Link></VStack></Section>
      </Grid>
      <Divider /><HStack as="footer" paddingBlock={4} gap={5} hAlign="between" wrap="wrap"><VStack gap={1}><Text type="label">PM 주차존</Text><Text type="supporting">사람이 걷는 길과 일상의 이동을 함께 생각합니다.</Text></VStack><HStack gap={5}><Link href="/service">주차존 지도</Link><Link href="/mobile">시민용 모바일 웹</Link></HStack></HStack>
    </VStack></LayoutContent>} />
  </AppShell>;
}
