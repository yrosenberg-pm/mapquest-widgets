// app/embed/traffic/page.tsx
import { Suspense } from 'react';
import TrafficEmbedClient from './TrafficEmbedClient';

export default function TrafficEmbedPage() {
  return (
    <Suspense fallback={<div className="min-h-[1px] w-full" />}>
      <TrafficEmbedClient />
    </Suspense>
  );
}

