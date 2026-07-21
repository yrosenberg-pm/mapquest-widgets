'use client';

import { useCallback, useEffect, useState } from 'react';
import TruckRoutingMockAssembly from '@/components/demo/TruckRoutingMockAssembly';

export default function DemoPage() {
  const [runKey, setRunKey] = useState(0);
  const [playing, setPlaying] = useState(false);

  const startDemo = useCallback(() => {
    setPlaying(false);
    setRunKey((k) => k + 1);
    requestAnimationFrame(() => setPlaying(true));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'g') return;
      e.preventDefault();
      startDemo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startDemo]);

  return (
    <div className="relative min-h-screen w-full" style={{ background: '#f3f4f6' }}>
      <button
        type="button"
        onClick={startDemo}
        className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-white text-gray-600 hover:bg-gray-50 transition-all"
        style={{ boxShadow: 'none' }}
      >
        Demo
      </button>

      <div className="flex min-h-screen w-full items-center justify-center px-6 py-16">
        {playing ? <TruckRoutingMockAssembly runKey={runKey} /> : null}
      </div>
    </div>
  );
}
