# Map Styles (Maputnik exports)

Drop MapLibre style JSON files here. The Map Styles widget loads them via `STYLE_BASE_URL` (`/styles/`).

## Installed file styles

| File | Style id (in `lib/mapStyles/config.ts`) |
|------|------------------------------------------|
| `graphite.json` | `graphite` |
| `outdoors.json` | `outdoors` |
| `logistics.json` | `logistics` |

**MapQuest Light** and **MapQuest Dark** are loaded from the hosted Vector Maps API (`styles/v1/light|dark`), not from this folder.

## Add a new style

1. Copy/sanitize your export to `public/styles/<id>.json` (tile URLs without embedded keys; the widget adds the key via `transformRequest`).
2. Add an entry to `MAP_STYLE_ENTRIES` in `lib/mapStyles/config.ts` with `styleRef: { kind: 'file', fileName: '<id>.json' }`.

Do not commit API keys into style files.

Optional thumbnails: `public/styles/thumbnails/<id>.png` (set `thumbnail` on the config entry).