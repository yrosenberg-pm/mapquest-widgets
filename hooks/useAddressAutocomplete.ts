// hooks/useAddressAutocomplete.ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { searchAhead } from '@/lib/mapquest';

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

interface UseAddressAutocompleteOptions {
  onSelect?: (address: AddressResult) => void;
  minChars?: number;
  maxSuggestions?: number;
  disabled?: boolean;
}

export function useAddressAutocomplete(
  value: string,
  onChange: (value: string) => void,
  options: UseAddressAutocompleteOptions = {}
) {
  const { onSelect, minChars = 3, maxSuggestions = 6, disabled = false } = options;
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    // Skip search if disabled
    if (disabled) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // If the input isn't focused, never pop the dropdown open (prevents "ghost dropdown"
    // when switching tabs / remounting components).
    if (!isFocused) {
      setIsOpen(false);
      return;
    }
    
    // Skip search if user just selected an item
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    
    if (value.length < minChars) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setIsOpen(false);
      try {
        const results = await searchAhead(value, maxSuggestions);
        setSuggestions(results);
        
        if (results && results.length > 0) {
          // Only open suggestions while focused.
          setIsOpen(isFocused);
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
  }, [value, minChars, maxSuggestions, disabled, isFocused]);

  const handleSelect = (suggestion: any) => {
    const addressResult: AddressResult = {
      displayString: suggestion.displayString || suggestion.name || '',
      street: suggestion.street,
      city: suggestion.city,
      state: suggestion.state || suggestion.stateCode,
      postalCode: suggestion.postalCode,
      country: suggestion.country,
      lat: suggestion.lat,
      lng: suggestion.lng,
    };

    // Mark that we just selected to prevent dropdown from reopening
    justSelectedRef.current = true;
    setIsOpen(false);
    setSuggestions([]);
    onChange(addressResult.displayString);
    onSelect?.(addressResult);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex]);
      } else if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    if (disabled) return;
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  return {
    suggestions,
    loading,
    isOpen,
    highlightedIndex,
    handleSelect,
    handleKeyDown,
    closeDropdown,
    handleFocus,
    handleBlur,
  };
}

