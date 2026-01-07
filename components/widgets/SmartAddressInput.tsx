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
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
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

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-white';
  const hoverBg = darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50';

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
      // Get coordinates from suggestion - they're already mapped in searchAhead
      let lat: number | undefined = suggestion.lat;
      let lng: number | undefined = suggestion.lng;
      
      // Fallback: extract from place.geometry.coordinates if not already mapped
      if ((!lat || !lng) && suggestion.place?.geometry?.coordinates) {
        const coords = suggestion.place.geometry.coordinates;
        lng = coords[0]; // longitude is first
        lat = coords[1]; // latitude is second
      }
      
      // If still no coordinates, geocode the address
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
      className={`relative ${textColor}`}
      style={{ minWidth: '400px', fontFamily }}
    >
      {label && (
        <label className={`block text-sm font-medium mb-2 ${textColor}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className={`relative rounded-lg border ${borderColor} ${bgColor}`} style={{ borderRadius }}>
        <div className="relative">
          <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedText} z-10`} />
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
              console.log('Input focused, query:', query, 'suggestions:', suggestions.length);
              if (query.length >= 3 && suggestions.length > 0) {
                console.log('Opening dropdown on focus');
                setIsOpen(true);
              }
            }}
            placeholder={placeholder}
            className={`w-full pl-10 pr-10 py-3 text-sm ${inputBg} ${textColor} focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            style={{ borderRadius }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
            {loading ? (
              <Loader2 className={`w-4 h-4 animate-spin ${mutedText}`} />
            ) : selectedAddress ? (
              <button onClick={clearSelection} className={mutedText} type="button">
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div 
            className={`absolute left-0 right-0 top-full mt-1 ${bgColor} border ${borderColor} rounded-lg shadow-xl z-[100] max-h-64 overflow-y-auto`} 
            style={{ borderRadius, marginTop: '4px' }}
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
                  className={`w-full px-4 py-3 text-left text-sm flex items-start gap-3 transition-colors ${
                    isHighlighted 
                      ? (darkMode ? 'bg-gray-700' : 'bg-gray-100') 
                      : hoverBg
                  } ${isHighlighted ? '' : 'hover:' + (darkMode ? 'bg-gray-700' : 'bg-gray-50')}`}
                >
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${mutedText}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${textColor}`}>
                      {name}
                    </div>
                    {description && description !== name && (
                      <div className={`text-xs truncate ${mutedText} mt-0.5`}>
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
        <div className={`mt-2 p-3 rounded-lg ${darkMode ? 'bg-green-900/20' : 'bg-green-50'} flex items-start gap-2`} style={{ borderRadius }}>
          <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className={`font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
              Address verified
            </div>
            <div className={darkMode ? 'text-green-300/70' : 'text-green-600/70'}>
              {selectedAddress.displayString}
            </div>
          </div>
        </div>
      )}

      {/* Branding */}
      {showBranding && (
        <div className={`mt-2 flex items-center justify-end gap-2 text-xs ${mutedText}`}>
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt={companyName || 'Company logo'} 
              className="h-4 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span>
            {companyName && <span className="font-medium">{companyName} · </span>}
            Powered by <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}