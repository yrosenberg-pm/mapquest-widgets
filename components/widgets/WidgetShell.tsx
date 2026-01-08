// components/widgets/WidgetShell.tsx
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import ThemeToggle from './ThemeToggle';

// ========================================
// Branding Props Interface
// ========================================
export interface BrandingProps {
  brandPrimary?: string;
  brandFont?: string;
  clientLogo?: string;
  defaultTheme?: 'light' | 'dark';
}

// ========================================
// Widget Shell Props
// ========================================
interface WidgetShellProps extends BrandingProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  showThemeToggle?: boolean;
  footerText?: string;
  companyName?: string;
  companyLogo?: string;
  className?: string;
  style?: React.CSSProperties;
  minWidth?: string;
  height?: string;
}

// ========================================
// Theme Context
// ========================================
interface ThemeContextType {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a WidgetShell');
  }
  return context;
};

// ========================================
// Widget Shell Component
// ========================================
export default function WidgetShell({
  children,
  title,
  subtitle,
  showHeader = false,
  showFooter = true,
  showThemeToggle = true,
  footerText,
  companyName,
  companyLogo,
  clientLogo,
  brandPrimary,
  brandFont,
  defaultTheme = 'light',
  className = '',
  style = {},
  minWidth = '900px',
  height,
}: WidgetShellProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);

  // Sync with external darkMode prop changes
  useEffect(() => {
    setTheme(defaultTheme);
  }, [defaultTheme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Build CSS custom properties for brand overrides
  const brandStyles: React.CSSProperties = {
    ...style,
    ...(brandPrimary && { '--brand-primary': brandPrimary } as React.CSSProperties),
    ...(brandFont && { '--brand-font': brandFont } as React.CSSProperties),
    minWidth,
    ...(height && { height }),
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div
        className={`prism-widget ${className}`}
        data-theme={theme}
        style={brandStyles}
      >
        {/* Optional Header */}
        {showHeader && (
          <div className="prism-header">
            <div className="flex items-center gap-3">
              {clientLogo && (
                <img
                  src={clientLogo}
                  alt="Client logo"
                  className="prism-header-logo"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              {title && (
                <div>
                  <h2 className="prism-header-title">{title}</h2>
                  {subtitle && (
                    <p className="prism-text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>
            {showThemeToggle && (
              <ThemeToggle />
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="prism-widget-content">
          {children}
        </div>

        {/* Footer / Branding */}
        {showFooter && (
          <div className="prism-footer">
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName || 'Company logo'}
                className="prism-footer-logo"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span>
              {companyName && <span style={{ fontWeight: 500 }}>{companyName} · </span>}
              {footerText || 'Powered by'} <strong>MapQuest</strong>
            </span>
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  );
}

// ========================================
// Helper Components for consistent styling
// ========================================

export function WidgetPanel({ 
  children, 
  className = '',
  floating = false,
  ...props 
}: { 
  children: ReactNode; 
  className?: string;
  floating?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={`${floating ? 'prism-panel-floating' : 'prism-panel'} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function WidgetButton({
  children,
  variant = 'primary',
  size = 'default',
  icon = false,
  className = '',
  style = {},
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'sm';
  icon?: boolean;
  className?: string;
  style?: React.CSSProperties;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = `prism-btn-${variant}`;
  const sizeClass = size === 'sm' ? 'prism-btn-sm' : '';
  const iconClass = icon ? 'prism-btn-icon' : '';
  
  return (
    <button
      className={`prism-btn ${variantClass} ${sizeClass} ${iconClass} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}

export function WidgetInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`prism-input ${className}`}
      {...props}
    />
  );
}

export function WidgetLabel({
  children,
  className = '',
  ...props
}: {
  children: ReactNode;
  className?: string;
} & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`prism-label ${className}`} {...props}>
      {children}
    </label>
  );
}

export function WidgetBadge({
  children,
  variant = 'info',
  className = '',
}: {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info';
  className?: string;
}) {
  return (
    <span className={`prism-badge prism-badge-${variant} ${className}`}>
      {children}
    </span>
  );
}

export function WidgetDivider({ vertical = false }: { vertical?: boolean }) {
  return <hr className={vertical ? 'prism-divider-vertical' : 'prism-divider'} />;
}
