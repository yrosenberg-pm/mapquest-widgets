'use client';

import { useMemo, useState } from 'react';
import { Check, Code, Copy } from 'lucide-react';
import { WidgetButton } from '@/components/widgets/WidgetShell';
import {
  DEFAULT_MAP_STYLE_ID,
  getMapStyleEntry,
  type MapStyleConfigEntry,
} from '@/lib/mapStyles/config';
import { maplibreSnippet, publicStyleUrl } from '@/lib/mapStyles/styleLoader';
import { prismWidgetThemeProps } from '@/lib/widgetShellTheme';

export default function MapStylesGetStylePanel({
  selection,
  darkMode = false,
  accentColor = '#2563eb',
  borderRadius = '16px',
  className = '',
}: {
  selection: MapStyleConfigEntry | null;
  darkMode?: boolean;
  accentColor?: string;
  borderRadius?: string;
  className?: string;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const entry = selection ?? getMapStyleEntry(DEFAULT_MAP_STYLE_ID)!;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://widgets.mapquest.com';
  const publicUrl = useMemo(() => publicStyleUrl(entry, origin), [entry, origin]);
  const codeSample = useMemo(() => maplibreSnippet(entry, publicUrl), [entry, publicUrl]);

  const copyText = async (text: string, which: 'url' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'url') {
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      {...prismWidgetThemeProps(darkMode)}
      className={`prism-widget border overflow-hidden flex flex-col ${className}`}
      style={{
        '--brand-primary': accentColor,
        borderRadius,
        minHeight: 480,
        maxHeight: 'min(720px, calc(100vh - 80px))',
        boxShadow: 'var(--elevation-high)',
      } as React.CSSProperties}
      aria-label="Get this map style"
    >
      <div
        className="prism-header px-4 py-3 flex items-center gap-2"
        style={{ padding: '12px 16px' }}
      >
        <Code className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} aria-hidden />
        <h3 className="prism-header-title text-sm font-semibold" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Get this style · {entry.name}
        </h3>
      </div>
      <div
        className="flex-1 overflow-y-auto p-4 prism-scrollbar"
        style={{ background: 'var(--bg-widget)', color: 'var(--text-main)' }}
      >
        <p className="text-xs mb-3 prism-text-muted" style={{ color: 'var(--text-muted)' }}>
          {entry.description}
        </p>
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          Style URL
        </div>
        <code
          className="block text-[11px] leading-snug p-2 rounded-md break-all mb-3 font-mono"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {publicUrl}
        </code>
        <div className="flex flex-wrap gap-2 mb-4">
          <WidgetButton type="button" variant="secondary" size="sm" onClick={() => copyText(publicUrl, 'url')}>
            {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="ml-1.5">{copiedUrl ? 'Copied' : 'Copy URL'}</span>
          </WidgetButton>
          <WidgetButton type="button" variant="secondary" size="sm" onClick={() => copyText(codeSample, 'code')}>
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="ml-1.5">{copiedCode ? 'Copied' : 'Copy snippet'}</span>
          </WidgetButton>
        </div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          MapLibre
        </div>
        <pre
          className="text-[10px] leading-snug p-3 rounded-md overflow-x-auto prism-scrollbar font-mono"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            maxHeight: 320,
          }}
        >
          {codeSample}
        </pre>
      </div>
    </aside>
  );
}