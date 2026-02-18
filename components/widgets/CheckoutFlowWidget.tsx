// components/widgets/CheckoutFlowWidget.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShoppingBag, Lock, MapPin } from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import { geocode } from '@/lib/mapquest';
import { useAddressAutocomplete } from '@/hooks/useAddressAutocomplete';
import WidgetHeader from './WidgetHeader';

type ValidationState = 'idle' | 'verifying' | 'verified' | 'suggestion' | 'invalid';

type AddressFields = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type ValidationResult = {
  state: ValidationState;
  original: AddressFields;
  suggested?: AddressFields;
  coords?: { lat: number; lng: number };
  message?: string;
};

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizeForCompare(s: string) {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(parkway)\b/g, 'pkwy')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSuggested(fields: AddressFields): AddressFields {
  return {
    ...fields,
    line1: titleCase(fields.line1),
    line2: fields.line2 ? titleCase(fields.line2) : '',
    city: titleCase(fields.city),
    state: fields.state.toUpperCase(),
    zip: fields.zip.trim(),
    country: fields.country || 'US',
  };
}

function addressToLine(fields: AddressFields) {
  const parts = [
    fields.line1,
    fields.line2 ? ` ${fields.line2}` : '',
    `, ${fields.city}, ${fields.state} ${fields.zip}`,
  ].join('');
  return parts.replace(/\s+/g, ' ').trim();
}

