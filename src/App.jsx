import { lazy, Suspense } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import LandingPage from './LandingPage';

const MapWorkspace = lazy(() => import('./MapWorkspace'));
const MobileDemo = lazy(() => import('./MobileDemo'));

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return <LandingPage />;
  if (path === '/service') return <Suspense fallback={<VStack padding={6}><Text role="status">지도를 준비하고 있습니다.</Text></VStack>}><MapWorkspace /></Suspense>;
  // The citizen app keeps a phone-width frame on wide screens; on a phone the frame is simply the full width.
  if (path === '/mobile') return <VStack hAlign="center" height="100dvh" style={{ background: 'var(--color-background-body)' }}>
    <VStack width="100%" height="100%" style={{ maxWidth: '27rem', borderInline: 'var(--border-width) solid var(--color-border)', boxShadow: 'var(--shadow-med)', overflow: 'hidden' }}>
      <Suspense fallback={<VStack padding={6}><Text role="status">시연을 준비하고 있습니다.</Text></VStack>}><MobileDemo /></Suspense>
    </VStack>
  </VStack>;
  return <VStack padding={8} gap={4}><Heading level={1}>페이지를 찾을 수 없습니다</Heading><Link href="/">상품 소개로 돌아가기</Link></VStack>;
}
