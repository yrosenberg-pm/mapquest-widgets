// app/embed/route/page.tsx
import { Suspense } from 'react';
import RouteEmbedClient from './RouteEmbedClient';

export default function RouteEmbedPage() {
  return (
    <Suspense fallback={<div className="min-h-[1px] w-full" />}>
      <RouteEmbedClient />
    </Suspense>
  );
}

