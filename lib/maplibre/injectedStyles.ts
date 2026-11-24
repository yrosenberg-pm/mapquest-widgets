export const MAPQUEST_MAP_STYLE_ID = 'mapquest-modern-styles-v6';

export function getMapQuestMapInjectedCss(): string {
  return `
      .maplibregl-map {
        position: relative !important;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }

      .mq-tiles-ragged-reveal .maplibregl-canvas {
        opacity: 1;
      }

      .maplibregl-ctrl-group {
        border: none !important;
        border-radius: 6px !important;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12) !important;
      }
      .maplibregl-ctrl-group button {
        width: 32px !important;
        height: 32px !important;
        font-size: 16px !important;
        color: #374151 !important;
        background: white !important;
        border: none !important;
      }
      .maplibregl-ctrl-group button:hover {
        background: #f3f4f6 !important;
      }
      .dark-map .maplibregl-ctrl-group {
        box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
      }
      .dark-map .maplibregl-ctrl-group button {
        background: #1f2937 !important;
        color: #d1d5db !important;
      }
      .dark-map .maplibregl-ctrl-group button:hover {
        background: #374151 !important;
      }
      .dark-map .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
        filter: brightness(0) invert(1) !important;
        opacity: 0.92 !important;
      }
      .dark-map .maplibregl-ctrl-group button:disabled .maplibregl-ctrl-icon {
        opacity: 0.35 !important;
      }

      .maplibregl-ctrl-attrib {
        background: rgba(255,255,255,0.85) !important;
        padding: 3px 8px !important;
        border-radius: 4px !important;
        font-size: 9px !important;
        margin: 6px !important;
        color: #6b7280 !important;
        max-width: min(70vw, 380px) !important;
      }
      .dark-map .maplibregl-ctrl-attrib {
        background: rgba(17,24,39,0.85) !important;
        color: #9ca3af !important;
      }
      .maplibregl-ctrl-attrib a {
        color: inherit !important;
      }

      .maplibregl-ctrl-bottom-left {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-end !important;
        align-items: flex-start !important;
        gap: 2px !important;
        pointer-events: none !important;
      }
      .maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib {
        pointer-events: auto !important;
      }
      .mapquest-logo {
        order: 10 !important;
        margin: 0 0 4px 6px !important;
        padding: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        line-height: 0 !important;
        pointer-events: auto !important;
      }
      .mapquest-logo a {
        display: block !important;
        line-height: 0 !important;
      }
      .mapquest-logo img {
        display: block !important;
        height: 20px !important;
        width: auto !important;
        max-width: 128px !important;
      }
      .dark-map .mapquest-logo img {
        filter: none !important;
      }

      .maplibregl-map a.mapquest-terms-docked,
      .maplibregl-map a#terms.mapquest-terms-docked {
        position: absolute !important;
        right: 8px !important;
        bottom: 8px !important;
        z-index: 2 !important;
        font-size: 9px !important;
        line-height: 1.2 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        background: rgba(255, 255, 255, 0.9) !important;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
        color: #6b7280 !important;
        text-decoration: none !important;
      }
      .dark-map .maplibregl-map a.mapquest-terms-docked,
      .dark-map .maplibregl-map a#terms.mapquest-terms-docked {
        background: rgba(17, 24, 39, 0.92) !important;
        color: #9ca3af !important;
      }

      .maplibregl-marker {
        overflow: visible !important;
      }
      .maplibregl-marker:has(.cluster-marker-interactive) {
        pointer-events: auto !important;
      }
      .maplibregl-marker.cluster-marker-raised {
        z-index: 100000 !important;
      }
      .modern-marker {
        cursor: pointer;
        line-height: 0;
      }
      .modern-marker-body {
        transform-origin: center bottom;
      }
      .modern-marker img {
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
        display: block;
      }
      .modern-marker-crisp svg {
        display: block;
        filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.28));
      }

      .pulse-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid #3b82f6;
        opacity: 0;
        animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        pointer-events: none;
      }
      @keyframes pulse-ring {
        0% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.8); }
        50% { opacity: 0.3; transform: translate(-50%, -50%) scale(1.2); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
      }

      .marker-tooltip-popup {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        color: #fff;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        min-width: 220px;
        max-width: min(360px, calc(100vw - 32px));
        white-space: normal;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s ease;
        z-index: 1;
      }
      .modern-marker:hover .marker-tooltip-popup,
      .modern-marker:focus-within .marker-tooltip-popup,
      .modern-marker.cluster-tooltip-active .marker-tooltip-popup {
        opacity: 1;
      }

      .modern-marker.cluster-marker-interactive {
        position: relative;
        pointer-events: auto;
        cursor: pointer;
      }
      .cluster-marker-hit {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 2;
        background: transparent;
        border-radius: 50%;
        box-sizing: border-box;
      }
      .modern-marker.cluster-marker-interactive .modern-marker-body {
        position: relative;
        z-index: 1;
        pointer-events: none;
      }
      .modern-marker.cluster-marker-interactive .modern-marker-body img {
        pointer-events: none;
        user-select: none;
      }

      .map-cluster-tooltip-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 100001 !important;
        overflow: visible;
      }
      .map-cluster-tooltip-dock {
        position: absolute;
        bottom: 36px;
        right: 14px;
        pointer-events: none;
        z-index: 100002 !important;
        max-width: min(320px, calc(100% - 28px));
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.12s ease;
      }
      .map-cluster-tooltip-dock.is-visible {
        opacity: 1;
        visibility: visible;
      }
      .map-cluster-tooltip-card {
        position: relative;
        pointer-events: none;
        background: #ffffff;
        border-radius: 14px;
        padding: 14px 16px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 12px 28px rgba(0, 0, 0, 0.08);
        color: #111827;
        min-width: 160px;
        width: max-content;
        max-width: min(320px, calc(100vw - 48px));
      }
      .dark-map .map-cluster-tooltip-card {
        background: #1f2937;
        color: #f9fafb;
        border-color: rgba(255, 255, 255, 0.08);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 12px 28px rgba(0, 0, 0, 0.25);
      }
      .map-cluster-tooltip-card.is-visible {
        opacity: 1;
      }
      .map-cluster-tooltip-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 10px;
      }
      .map-cluster-tooltip-row {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 15px;
        font-weight: 400;
        line-height: 1.3;
      }
      .map-cluster-tooltip-row + .map-cluster-tooltip-row {
        margin-top: 8px;
      }
      .map-cluster-tooltip-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .marker-click-popup {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%);
        background: white;
        color: #1f2937;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        max-width: min(520px, calc(100vw - 32px));
        z-index: 2;
      }
      .dark-map .marker-click-popup {
        background: #1f2937;
        color: #f9fafb;
      }
    `;
}

export function injectMapQuestMapStyles() {
  const css = getMapQuestMapInjectedCss();
  let style = document.getElementById(MAPQUEST_MAP_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = MAPQUEST_MAP_STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