function deliveryEstimateLabel(state: string) {
  // Simple demo heuristic: closer states get earlier date.
  const fastStates = new Set(['NY', 'NJ', 'CT', 'MA', 'PA', 'MD', 'VA', 'DC', 'DE']);
  const midStates = new Set(['NC', 'SC', 'GA', 'OH', 'MI', 'IL', 'TN', 'FL']);
  const days = fastStates.has(state) ? 2 : midStates.has(state) ? 3 : 4;
  const dt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

async function geocodeRooftopFirst(query: string) {
  // Prefer rooftop/point-level accuracy for map pin placement.
  // We intentionally do this here (widget-level) without changing API proxy logic.
  const res = await fetch(`/api/mapquest?endpoint=geocoding&location=${encodeURIComponent(query)}&maxResults=5`);
  if (!res.ok) return null;
  const data = await res.json();
  const locations: any[] = data?.results?.[0]?.locations || [];
  if (!Array.isArray(locations) || locations.length === 0) return null;

  const rank = (loc: any) => {
    const quality = String(loc?.geocodeQuality || '').toUpperCase();
    const qCode = String(loc?.geocodeQualityCode || '').toUpperCase();
    // Known strongest indicators (best effort heuristic)
    if (quality === 'POINT') return 0;
    if (qCode.startsWith('P1AAA')) return 0; // commonly rooftop/point for MapQuest
    if (quality === 'ADDRESS') return 1;
    if (qCode.startsWith('P1')) return 1;
    if (quality.includes('STREET')) return 2;
    return 3;
  };

  const best = [...locations].sort((a, b) => rank(a) - rank(b))[0];
  const lat = best?.latLng?.lat ?? best?.displayLatLng?.lat;
  const lng = best?.latLng?.lng ?? best?.displayLatLng?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  return {
    ...best,
    lat,
    lng,
  };
}

function ValidationIndicator({ state }: { state: ValidationState }) {
  if (state === 'verifying') return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />;
  if (state === 'verified') return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-success, #10B981)' }} />;
  if (state === 'suggestion') return <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-warning, #F59E0B)' }} />;
  if (state === 'invalid') return <XCircle className="w-4 h-4" style={{ color: 'var(--color-error, #EF4444)' }} />;
  return null;
}

function AddressLine1Autocomplete({
  value,
  onChange,
  onSelect,
  darkMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (sel: { displayString: string; street?: string; city?: string; state?: string; postalCode?: string; lat?: number; lng?: number }) => void;
  darkMode: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { suggestions, loading, isOpen, highlightedIndex, handleSelect, handleKeyDown, closeDropdown } = useAddressAutocomplete(value, onChange, {
    onSelect: onSelect as any,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [closeDropdown]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Street address"
          className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm font-medium outline-none transition-all"
          style={{
            background: darkMode ? '#334155' : '#F1F5F9',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} /> : null}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden z-50"
          style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}
        >
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              // Select on mousedown so blur/focus changes can't eat the click.
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              className={`w-full px-4 py-3 text-left text-sm flex items-start gap-3 transition-colors ${idx === highlightedIndex ? 'bg-black/5' : ''}`}
              style={{ color: 'var(--text-main)' }}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-panel)' }}>
                <MapPin className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium truncate">{s.name || s.displayString}</span>
                {s.displayString && s.displayString !== s.name ? (
                  <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {s.displayString}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CheckoutFlowWidget({
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
}: {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
}) {
  const [fields, setFields] = useState<AddressFields>({
    name: 'John Smith',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  const [validation, setValidation] = useState<ValidationResult>({
    state: 'idle',
    original: { ...fields },
  });

  const [placing, setPlacing] = useState(false);
  const validateDebounceRef = useRef<number | null>(null);

  const fullAddress = useMemo(() => addressToLine(fields), [fields]);

  const canValidate = useMemo(() => {
    return fields.line1.trim().length >= 3 && fields.city.trim().length >= 2 && fields.state.trim().length >= 2 && fields.zip.trim().length >= 5;
  }, [fields]);

  const mapCenter = useMemo(() => validation.coords || { lat: 39.8283, lng: -98.5795 }, [validation.coords]);
  const markers = useMemo(() => {
    if (!validation.coords) return [];
    return [
      {
        lat: validation.coords.lat,
        lng: validation.coords.lng,
        label: 'Delivery destination',
        color: accentColor,
        type: 'home' as const,
      },
    ];
  }, [validation.coords, accentColor]);

  const runValidation = async (sourceFields: AddressFields) => {
    if (!canValidate) return;
    const original = formatSuggested(sourceFields);
    setValidation({ state: 'verifying', original });

    // Rooftop-first for more accurate map pin placement
    const loc = await geocodeRooftopFirst(addressToLine(original));
    if (!loc || !loc.lat || !loc.lng) {
      setValidation({
        state: 'invalid',
        original,
        message: "We couldn't verify this address. Please check and try again.",
      });
      return;
    }

    const suggested: AddressFields = formatSuggested({
      ...original,
      line1: loc.street || original.line1,
      city: loc.adminArea5 || original.city,
      state: (loc.adminArea3 || original.state).toUpperCase(),
      zip: loc.postalCode || original.zip,
      country: (loc.adminArea1 || 'US').toUpperCase(),
    });

    const originalKey = normalizeForCompare(addressToLine(original));
    const suggestedKey = normalizeForCompare(addressToLine(suggested));

    // Minor/formatting-only change: auto-correct silently.
    if (originalKey === suggestedKey) {
      setFields((prev) => ({ ...prev, ...suggested }));
      setValidation({ state: 'verified', original: suggested, coords: { lat: loc.lat, lng: loc.lng } });
      return;
    }

    // Significant change: prompt user.
    setValidation({
      state: 'suggestion',
      original,
      suggested,
      coords: { lat: loc.lat, lng: loc.lng },
      message: `Did you mean: ${addressToLine(suggested)}?`,
    });
  };

  useEffect(() => {
    if (validateDebounceRef.current) window.clearTimeout(validateDebounceRef.current);
    if (!canValidate) {
      setValidation((v) => (v.state === 'idle' ? v : { state: 'idle', original: { ...fields } }));
      return;
    }
    validateDebounceRef.current = window.setTimeout(() => {
      runValidation(fields);
    }, 550);
    return () => {
      if (validateDebounceRef.current) window.clearTimeout(validateDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.line1, fields.city, fields.state, fields.zip, fields.country]);

  const deliveringTo = useMemo(() => {
    if (!validation.coords || validation.state === 'invalid') return null;
    const useFields = validation.state === 'suggestion' && validation.suggested ? validation.suggested : fields;
    return `${useFields.city}, ${useFields.state} ${useFields.zip}`;
  }, [validation, fields]);

  const totals = useMemo(() => {
    const subtotal = 49.99 + 19.0;
    const shipping = 5.99;
    const tax = 4.12;
    const total = subtotal + shipping + tax;
    return { subtotal, shipping, tax, total };
  }, []);

  const btnDisabled = placing || validation.state === 'verifying' || validation.state === 'invalid' || !canValidate;

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader title="Checkout Flow" subtitle="Address autocomplete, validation, and delivery map preview." />
      <div className="flex flex-col md:flex-row md:h-[805px]">
        {/* Left: Shipping form */}
        <div className="w-full md:flex-1 border-t md:border-t-0 md:border-r md:order-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Shipping</div>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
                <Lock className="w-4 h-4" style={{ color: accentColor }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Secure demo
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Full name
                </label>
                <input
                  value={fields.name}
                  onChange={(e) => setFields((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                  style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Address
                  </label>
                  <div className="flex items-center gap-2">
                    <ValidationIndicator state={validation.state} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {validation.state === 'verified'
                        ? 'Verified'
                        : validation.state === 'suggestion'
                          ? 'Suggestion'
                          : validation.state === 'invalid'
                            ? 'Invalid'
                            : validation.state === 'verifying'
                              ? 'Verifying…'
                              : ''}
                    </span>
                  </div>
                </div>

                <AddressLine1Autocomplete
                  value={fields.line1}
                  onChange={(v) => setFields((p) => ({ ...p, line1: v }))}
                  onSelect={(sel) => {
                    const street = sel.street || sel.displayString || '';
                    setFields((p) => ({
                      ...p,
                      line1: street,
                      city: sel.city || p.city,
                      state: (sel.state || p.state || '').toUpperCase(),
                      zip: sel.postalCode || p.zip,
                      country: 'US',
                    }));
                  }}
                  darkMode={darkMode}
                />

                <div className="mt-2">
                  <input
                    value={fields.line2}
                    onChange={(e) => setFields((p) => ({ ...p, line2: e.target.value }))}
                    placeholder="Apt, suite, unit (optional)"
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                    style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                </div>

                {validation.state === 'invalid' && validation.message ? (
                  <div className="mt-2 p-3 rounded-xl text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--border-subtle)' }}>
                    {validation.message}
                  </div>
                ) : null}

                {validation.state === 'suggestion' && validation.suggested ? (
                  <div className="mt-2 p-3 rounded-xl" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                      Did you mean:
                    </div>
                    <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {addressToLine(validation.suggested)}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        className="prism-btn prism-btn-primary px-3 py-2 text-sm"
                        style={{ background: accentColor }}
                        onClick={() => {
                          setFields((p) => ({ ...p, ...validation.suggested! }));
                          setValidation((v) => ({ state: 'verified', original: v.suggested!, coords: v.coords }));
                        }}
                      >
                        Accept correction
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                        onClick={() => setValidation((v) => ({ state: 'verified', original: v.original, coords: v.coords }))}
                      >
                        Keep original
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  City
                </label>
                <input
                  value={fields.city}
                  onChange={(e) => setFields((p) => ({ ...p, city: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                  style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  State
                </label>
                <select
                  value={fields.state}
                  onChange={(e) => setFields((p) => ({ ...p, state: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                  style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  ZIP
                </label>
                <input
                  value={fields.zip}
                  onChange={(e) => setFields((p) => ({ ...p, zip: e.target.value.replace(/[^\d-]/g, '').slice(0, 10) }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                  style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Country
                </label>
                <select
                  value={fields.country}
                  onChange={(e) => setFields((p) => ({ ...p, country: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                  style={{ background: darkMode ? '#334155' : '#F1F5F9', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="US">United States</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-4 mt-auto" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
            <button
              type="button"
              disabled={btnDisabled}
              onClick={async () => {
                setPlacing(true);
                try {
                  await new Promise((r) => setTimeout(r, 700));
                } finally {
                  setPlacing(false);
                }
              }}
              className="prism-btn prism-btn-primary w-full py-3 text-sm"
              style={{
                background: accentColor,
                opacity: btnDisabled ? 0.6 : 1,
                boxShadow: `0 10px 24px ${accentColor}35`,
              }}
            >
              {placing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> <span className="ml-2">Placing order…</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" /> <span className="ml-2">Continue / Place order</span>
                </>
              )}
            </button>
            <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
              Demo only — no payment processing and no data stored.
            </div>
          </div>
        </div>

        {/* Right: Order summary + map */}
        <div className="w-full md:w-[420px] md:order-2" style={{ background: 'var(--bg-widget)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
              Order Summary
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ background: `${accentColor}15` }}>
                <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: accentColor }}>
                  PRO
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                  Widget Pro
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Qty: 1
                </div>
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                $49.99
              </div>
            </div>

            <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ background: `${accentColor}10` }}>
                <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: accentColor }}>
                  MAP
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                  Delivery Map Add‑on
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Qty: 1
                </div>
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                $19.00
              </div>
            </div>

            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                <span>Shipping</span>
                <span>${totals.shipping.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                <span>Tax</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              <div className="h-px my-2" style={{ background: 'var(--border-subtle)' }} />
              <div className="flex items-center justify-between text-base font-bold" style={{ color: 'var(--text-main)' }}>
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="rounded-2xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                Delivering to
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>
                {deliveringTo || '—'}
              </div>
              {fields.state ? (
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Estimated delivery: <span style={{ color: 'var(--text-secondary)' }}>{deliveryEstimateLabel(fields.state)}</span>
                </div>
              ) : null}

              <div className="mt-3 rounded-xl overflow-hidden" style={{ height: 240, background: 'var(--bg-panel)' }}>
                <MapQuestMap
                  apiKey={API_KEY}
                  center={mapCenter}
                  zoom={validation.coords ? 16 : 4}
                  darkMode={darkMode}
                  accentColor={accentColor}
                  markers={markers}
                  height="100%"
                  showZoomControls={false}
                  interactive={!!validation.coords}
                  zoomToLocation={validation.coords ? { ...validation.coords, zoom: 16 } : undefined}
                />
              </div>
              {!validation.coords ? (
                <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Enter a verified address to preview the delivery location on the map.
                </div>
              ) : null}
            </div>
          </div>

        </div>
      </div>

      {showBranding && (
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
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <img
            src="/brand/mapquest-footer-light.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--light"
          />
          <img
            src="/brand/mapquest-footer-dark.svg"
            alt="MapQuest"
            className="prism-footer-logo prism-footer-logo--dark"
          />
        </div>
      )}
    </div>
  );
}

