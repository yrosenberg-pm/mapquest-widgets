'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { setApiKey } from '@/lib/mapquest';
import TruckRoutePlanner from '@/components/widgets/TruckRoutePlanner';
import { ZONAR_BRAND } from '@/lib/truckRoutePlannerTrace';

const ENV_API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

function TruckRoutePlannerEmbedInner() {
  const searchParams = useSearchParams();

  const clientKey = searchParams.get('apiKey') || ENV_API_KEY;
  if (clientKey) setApiKey(clientKey);

  const darkMode = searchParams.get('darkMode') === '1' || searchParams.get('theme') === 'dark';
  const accentColor = searchParams.get('accentColor') || ZONAR_BRAND.accentColor;
  const fontFamily = searchParams.get('fontFamily') || undefined;
  const borderRadius = searchParams.get('borderRadius') || ZONAR_BRAND.borderRadius;
  const showBranding = searchParams.get('showBranding') !== '0';
  const companyName = searchParams.get('companyName') || '';
  const companyLogo = searchParams.get('companyLogo') || ZONAR_BRAND.companyLogo;

  return (
    <TruckRoutePlanner
      apiKey={clientKey}
      darkMode={darkMode}
      accentColor={accentColor}
      fontFamily={fontFamily}
      borderRadius={borderRadius}
      showBranding={showBranding}
      companyName={companyName}
      companyLogo={companyLogo}
    />
  );
}

export default function TruckRoutePlannerEmbedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-default, #f3f4f6)' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary, #2563EB)' }} />
        </div>
      }
    >
      <div className="min-h-screen flex items-start justify-center p-2 md:p-4 overflow-x-hidden" style={{ background: 'var(--surface-default, #f3f4f6)' }}>
        <div className="w-full max-w-full overflow-hidden">
          <TruckRoutePlannerEmbedInner />
        </div>
      </div>
    </Suspense>
  );
}
