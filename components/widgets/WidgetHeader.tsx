'use client';

import type { ReactNode } from 'react';

export default function WidgetHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="prism-header" style={{ padding: '12px 16px' }}>
      <div className="min-w-0">
        <h2 className="prism-header-title" style={{ fontSize: '15px', lineHeight: '20px' }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="prism-text-muted" style={{ fontSize: '12px', lineHeight: '16px', marginTop: 2 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

