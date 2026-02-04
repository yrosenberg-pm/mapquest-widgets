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
  minAlnumChars?: number;
  maxSuggestions?: number;
  debounceMs?: number;
  disabled?: boolean;
}

export function useAddressAutocomplete(
  value: string,
  onChange: (value: string) => void,
  options: UseAddressAutocompleteOptions = {}
) {
  const {
    onSelect,
    // UX: only start searching once we have enough signal (reduces jumpiness)
    minChars = 4,
    // "letters or numbers" threshold (ignores spaces/punctuation)
    minAlnumChars = 4,
    maxSuggestions = 6,
    // UX: wait for the user to pause typing before fetching
    debounceMs = 1000,
    disabled = false,
  } = options;
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const justSelectedRef = useRef(false);
  const requestSeqRef = useRef(0);

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
    
    const trimmed = value.trim();
    const alnumLen = trimmed.replace(/[^a-z0-9]/gi, '').length;

    if (trimmed.length < minChars || alnumLen < minAlnumChars) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        const results = await searchAhead(trimmed, maxSuggestions);
        // Ignore out-of-order responses
        if (seq !== requestSeqRef.current) return;
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
        if (seq !== requestSeqRef.current) return;
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, minChars, minAlnumChars, maxSuggestions, debounceMs, disabled, isFocused]);

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

