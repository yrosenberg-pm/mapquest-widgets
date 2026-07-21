'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Loader2, Navigation, Truck } from 'lucide-react';
import DemoTruckMap from '@/components/demo/DemoTruckMap';
import MapQuestPoweredLogo from '@/components/widgets/MapQuestPoweredLogo';
import { DEMO_ACCENT } from '@/lib/demo/demoTokens';
import { drawTruckRoute } from '@/lib/demo/drawTruckRoute';
import type { DemoTruckRouteResult } from '@/lib/demo/demoTruckRouteTypes';
import {
  BUILD_STEP_BASE_DELAY_MS,
  DEMO_DESTINATION,
  DEMO_ORIGIN,
  TRUCK_ROUTING_BUILD_STEPS,
  buildStepIndex,
  type TruckRoutingBuildStepId,
} from '@/lib/demo/truckRoutingBuildSteps';
import { jitter, sleep } from '@/lib/gallery/jitter';

const BORDER = 'var(--border-subtle)';
const TEXT_MAIN = 'var(--text-main)';
const TEXT_MUTED = 'var(--text-muted)';
const BG_WIDGET = 'var(--bg-widget)';
const HEADER_RULE = '#CBD5E1';

function stepVisible(stepIndex: number, id: TruckRoutingBuildStepId): boolean {
  return stepIndex >= buildStepIndex(id);
}

