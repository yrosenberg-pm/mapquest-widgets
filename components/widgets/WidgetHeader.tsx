'use client';

import type { ReactNode } from 'react';

export default function WidgetHeader({
  title,
  subtitle,
  right,
  icon,
  variant = 'default',
  layout = 'stacked',
  size = 'default',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  icon?: ReactNode;
  variant?: 'default' | 'impressive';
  layout?: 'stacked' | 'inline';
  /** Slightly larger type and padding (e.g. Street View). */
  size?: 'default' | 'relaxed';
}) {
  const relaxed = size === 'relaxed';
  const titleStyle =
    variant === 'impressive'
      ? relaxed
        ? ({ fontSize: '20px', lineHeight: '28px' } as const)
        : ({ fontSize: '18px', lineHeight: '24px' } as const)
      : relaxed
        ? ({ fontSize: '16px', lineHeight: '22px' } as const)
        : ({ fontSize: '15px', lineHeight: '20px' } as const);

  const subtitleStyle =
    variant === 'impressive'
      ? relaxed
        ? ({ fontSize: '14px', lineHeight: '20px', marginTop: 4 } as const)
        : ({ fontSize: '13px', lineHeight: '18px', marginTop: 3 } as const)
      : relaxed
        ? ({ fontSize: '13px', lineHeight: '18px', marginTop: 2 } as const)
        : ({ fontSize: '12px', lineHeight: '16px', marginTop: 2 } as const);

  const headerPadding = relaxed ? '14px 20px' : '12px 16px';
  const iconBox = relaxed ? 'w-9 h-9' : 'w-8 h-8';
  const ruleHeight = relaxed ? 18 : 16;

  if (layout === 'inline') {
    return (
      <div className="prism-header" style={{ padding: headerPadding }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && (
            <div
              className={`flex-shrink-0 ${iconBox} rounded-lg flex items-center justify-center`}
              style={{ background: 'var(--brand-primary, #3B82F6)', color: 'white' }}
            >
              {icon}
            </div>
          )}
          <h2 className="prism-header-title" style={titleStyle}>
            {title}
          </h2>
          {subtitle && (
            <>
              <span
                className="flex-shrink-0 hidden sm:block"
                style={{ width: 1, height: ruleHeight, background: 'var(--border-default)', opacity: 0.5 }}
              />
              <p
                className="prism-text-muted hidden sm:block truncate"
                style={{ fontSize: subtitleStyle.fontSize, lineHeight: subtitleStyle.lineHeight }}
              >
                {subtitle}
              </p>
            </>
          )}
        </div>
        {right ? <div className="flex items-center gap-2 flex-shrink-0">{right}</div> : null}
      </div>
    );
  }

  return (
    <div className="prism-header" style={{ padding: headerPadding }}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div
            className={`flex-shrink-0 ${iconBox} rounded-lg flex items-center justify-center`}
            style={{ background: 'var(--brand-primary, #3B82F6)', color: 'white' }}
          >
            {icon}
          </div>
        )}
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
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

