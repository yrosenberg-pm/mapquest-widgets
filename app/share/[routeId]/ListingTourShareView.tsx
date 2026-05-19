'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Route, Clock, Loader2, Share2, Check, Printer, MapPin } from 'lucide-react';
import { getDirections } from '@/lib/mapquest';

/** Shared itinerary stop (never includes privateNotes) */
export interface SharedTourStopPayload {
  address: string;
  lat: number;
  lng: number;
  showingStart?: string;
  showingEnd?: string;
}

export interface SharedTourDayPayload {
  label: string;
  date: string;
  departureTime: string;
  stops: SharedTourStopPayload[];
}

export interface SharedListingTourPayload {
  kind: 'listing-tour';
  days: SharedTourDayPayload[];
  type: 'fastest' | 'shortest' | 'balanced';
  companyName?: string;
}

interface DayRouteResult {
  totalDistance: number;
  totalTime: number;
  legs: { from: string; to: string; distance: number; time: number }[];
}

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

function tourStaticMapUrl(stops: { lat: number; lng: number }[]): string | null {
  if (!API_KEY || stops.length < 1) return null;
  const locs = stops.map((s) => `${s.lat},${s.lng}`).join('|');
  const params = new URLSearchParams({
    key: API_KEY,
    size: '640,360@2x',
    type: 'light',
    locations: locs,
  });
  return `https://www.mapquestapi.com/staticmap/v5/map?${params.toString()}`;
}

function formatDur(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function ListingTourShareView({ data }: { data: SharedListingTourPayload }) {
  const searchParams = useSearchParams();
  const [routesByDay, setRoutesByDay] = useState<Record<number, DayRouteResult | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const out: Record<number, DayRouteResult | null> = {};
    try {
      for (let d = 0; d < data.days.length; d++) {
        const day = data.days[d];
        const stops = day.stops;
        if (stops.length < 2) {
          out[d] = null;
          continue;
        }
        let totalDistance = 0;
        let totalTime = 0;
        const legs: DayRouteResult['legs'] = [];
        const routeTypeEffective = data.type === 'balanced' ? 'fastest' : data.type;
        const dep = new Date(`${day.date}T${day.departureTime}:00`);

        for (let i = 0; i < stops.length - 1; i++) {
          const from = `${stops[i].lat},${stops[i].lng}`;
          const to = `${stops[i + 1].lat},${stops[i + 1].lng}`;
          const directions = await getDirections(
            from,
            to,
            routeTypeEffective,
            isNaN(dep.getTime()) ? undefined : dep
          );
          if (directions) {
            totalDistance += directions.distance;
            totalTime += directions.time;
            legs.push({
              from: stops[i].address,
              to: stops[i + 1].address,
              distance: directions.distance,
              time: directions.time,
            });
          }
        }

        out[d] = {
          totalDistance,
          totalTime,
          legs,
        };
      }
      setRoutesByDay(out);
    } catch {
      setError('Could not build tour routes.');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  useEffect(() => {
    if (loading || error) return;
    if (searchParams.get('print') !== '1') return;
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [loading, error, searchParams]);

  const dayBlocks = useMemo(() => data.days, [data.days]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-gray-600 text-sm">Calculating itineraries…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { break-after: page; page-break-after: always; }
          body { background: white !important; }
        }
      `}</style>

      <header className="sticky top-0 z-40 border-b bg-white no-print shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
              <Route className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Listing Tour Itinerary</h1>
              <p className="text-xs text-gray-500">
                {data.companyName ? `${data.companyName} · ` : ''}Powered by MapQuest
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* noop */
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100 hover:bg-blue-100"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium hover:brightness-105"
              style={{ backgroundColor: '#2563eb' }}
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="max-w-xl mx-auto p-8 text-red-700 text-center no-print">{error}</div>
      ) : null}

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {dayBlocks.map((day, idx) => {
          const rr = routesByDay[idx];
          const staticUrl = tourStaticMapUrl(day.stops);
          return (
            <section key={`${day.label}-${idx}`} className={idx < dayBlocks.length - 1 ? 'print-break pb-12' : ''}>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    {day.label}{' '}
                    <span className="font-normal text-gray-500">{day.date}</span>
                  </h2>
                  <p className="text-sm text-gray-600">
                    Starts {day.departureTime} · {day.stops.length} listings · Route preference:{' '}
                    <span className="font-semibold">{data.type}</span>
                  </p>
                </div>
                {rr ? (
                  <div className="flex gap-6 text-sm">
                    <span>
                      Drive <Clock className="inline w-4 h-4 mb-px" />{' '}
                      <strong>{formatDur(rr.totalTime)}</strong>
                    </span>
                    <span>
                      Miles <Route className="inline w-4 h-4 mb-px" />{' '}
                      <strong>{rr.totalDistance.toFixed(1)}</strong>
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-amber-700">Needs at least 2 pins to compute mileage</p>
                )}
              </div>

              <div className="grid lg:grid-cols-5 gap-4 mb-6">
                <div className="lg:col-span-2 rounded-xl overflow-hidden border bg-white shadow-sm">
                  {staticUrl ? (
                    <img src={staticUrl} alt={`Map overview — ${day.label}`} className="w-full h-auto object-cover" />
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
                      Add MapQuest API key for static previews
                    </div>
                  )}
                </div>
                <div className="lg:col-span-3 rounded-xl border bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="p-3 font-semibold">#</th>
                        <th className="p-3 font-semibold">Address</th>
                        <th className="p-3 font-semibold">Showing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.stops.map((s, si) => (
                        <tr key={`${idx}-${si}`} className="border-t border-gray-100 hover:bg-blue-50/40">
                          <td className="p-3 font-semibold text-blue-600">{si + 1}</td>
                          <td className="p-3">{s.address}</td>
                          <td className="p-3 text-gray-600">
                            {s.showingStart && s.showingEnd ? `${s.showingStart}–${s.showingEnd}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {rr && rr.legs.length > 0 ? (
                <div className="rounded-xl border bg-white shadow-sm divide-y divide-gray-100">
                  {rr.legs.map((leg, li) => (
                    <div key={li} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                      <span className="text-gray-700">
                        {li + 1}. {leg.from} → {leg.to}
                      </span>
                      <span className="text-gray-500 font-semibold tabular-nums">
                        {leg.distance.toFixed(1)} mi · {formatDur(leg.time)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </main>

      <footer className="border-t mt-16 py-6 text-center text-xs text-gray-400 no-print">
        MapQuest listing tour itinerary · routes use Directions + Static Map previews
      </footer>
    </div>
  );
}
