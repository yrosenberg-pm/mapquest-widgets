// components/AddressAutocomplete.tsx
'use client';

import { useRef, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useAddressAutocomplete } from '@/hooks/useAddressAutocomplete';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (address: { displayString: string; lat?: number; lng?: number }) => void;
  placeholder?: string;
  darkMode?: boolean;
  inputBg?: string;
  textColor?: string;
  mutedText?: string;
  borderColor?: string;
  className?: string;
  style?: React.CSSProperties;
  iconClassName?: string;
  hideIcon?: boolean;
  readOnly?: boolean; // When true, disables autocomplete functionality
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Enter an address...',
  darkMode = false,
  inputBg,
  textColor,
  mutedText,
  borderColor,
  className = '',
  style,
  iconClassName = '',
  hideIcon = false,
  readOnly = false,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    suggestions,
    loading,
    isOpen,
    highlightedIndex,
    handleSelect,
    handleKeyDown,
    closeDropdown,
    handleFocus,
    handleBlur,
  } = useAddressAutocomplete(value, onChange, { onSelect, disabled: readOnly });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  const defaultInputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const defaultTextColor = darkMode ? 'text-white' : 'text-gray-900';
  const defaultMutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const defaultBorderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const bg = inputBg || defaultInputBg;
  const text = textColor || defaultTextColor;
  const muted = mutedText || defaultMutedText;
  const border = borderColor || defaultBorderColor;
  const hoverBg = darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50';

  return (
    <div ref={containerRef} className={`relative ${className}`} style={style}>
      <div className="relative">
        {!hideIcon && (
          <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${muted} z-10 ${iconClassName}`} />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full ${hideIcon ? 'pl-3' : 'pl-10'} pr-10 py-2.5 text-sm ${bg} ${text} rounded-lg border ${border} focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {loading && <Loader2 className={`w-4 h-4 animate-spin ${muted}`} />}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className={`absolute z-[100] w-full mt-1 ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${border} rounded-lg shadow-lg max-h-60 overflow-y-auto`}>
          {suggestions.map((suggestion, index) => {
            const addressResult = {
              displayString: suggestion.displayString || suggestion.name || '',
              lat: suggestion.lat,
              lng: suggestion.lng,
            };

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2 ${index === highlightedIndex ? (darkMode ? 'bg-gray-700' : 'bg-gray-100') : ''} ${hoverBg} transition-colors`}
              >
                <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${muted}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${text} font-medium truncate`}>
                    {suggestion.name || suggestion.displayString}
                  </div>
                  {suggestion.displayString && suggestion.displayString !== suggestion.name && (
                    <div className={`text-xs ${muted} truncate mt-0.5`}>
                      {suggestion.displayString}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