function Assemble({
  id,
  stepIndex,
  children,
  className = '',
}: {
  id: TruckRoutingBuildStepId;
  stepIndex: number;
  children: React.ReactNode;
  className?: string;
}) {
  if (!stepVisible(stepIndex, id)) return null;
  const isCard = id === 'card';
  return (
    <div
      className={[isCard ? 'demo-assemble-card' : 'demo-assemble-piece', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

function MockField({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={value}
          className="w-20 px-2.5 py-1.5 rounded-lg text-sm font-medium tabular-nums pointer-events-none"
          style={{
            background: 'var(--bg-input)',
            border: `1px solid ${BORDER}`,
            color: TEXT_MAIN,
          }}
        />
        {unit ? (
          <span className="text-xs font-medium flex-shrink-0" style={{ color: TEXT_MUTED }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AddressRow({
  letter,
  value,
  placeholder,
  filled,
}: {
  letter: 'A' | 'B';
  value: string;
  placeholder: string;
  filled: boolean;
}) {
  return (
    <div
      className="rounded-xl flex items-center gap-2.5"
      style={{
        background: 'var(--bg-input)',
        border: `1px solid ${filled ? `${DEMO_ACCENT}40` : BORDER}`,
        padding: '10px 12px',
      }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
        style={{ background: DEMO_ACCENT, color: 'white' }}
      >
        {letter}
      </div>
      <span
        className="flex-1 text-sm font-medium truncate pointer-events-none"
        style={{ color: value ? TEXT_MAIN : TEXT_MUTED }}
      >
        {value || placeholder}
      </span>
    </div>
  );
}

type Props = {
  runKey: number;
};

export default function TruckRoutingMockAssembly({ runKey }: Props) {
  const [stepIndex, setStepIndex] = useState(-1);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<DemoTruckRouteResult | null>(null);
  const routeFetchStartedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setStepIndex(-1);
    setRouteLoading(false);
    setRouteData(null);
    routeFetchStartedRef.current = false;

    (async () => {
      for (let i = 0; i < TRUCK_ROUTING_BUILD_STEPS.length; i++) {
        if (!alive) return;
        const id = TRUCK_ROUTING_BUILD_STEPS[i];
        setStepIndex(i);
        const base = BUILD_STEP_BASE_DELAY_MS[id];
        await sleep(jitter(base, 0.4));
      }
    })();

    return () => {
      alive = false;
    };
  }, [runKey]);

  useEffect(() => {
    if (stepIndex < buildStepIndex('dest-fill')) return;
    if (routeFetchStartedRef.current) return;
    routeFetchStartedRef.current = true;
    setRouteLoading(true);
    drawTruckRoute()
      .then((result) => setRouteData(result))
      .catch((err) => console.error('[TruckRoutingMockAssembly] route failed:', err))
      .finally(() => setRouteLoading(false));
  }, [stepIndex, runKey]);

  const originFilled = stepVisible(stepIndex, 'origin-fill');
  const destFilled = stepVisible(stepIndex, 'dest-fill');
  const cardOnly = stepIndex === buildStepIndex('card');
  const showInner = stepIndex > buildStepIndex('card');
  const showMapLive = stepVisible(stepIndex, 'map-panel');
  const poisOn = stepVisible(stepIndex, 'field-truck-pois');
  const showCardShadow = stepVisible(stepIndex, 'footer');

  if (stepIndex < 0) return null;

  return (
    <>
      <style jsx global>{`
        @keyframes demoPieceIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes demoCardIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .demo-assemble-piece {
          animation: demoPieceIn 280ms ease-out both;
        }
        .demo-assemble-card {
          animation: demoCardIn 400ms ease-out both;
        }
      `}</style>

      <div
        className={[
          'prism-widget w-full md:w-[1240px]',
          cardOnly ? 'demo-assemble-card' : '',
          !showCardShadow ? 'prism-widget--flat' : 'transition-[box-shadow] duration-500 ease-out',
        ]
          .filter(Boolean)
          .join(' ')}
        data-theme="light"
        style={{
          fontFamily: 'var(--brand-font)',
          '--brand-primary': DEMO_ACCENT,
          minHeight: cardOnly ? 760 : undefined,
        } as React.CSSProperties}
      >
        {showInner ? (
          <>
            <div className="prism-header" style={{ padding: '12px 16px' }}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Assemble id="header-icon" stepIndex={stepIndex}>
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: DEMO_ACCENT, color: 'white' }}
                  >
                    <Truck className="w-4 h-4" />
                  </div>
                </Assemble>
                <Assemble id="header-title" stepIndex={stepIndex}>
                  <h2
                    className="prism-header-title flex-shrink-0"
                    style={{ fontSize: '18px', lineHeight: '24px', color: TEXT_MAIN, fontWeight: 600 }}
                  >
                    Truck Routing
                  </h2>
                </Assemble>
                <Assemble id="header-subtitle" stepIndex={stepIndex}>
                  <div
                    className="hidden sm:block min-w-0 flex-1"
                    style={{
                      borderLeft: `1px solid ${HEADER_RULE}`,
                      marginLeft: 12,
                      paddingLeft: 12,
                      paddingRight: 4,
                    }}
                  >
                    <p
                      className="truncate"
                      style={{ fontSize: '13px', lineHeight: '18px', color: TEXT_MUTED }}
                    >
                      Plan a truck-safe route with constraints and restrictions.
                    </p>
                  </div>
                </Assemble>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:h-[700px]">
              <div
                className="w-full md:w-[500px] flex flex-col border-t md:border-t-0 md:border-r md:order-1"
                style={{ borderColor: BORDER }}
              >
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="p-3 space-y-2 flex-shrink-0">
                    <div
                      className="rounded-2xl overflow-hidden"
                      style={{ background: BG_WIDGET, border: `1px solid ${BORDER}` }}
                    >
                      <div className="px-4 py-3">
                        <Assemble id="vehicle-profile-label" stepIndex={stepIndex}>
                          <div className="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 -my-2">
                            <div className="min-w-0 text-left">
                              <div className="text-xs font-semibold" style={{ color: TEXT_MAIN }}>
                                Vehicle Profile
                              </div>
                              <div className="text-[11px] truncate mt-0.5" style={{ color: TEXT_MUTED }}>
                                13.5 ft H × 8.5 ft W × 48 ft L · 20 tons · 5 axles
                              </div>
                            </div>
                            <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: TEXT_MUTED }} />
                          </div>
                        </Assemble>
                        <div className="pt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <Assemble id="field-height" stepIndex={stepIndex}>
                              <MockField label="Height" value={13.5} unit="ft" />
                            </Assemble>
                            <Assemble id="field-weight" stepIndex={stepIndex}>
                              <MockField label="Weight" value={20} unit="tons" />
                            </Assemble>
                            <Assemble id="field-width" stepIndex={stepIndex}>
                              <MockField label="Width" value={8.5} unit="ft" />
                            </Assemble>
                            <Assemble id="field-length" stepIndex={stepIndex}>
                              <MockField label="Length" value={48} unit="ft" />
                            </Assemble>
                            <Assemble id="field-max-elevation" stepIndex={stepIndex}>
                              <div>
                                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED }}>
                                  Max elevation
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    readOnly
                                    tabIndex={-1}
                                    value=""
                                    placeholder="No limit"
                                    className="w-full px-3 py-2 rounded-lg text-sm font-medium pointer-events-none"
                                    style={{
                                      background: 'var(--bg-input)',
                                      border: `1px solid ${BORDER}`,
                                      color: TEXT_MUTED,
                                    }}
                                  />
                                  <span
                                    className="text-xs font-medium flex-shrink-0"
                                    style={{ color: TEXT_MUTED, width: '30px' }}
                                  >
                                    ft
                                  </span>
                                </div>
                              </div>
                            </Assemble>
                          </div>
                          <Assemble id="field-truck-pois" stepIndex={stepIndex}>
                            <div className="mt-2 flex items-center justify-between gap-3" style={{ paddingRight: 35 }}>
                              <div className="min-w-0">
                                <div className="text-xs font-medium" style={{ color: TEXT_MAIN }}>
                                  Truck POIs
                                </div>
                                <div className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>
                                  Rest areas and truck stops along the route
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs tabular-nums" style={{ color: TEXT_MUTED }}>
                                  0
                                </span>
                                <span
                                  className="relative inline-flex h-6 w-11 items-center rounded-full border"
                                  style={{
                                    borderColor: BORDER,
                                    background: poisOn ? DEMO_ACCENT : 'var(--bg-input)',
                                    opacity: poisOn ? 1 : 0.55,
                                  }}
                                  aria-hidden
                                >
                                  <span
                                    className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                                    style={{ transform: poisOn ? 'translateX(22px)' : 'translateX(2px)' }}
                                  />
                                </span>
                              </div>
                            </div>
                          </Assemble>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl p-3" style={{ background: BG_WIDGET, border: `1px solid ${BORDER}` }}>
                      <Assemble id="route-label" stepIndex={stepIndex}>
                        <div className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: TEXT_MUTED }}>
                          Route
                        </div>
                      </Assemble>
                      <div className="space-y-2">
                        <Assemble id="origin-shell" stepIndex={stepIndex}>
                          <AddressRow
                            letter="A"
                            value={originFilled ? DEMO_ORIGIN : ''}
                            placeholder="Enter origin"
                            filled={originFilled}
                          />
                        </Assemble>
                        <Assemble id="dest-shell" stepIndex={stepIndex}>
                          <AddressRow
                            letter="B"
                            value={destFilled ? DEMO_DESTINATION : ''}
                            placeholder="Enter destination"
                            filled={destFilled}
                          />
                        </Assemble>
                      </div>
                      <Assemble id="departure" stepIndex={stepIndex}>
                        <div className="mt-2">
                          <div
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl pointer-events-none"
                            style={{
                              background: 'var(--bg-panel)',
                              border: `1px solid ${BORDER}`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" style={{ color: DEMO_ACCENT }} />
                              <span className="text-sm font-medium" style={{ color: TEXT_MAIN }}>
                                Leave now
                              </span>
                            </div>
                            <ChevronDown className="w-4 h-4" style={{ color: TEXT_MUTED }} />
                          </div>
                        </div>
                      </Assemble>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0" />

                  <Assemble id="cta-button" stepIndex={stepIndex}>
                    <div
                      className="p-4 flex-shrink-0"
                      style={{
                        borderTop: `1px solid ${BORDER}`,
                        background: 'var(--bg-panel)',
                      }}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        className="prism-btn prism-btn-primary w-full pointer-events-none flex items-center justify-center gap-2"
                        style={{
                          background: routeLoading
                            ? 'var(--bg-panel)'
                            : `linear-gradient(135deg, ${DEMO_ACCENT} 0%, ${DEMO_ACCENT}dd 100%)`,
                          boxShadow: routeLoading ? 'none' : `0 8px 20px ${DEMO_ACCENT}33`,
                          color: routeLoading ? DEMO_ACCENT : 'white',
                          border: routeLoading ? `1px solid ${BORDER}` : 'none',
                        }}
                      >
                        {routeLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 prism-spinner" />
                            Calculating Truck Route...
                          </>
                        ) : (
                          <>
                            <Navigation className="w-4 h-4" />
                            Get Truck Route
                          </>
                        )}
                      </button>
                    </div>
                  </Assemble>
                </div>
              </div>

              <div className="flex h-[300px] w-full flex-col md:order-2 md:h-full md:min-h-0 md:flex-1">
                <Assemble id="map-panel" stepIndex={stepIndex} className="flex h-full min-h-0 w-full flex-1 flex-col">
                  <div
                    className="relative h-full min-h-[300px] w-full flex-1 overflow-hidden md:min-h-0"
                    style={{ background: '#e8eaed' }}
                  >
                    {showMapLive ? (
                      <DemoTruckMap runKey={runKey} route={routeData} />
                    ) : null}
                  </div>
                </Assemble>
              </div>
            </div>

            <Assemble id="footer" stepIndex={stepIndex}>
              <div className="prism-footer">
                <span aria-label="Powered by MapQuest">Powered by</span>
                <MapQuestPoweredLogo darkMode={false} />
              </div>
            </Assemble>
          </>
        ) : null}
      </div>
    </>
  );
}
