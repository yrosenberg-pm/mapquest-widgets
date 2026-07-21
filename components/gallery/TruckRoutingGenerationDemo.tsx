'use client';

import { useEffect, useRef, useState } from 'react';
import TruckRouting, {
  TRUCK_GALLERY_DURHAM_FROM,
  TRUCK_GALLERY_DURHAM_MAP_VIEW,
  TRUCK_GALLERY_DURHAM_TO,
  type TruckRoutingGalleryReveal,
  type TruckRoutingHandle,
} from '@/components/widgets/TruckRouting';
import { jitter, sleep } from '@/lib/gallery/jitter';

const STATUS_LINES = [
  'Configuring commercial vehicle profile…',
  'Loading MapQuest map…',
  'Plotting Durham route…',
] as const;

const JITTER_SPREAD = 0.3;
const DEMO_MIN_HEIGHT = '760px';

export type TruckRoutingGalleryCommonProps = {
  apiKey: string;
  darkMode: boolean;
  accentColor: string;
  fontFamily: string;
  borderRadius: string;
  showBranding: boolean;
  companyName?: string;
  companyLogo?: string;
};

type Props = {
  runId: number;
  commonProps: TruckRoutingGalleryCommonProps;
};

type DemoPhase = 'blank' | 'building' | 'done';

async function waitForTruckRef(
  ref: React.RefObject<TruckRoutingHandle | null>,
  abortRef: React.RefObject<boolean>,
  maxMs = 8000,
) {
  const start = Date.now();
  while (!ref.current && Date.now() - start < maxMs) {
    if (abortRef.current) return false;
    await sleep(40);
  }
  return !!ref.current;
}

