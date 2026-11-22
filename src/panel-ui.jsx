// Shared panel pieces for /service and /mobile: prose sits in tinted cards, and full-width filled shapes are only ever
// tappable actions.
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';

export const statusTone = { open: 'green', reduced: 'orange', closed: 'red' };
export const Box = ({ tone = 'muted', children }) => <Card variant={tone} padding={4}><VStack gap={2}>{children}</VStack></Card>;
export const Act = (props) => <Button size="lg" width="100%" variant="primary" {...props} />;
