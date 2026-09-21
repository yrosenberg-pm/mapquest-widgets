'use client';

import type { ReactNode } from 'react';

export type DevicePreviewKind = 'iphone' | 'ipad';

const DEVICE_SPECS: Record<
  DevicePreviewKind,
  { screenW: number; screenH: number; outerRadius: number; bezel: number; label: string }
> = {
  iphone: {
    screenW: 390,
    screenH: 844,
    outerRadius: 48,
    bezel: 14,
    label: 'iPhone 15',
  },
  ipad: {
    screenW: 820,
    screenH: 1180,
    outerRadius: 28,
    bezel: 18,
    label: 'iPad 11"',
  },
};

export default function DevicePreviewFrame({
  device,
  children,
}: {
  device: DevicePreviewKind;
  children: ReactNode;
}) {
  const spec = DEVICE_SPECS[device];
  const outerW = spec.screenW + spec.bezel * 2;
  const outerH = spec.screenH + spec.bezel * 2;

  return (
    <div className="flex flex-col items-center gap-4 pt-1">
      <div
        className="relative shadow-2xl"
        style={{
          width: outerW,
          height: outerH,
          borderRadius: spec.outerRadius,
          background: 'linear-gradient(145deg, #2d2d2d 0%, #1a1a1a 100%)',
          padding: spec.bezel,
          boxShadow: '0 25px 60px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {device === 'iphone' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-20 rounded-full"
            style={{
              top: spec.bezel + 8,
              width: 110,
              height: 32,
              background: '#0a0a0a',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            }}
            aria-hidden
          />
        )}

        <div
          className="relative w-full h-full overflow-hidden bg-black"
          style={{
            borderRadius: Math.max(8, spec.outerRadius - spec.bezel),
          }}
        >
          <div
            className="w-full h-full overflow-hidden"
            style={{
              width: spec.screenW,
              height: spec.screenH,
              background: 'var(--bg-canvas, #fff)',
            }}
          >
            {children}
          </div>
        </div>

        {device === 'iphone' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full z-20"
            style={{
              bottom: spec.bezel + 6,
              width: 120,
              height: 4,
              background: 'rgba(255,255,255,0.35)',
            }}
            aria-hidden
          />
        )}
      </div>
      <span
        className="text-xs font-medium px-2 pb-1"
        style={{ color: 'var(--text-muted, #6b7280)' }}
      >
        {spec.label} · {spec.screenW}×{spec.screenH}
      </span>
    </div>
  );
}