export default function TruckRoutingGenerationDemo({ runId, commonProps }: Props) {
  const truckRef = useRef<TruckRoutingHandle>(null);
  const abortRef = useRef(false);
  const tilesTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<DemoPhase>('blank');
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [activeLine, setActiveLine] = useState('');

  const [galleryReveal, setGalleryReveal] = useState<TruckRoutingGalleryReveal>('header');
  const [mapDisplayMode, setMapDisplayMode] = useState<'skeleton' | 'live'>('skeleton');
  const [galleryVehicleReady, setGalleryVehicleReady] = useState(false);
  const [galleryFromDisplay, setGalleryFromDisplay] = useState('');
  const [galleryToDisplay, setGalleryToDisplay] = useState('');
  const [mapFlyToKey, setMapFlyToKey] = useState(0);
  const [mapTilesRagged, setMapTilesRagged] = useState(false);
  const [routeRevealDurationMs] = useState(() => jitter(1450, JITTER_SPREAD));
  const [mapFlyDurationMs] = useState(() => jitter(950, JITTER_SPREAD));

  const statusMuted = commonProps.darkMode ? '#94a3b8' : '#64748b';
  const pageBg = commonProps.darkMode ? '#0f172a' : '#f8fafc';

  useEffect(() => {
    abortRef.current = false;

    const streamChars = async (text: string, onChar: (partial: string) => void, charMs = 10) => {
      for (let i = 0; i < text.length; i++) {
        if (abortRef.current) return;
        onChar(text.slice(0, i + 1));
        await sleep(jitter(charMs, JITTER_SPREAD));
      }
      onChar(text);
    };

    const streamStatusLine = async (line: string) => {
      setActiveLine('');
      await streamChars(line, setActiveLine, 12);
      if (abortRef.current) return;
      setCompletedLines((prev) => [...prev, line]);
      setActiveLine('');
    };

    const run = async () => {
      setPhase('blank');
      setCompletedLines([]);
      setActiveLine('');
      setGalleryReveal('header');
      setMapDisplayMode('skeleton');
      setGalleryVehicleReady(false);
      setGalleryFromDisplay('');
      setGalleryToDisplay('');
      setMapFlyToKey(0);
      setMapTilesRagged(false);

      await sleep(jitter(520, JITTER_SPREAD));
      if (abortRef.current) return;

      setPhase('building');
      await sleep(jitter(80, JITTER_SPREAD));
      if (abortRef.current) return;

      const ready = await waitForTruckRef(truckRef, abortRef);
      if (abortRef.current) return;
      if (!ready) {
        setPhase('done');
        return;
      }

      await sleep(jitter(360, JITTER_SPREAD));
      setGalleryReveal('controls');
      if (abortRef.current) return;

      const line1 = streamStatusLine(STATUS_LINES[0]);
      await sleep(jitter(280, JITTER_SPREAD));
      setGalleryVehicleReady(true);
      await line1;
      await sleep(jitter(320, JITTER_SPREAD));
      if (abortRef.current) return;

      const line2 = streamStatusLine(STATUS_LINES[1]);
      await sleep(jitter(220, JITTER_SPREAD));
      setGalleryReveal('map');
      setMapDisplayMode('live');
      setMapFlyToKey((k) => k + 1);
      setMapTilesRagged(true);
      if (tilesTimerRef.current) window.clearTimeout(tilesTimerRef.current);
      tilesTimerRef.current = window.setTimeout(() => setMapTilesRagged(false), jitter(2000, JITTER_SPREAD));
      await line2;
      await sleep(jitter(300, JITTER_SPREAD));
      if (abortRef.current) return;

      await streamChars(TRUCK_GALLERY_DURHAM_FROM, setGalleryFromDisplay, 9);
      await sleep(jitter(480, JITTER_SPREAD));
      if (abortRef.current) return;

      await streamChars(TRUCK_GALLERY_DURHAM_TO, setGalleryToDisplay, 9);
      setGalleryReveal('full');
      await sleep(jitter(320, JITTER_SPREAD));
      if (abortRef.current) return;

      const line3 = streamStatusLine(STATUS_LINES[2]);
      await sleep(jitter(180, JITTER_SPREAD));

      const routePromise = Promise.race([
        truckRef.current?.startGalleryDurhamRoute(),
        sleep(22000).then(() => {
          throw new Error('Gallery route timed out');
        }),
      ]).catch((err) => {
        console.error('[TruckRoutingGenerationDemo] route step failed:', err);
      });

      await line3;
      await routePromise;
      if (abortRef.current) return;

      await sleep(jitter(350, JITTER_SPREAD));
      setPhase('done');
    };

    void run();

    return () => {
      abortRef.current = true;
      if (tilesTimerRef.current) window.clearTimeout(tilesTimerRef.current);
    };
  }, [runId]);

  const showBuildChrome = phase === 'building';
  const showStatus = phase === 'building';
  const widgetShadow =
    phase === 'done' ? '0 25px 50px -12px rgba(0,0,0,0.25)' : 'none';

  return (
    <div
      className="w-full md:w-[1240px] relative transition-[box-shadow] duration-500 ease-out"
      key={runId}
      style={{
        minHeight: DEMO_MIN_HEIGHT,
        borderRadius: commonProps.borderRadius,
        boxShadow: widgetShadow,
        background: phase === 'blank' ? pageBg : 'transparent',
      }}
    >
      {phase === 'blank' ? (
        <div className="w-full" style={{ minHeight: DEMO_MIN_HEIGHT }} aria-hidden />
      ) : (
        <TruckRouting
          ref={truckRef}
          {...commonProps}
          galleryScriptedDemo={showBuildChrome}
          suppressCardElevation={showBuildChrome}
          galleryReveal={galleryReveal}
          mapDisplayMode={mapDisplayMode}
          lockBasemap={showBuildChrome ? 'road' : undefined}
          mapViewOverride={showBuildChrome ? TRUCK_GALLERY_DURHAM_MAP_VIEW : undefined}
          mapFlyToKey={showBuildChrome ? mapFlyToKey : 0}
          mapFlyToDurationMs={mapFlyDurationMs}
          galleryFromDisplay={showBuildChrome ? galleryFromDisplay : undefined}
          galleryToDisplay={showBuildChrome ? galleryToDisplay : undefined}
          galleryVehicleReady={showBuildChrome ? galleryVehicleReady : true}
          hidePresetDemoButtons
          mapTilesRaggedReveal={showBuildChrome && mapTilesRagged}
          routeRevealDurationMs={routeRevealDurationMs}
          holdLoadingUntilRouteReveal={showBuildChrome}
          onRouteRevealComplete={() => {
            if (!abortRef.current) setPhase('done');
          }}
          deferRouteVisualization={false}
        />
      )}

      {showStatus ? (
        <div
          className="absolute top-4 left-4 z-20 pointer-events-none max-w-md space-y-1.5 font-mono text-sm"
          style={{ color: statusMuted }}
          aria-live="polite"
        >
          {completedLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
          <div className="min-h-[1.25rem]">
            {activeLine}
            <span
              className="inline-block w-[6px] h-[13px] ml-0.5 align-[-2px] animate-pulse opacity-80"
              style={{ background: commonProps.accentColor }}
              aria-hidden
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
