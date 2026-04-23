// Demo / story: Mapillary Street View showcase (internal sales & marketing).
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { setApiKey } from '@/lib/mapquest';
import MapillaryStreetViewShowcase from '@/components/widgets/MapillaryStreetViewShowcase';

const ENV_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

function StreetViewShowcaseDemoInner() {
  const searchParams = useSearchParams();
  const [apiKey, setK] = useState(ENV_KEY);

  useEffect(() => {
    const q = searchParams.get('apiKey');
    if (q) {
      setK(q);
      setApiKey(q);
    } else {
      setApiKey(ENV_KEY);
    }
  }, [searchParams]);

  const dark = searchParams.get('darkMode') === '1' || searchParams.get('darkMode') === 'true';
  const accent = searchParams.get('accentColor') || '#2563eb';

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{ background: dark ? 'var(--bg-canvas, #0f1419)' : '#e5e7eb' }}
    >
      <div className="mx-auto max-w-[min(100%,3500px)]">
        <h1
          className="mb-4 text-center text-sm font-medium md:text-left"
          style={{ color: dark ? '#e2e8f0' : '#334155' }}
        >
          MapQuest Platform — Street View (demo)
        </h1>
        <MapillaryStreetViewShowcase
          mapquestApiKey={apiKey}
          darkMode={dark}
          accentColor={accent}
          showBranding
        />
      </div>
    </div>
  );
}

export default function StreetViewShowcaseDemoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-200 p-8" />}>
      <StreetViewShowcaseDemoInner />
    </Suspense>
  );
}
