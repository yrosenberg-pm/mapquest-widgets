// components/widgets/SmartAddressInput.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, Check, X } from 'lucide-react';
import { searchAhead, geocode } from '@/lib/mapquest';

interface AddressResult {
  displayString: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

interface SmartAddressInputProps {
  apiKey?: string;
  placeholder?: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onAddressSelect?: (address: AddressResult) => void;
  defaultValue?: string;
  required?: boolean;
  label?: string;
}

export default function SmartAddressInput({
  apiKey,
  placeholder = 'Enter an address...',
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  onAddressSelect,
  defaultValue = '',
  required = false,
  label,
}: SmartAddressInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Theme colors - inline for standalone component
  const bgWidget = darkMode ? '#0F172A' : '#FFFFFF';
  const bgInput = darkMode ? '#334155' : '#F1F5F9';
  const bgHover = darkMode ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.06)';
  const textMain = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#94A3B8';
  const textSecondary = darkMode ? '#E2E8F0' : '#475569';
  const borderSubtle = darkMode ? '#334155' : '#E2E8F0';
  const successColor = '#10B981';
  const successBg = darkMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)';
  const errorColor = '#EF4444';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setIsOpen(false);
      try {
        const results = await searchAhead(query, 6);
        setSuggestions(results);
        
        if (results && results.length > 0) {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
        setHighlightedIndex(-1);
      } catch (err) {
        console.error('Search failed:', err);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = async (suggestion: any) => {
    const display = suggestion.displayString || suggestion.name || suggestion.text || suggestion.address || suggestion.description || '';
    setQuery(display);
    setIsOpen(false);
    setSuggestions([]);

    try {
      let lat: number | undefined = suggestion.lat;
      let lng: number | undefined = suggestion.lng;
      
      if ((!lat || !lng) && suggestion.place?.geometry?.coordinates) {
        const coords = suggestion.place.geometry.coordinates;
        lng = coords[0];
        lat = coords[1];
      }
      
      let geocodedLocation: any = null;
      if (!lat || !lng) {
        geocodedLocation = await geocode(display);
        if (geocodedLocation && geocodedLocation.lat && geocodedLocation.lng) {
          lat = geocodedLocation.lat;
          lng = geocodedLocation.lng;
        }
      }
      
      if (lat && lng) {
        const result: AddressResult = {
          displayString: display,
          street: suggestion.place?.properties?.street || suggestion.street || geocodedLocation?.street || undefined,
          city: suggestion.place?.properties?.city || suggestion.city || geocodedLocation?.adminArea5 || undefined,
          state: suggestion.place?.properties?.state || suggestion.place?.properties?.stateCode || suggestion.state || geocodedLocation?.adminArea3 || undefined,
          postalCode: suggestion.place?.properties?.postalCode || suggestion.postalCode || geocodedLocation?.postalCode || undefined,
          country: suggestion.place?.properties?.country || suggestion.country || geocodedLocation?.adminArea1 || undefined,
          lat,
          lng,
        };
        setSelectedAddress(result);
        onAddressSelect?.(result);
      } else {
        console.error('Could not get coordinates for address');
      }
    } catch (err) {
      console.error('Geocode failed:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const clearSelection = () => {
    setQuery('');
    setSelectedAddress(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full md:w-[400px]"
      style={{ 
        fontFamily: fontFamily || "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {label && (
        <label 
          className="block text-sm font-medium mb-1.5"
          style={{ color: textMain }}
        >
          {label}
          {required && <span style={{ color: errorColor }} className="ml-1">*</span>}
        </label>
      )}

      {/* Input wrapper with relative positioning for dropdown */}
      <div className="relative">
        <MapPin 
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" 
          style={{ color: textMuted }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedAddress(null);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 3 && suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 transition-all outline-none"
          style={{
            height: '44px',
            background: bgInput,
            border: '2px solid transparent',
            borderRadius: '10px',
            fontSize: '0.875rem',
            color: textMain,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.background = bgWidget;
            e.currentTarget.style.borderColor = accentColor;
            e.currentTarget.style.boxShadow = `0 0 0 4px ${accentColor}20`;
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.background = bgInput;
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {loading ? (
            <Loader2 
              className="w-4 h-4 animate-spin" 
              style={{ color: textMuted }} 
            />
          ) : selectedAddress ? (
            <button 
              onClick={clearSelection} 
              type="button"
              className="p-1 rounded transition-colors"
              style={{ color: textMuted }}
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Suggestions Dropdown - inside the relative wrapper */}
        {isOpen && suggestions.length > 0 && (
          <div 
            className="absolute left-0 right-0 top-full mt-1 z-[100] max-h-64 overflow-y-auto"
            style={{ 
              background: bgWidget,
              border: `1px solid ${borderSubtle}`,
              borderRadius: '12px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.16)',
            }}
          >
            {suggestions.map((suggestion, index) => {
              const name = suggestion.name || suggestion.displayString || suggestion.text || suggestion.address || 'Address';
              const description = suggestion.displayString || suggestion.description || suggestion.fullText || '';
              const isHighlighted = highlightedIndex === index;
              return (
                <button
                  key={`${suggestion.id || index}-${name}`}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(suggestion);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className="w-full px-3 py-2.5 text-left text-sm flex items-start gap-2.5 transition-colors"
                  style={{
                    background: isHighlighted ? bgHover : 'transparent',
                    borderBottom: `1px solid ${borderSubtle}`,
                    color: textMain,
                  }}
                >
                  <MapPin 
                    className="w-4 h-4 mt-0.5 flex-shrink-0" 
                    style={{ color: textMuted }}
                  />
                  <div className="flex-1 min-w-0">
                    <div 
                      className="font-medium truncate"
                      style={{ color: textMain }}
                    >
                      {name}
                    </div>
                    {description && description !== name && (
                      <div 
                        className="text-xs truncate mt-0.5"
                        style={{ color: textMuted }}
                      >
                        {description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Address Confirmation */}
      {selectedAddress && (
        <div 
          className="mt-1.5 p-2.5 flex items-start gap-2"
          style={{ 
            background: successBg,
            borderRadius: '10px',
          }}
        >
          <span className="mt-0.5 flex-shrink-0" style={{ color: successColor }}><Check className="w-4 h-4" /></span>
          <div className="text-sm">
            <div 
              className="font-medium"
              style={{ color: successColor }}
            >
              Address verified
            </div>
            <div style={{ color: textSecondary }}>
              {selectedAddress.displayString}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
