import { lazy, Suspense } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import LandingPage from './LandingPage';

const MapWorkspace = lazy(() => import('./MapWorkspace'));
const DemoPage = lazy(() => import('./DemoPage'));

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return <LandingPage />;
  if (['/service', '/mobile'].includes(path)) return <Suspense fallback={<VStack padding={6}><Text role="status">지도를 준비하고 있습니다.</Text></VStack>}><MapWorkspace citizen={path === '/mobile'} /></Suspense>;
  if (path === '/demo') return <Suspense fallback={<VStack padding={6}><Text role="status">시연을 준비하고 있습니다.</Text></VStack>}><DemoPage /></Suspense>;
  return <VStack padding={8} gap={4}><Heading level={1}>페이지를 찾을 수 없습니다</Heading><Link href="/">상품 소개로 돌아가기</Link></VStack>;
}
