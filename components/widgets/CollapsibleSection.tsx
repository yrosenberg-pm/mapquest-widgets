'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function CollapsibleSection({
  title,
  summary,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  rightHint,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  rightHint?: ReactNode;
  children: ReactNode;
}) {
  const reactId = useId();
  const contentId = useMemo(() => `collapsible-${reactId}`, [reactId]);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = typeof openProp === 'boolean' ? openProp : uncontrolledOpen;

  const [hover, setHover] = useState(false);

  const setOpen = (next: boolean) => {
    if (typeof openProp !== 'boolean') setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div>
      <div
        className="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 -my-2 transition-colors"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        aria-expanded={open}
        aria-controls={contentId}
        role="button"
        tabIndex={0}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: hover ? 'var(--bg-widget)' : 'transparent',
          outline: 'none',
        }}
      >
        <div className="min-w-0 text-left">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
            {title}
          </div>
          {summary ? (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {summary}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {rightHint ? <div className="shrink-0">{rightHint}</div> : null}
          <span
            className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg border"
            style={{
              borderColor: hover ? 'var(--text-muted)' : 'var(--border-subtle)',
              color: 'var(--text-muted)',
              background: hover ? 'var(--bg-panel)' : 'transparent',
            }}
            aria-hidden="true"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </div>

      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

