'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Terminal } from 'lucide-react';
import { buildTruckRouteApiLog, type TruckRouteTraceState } from '@/lib/truckRoutePlannerTrace';

export default function TruckRoutePlannerApiPanel({
  trace,
  darkMode = false,
  borderRadius = '1rem',
  className = '',
}: {
  trace: TruckRouteTraceState;
  darkMode?: boolean;
  borderRadius?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pulseStep, setPulseStep] = useState(0);

  useEffect(() => {
    if (!trace.loading) {
      setPulseStep(0);
      return;
    }
    const id = window.setInterval(() => setPulseStep((s) => (s + 1) % 3), 450);
    return () => window.clearInterval(id);
  }, [trace.loading]);

  const logText = trace.result ? buildTruckRouteApiLog(trace.result) : '';
  const endpoint = trace.result?.meta.endpointPath ?? '/directions/v2/route';
  const elapsed = trace.result?.meta.elapsedMs;

  const copyLog = async () => {
    if (!logText) return;
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const shellBg = darkMode ? '#0f172a' : '#f8fafc';
  const shellBorder = darkMode ? '#334155' : '#e2e8f0';
  const textMain = darkMode ? '#e2e8f0' : '#0f172a';
  const textMuted = darkMode ? '#94a3b8' : '#64748b';
  const accent = darkMode ? '#38bdf8' : '#0054A6';

  return (
    <aside
      className={`border shadow-xl overflow-hidden flex flex-col ${className}`}
      style={{
        background: shellBg,
        borderColor: shellBorder,
        borderRadius,
        minHeight: 600,
        maxHeight: 'min(1020px, calc(100vh - 80px))',
      }}
      aria-label="MapQuest API trace"
    >
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 border-b"
        style={{ borderColor: shellBorder, background: darkMode ? '#1e293b' : '#fff' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: textMain }}>
              API calls
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={copyLog}
          disabled={!logText}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border disabled:opacity-40"
          style={{ borderColor: shellBorder, color: textMuted, background: darkMode ? '#0f172a' : '#f8fafc' }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="p-4 space-y-3 flex-1 overflow-y-auto prism-scrollbar">
        {trace.loading ? (
          <div className="space-y-3">
            <div
              className="flex items-center gap-3 px-3 py-3 rounded-md border"
              style={{ borderColor: shellBorder, background: darkMode ? '#1e293b' : '#fff' }}
            >
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: accent }} />
              <div>
                <p className="text-sm font-medium" style={{ color: textMain }}>
                  Routing…
                </p>
                <p className="text-xs" style={{ color: textMuted }}>
                  POST {endpoint.replace('/directions/v2/', '')}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-xs font-mono" style={{ color: textMuted }}>
              {['Geocode stops', 'Apply truck profile', 'Compute shape + legs'].map((step, i) => (
                <div
                  key={step}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                  style={{
                    opacity: pulseStep === i ? 1 : 0.55,
                    color: pulseStep === i ? accent : textMuted,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: pulseStep === i ? accent : textMuted }} />
                  {step}
                </div>
              ))}
            </div>
          </div>
        ) : trace.error ? (
          <div
            className="text-sm px-3 py-3 rounded-md border"
            style={{ borderColor: '#fca5a5', background: darkMode ? '#450a0a' : '#fef2f2', color: darkMode ? '#fecaca' : '#991b1b' }}
          >
            {trace.error}
          </div>
        ) : trace.result ? (
          <>
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs font-mono border"
              style={{ borderColor: shellBorder, background: darkMode ? '#1e293b' : '#fff', color: textMain }}
            >
              <span>
                POST <span style={{ color: accent }}>{trace.result.meta.endpointPath}</span>
              </span>
              <span style={{ color: textMuted }}>{elapsed} ms</span>
            </div>
            <pre
              className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap rounded-md p-3 border overflow-x-auto"
              style={{
                borderColor: shellBorder,
                background: darkMode ? '#020617' : '#fff',
                color: darkMode ? '#cbd5e1' : '#334155',
              }}
            >
              {logText}
            </pre>
          </>
        ) : (
          <div className="text-sm px-2 py-6 text-center" style={{ color: textMuted }}>
            Click <strong style={{ color: textMain }}>Get route</strong> in the widget to see MapQuest API calls, options, and geocode quality here.
          </div>
        )}
      </div>
    </aside>
  );
}
