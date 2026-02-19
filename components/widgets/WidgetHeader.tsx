'use client';

import type { ReactNode } from 'react';

export default function WidgetHeader({
  title,
  subtitle,
  right,
  variant = 'default',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  variant?: 'default' | 'impressive';
}) {
  const titleStyle =
    variant === 'impressive'
      ? ({ fontSize: '18px', lineHeight: '24px' } as const)
      : ({ fontSize: '15px', lineHeight: '20px' } as const);

  const subtitleStyle =
    variant === 'impressive'
      ? ({ fontSize: '13px', lineHeight: '18px', marginTop: 3 } as const)
      : ({ fontSize: '12px', lineHeight: '16px', marginTop: 2 } as const);

  return (
    <div className="prism-header" style={{ padding: '12px 16px' }}>
      <div className="min-w-0">
        <h2 className="prism-header-title" style={titleStyle}>
          {title}
        </h2>
        {subtitle ? (
          <p className="prism-text-muted" style={subtitleStyle}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

