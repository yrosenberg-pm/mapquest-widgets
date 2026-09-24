export const MAPQUEST_MAP_STYLE_ID = 'mapquest-modern-styles-v6';

export function getMapQuestMapInjectedCss(): string {
  return `
      .maplibregl-map {
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
      .modern-marker:focus-within .marker-tooltip-popup {
        opacity: 1;
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
