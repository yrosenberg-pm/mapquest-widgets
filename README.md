# MapQuest Widgets

A Next.js-based collection of embeddable widgets.

## Live Traffic Widget

### Script embed (single file)

The repo ships a single-file embed script at `public/widgets/traffic.js` that exposes `window.MapQuestTraffic.init()`.

Example (local dev):

```html
<div id="mq-traffic-widget" style="width: 420px"></div>
<script src="http://localhost:3000/widgets/traffic.js"></script>
<script>
  MapQuestTraffic.init({
    container: "#mq-traffic-widget",
    apiKey: "CUSTOMER_API_KEY",
    center: { lat: 34.0522, lng: -118.2437 },
    title: "Downtown Los Angeles",
    theme: "dark",
    zoom: 11,
    refreshInterval: 120,
    // optional: width, height, incidentFilters, autoResize
  });
<\/script>
```

### Iframe endpoint (what the script uses)

The widget is rendered by the Next route:

- `GET /embed/traffic?apiKey=...&centerLat=...&centerLng=...`

## Mapillary Street View showcase (demo widget)

Internal sales/marketing embed that combines **MapQuest** (map, autosuggest, geocoding) with **Mapillary** street view (`mapillary-js`).

- **Demo page:** [http://localhost:3000/embed/streetview-showcase](http://localhost:3000/embed/streetview-showcase) (optional: `?apiKey=...&darkMode=1&accentColor=...`)
- **Component:** `MapillaryStreetViewShowcase` from `@/components/widgets` (see `MapillaryStreetViewShowcase.tsx`)

**Environment variables**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_MAPQUEST_API_KEY` | Map tiles + `/api/mapquest` (autosuggest, geocoding) |
| `NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN` | Mapillary Graph API + `mapillary-js` viewer in the **browser** |

Copy `.env.example` to `.env.local` and set both. Without the Mapillary token, the right-hand panel shows a configuration message.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.
