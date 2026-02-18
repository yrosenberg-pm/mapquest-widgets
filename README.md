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

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.
