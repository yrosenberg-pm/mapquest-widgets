// components/widgets/ThemeToggle.tsx
'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from './WidgetShell';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'default';
}

export default function ThemeToggle({ className = '', size = 'default' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  
  const iconSize = size === 'sm' ? 16 : 20;
  const buttonSize = size === 'sm' ? 'prism-btn-sm' : '';
  
  return (
    <button
      onClick={toggleTheme}
      className={`prism-btn prism-btn-ghost prism-btn-icon ${buttonSize} ${className}`}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? (
        <Moon size={iconSize} />
      ) : (
        <Sun size={iconSize} />
      )}
    </button>
  );
}

// Standalone theme toggle for widgets that don't use WidgetShell context
export function StandaloneThemeToggle({ 
  isDark, 
  onToggle,
  className = '',
  size = 'default',
}: { 
  isDark: boolean; 
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'default';
}) {
  const iconSize = size === 'sm' ? 16 : 20;
  const buttonSize = size === 'sm' ? 'prism-btn-sm' : '';
  
  return (
    <button
      onClick={onToggle}
      className={`prism-btn prism-btn-ghost prism-btn-icon ${buttonSize} ${className}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun size={iconSize} />
      ) : (
        <Moon size={iconSize} />
      )}
    </button>
  );
}
