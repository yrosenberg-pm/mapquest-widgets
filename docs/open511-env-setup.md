# Open511 (511.org) env setup

To enable the **511 Road closures & conditions** layer (Route Weather Alerts), add the following to your local `.env.local`:

```bash
# Open511 (511.org) Traffic Events
OPEN511_API_KEY=PASTE_YOUR_511_KEY_HERE

# Optional override (defaults to https://api.511.org)
OPEN511_BASE_URL=https://api.511.org

# If your 511 access is split by region, configure a region → base URL map (JSON).
# Region routing (recommended)
#
# For multi-region 511 setups, configure auto-routing so widgets don't have to specify a region.
# The proxy will choose a backend based on the *bbox center* being requested.
#
# Format:
# OPEN511_REGION_RULES_JSON='[
#   {"id":"bayarea","baseUrl":"https://api.511.org","bbox":{"west":-123.2,"south":36.6,"east":-121.0,"north":38.9}},
#   {"id":"la","baseUrl":"https://api.511la.org","bbox":{"west":-119.2,"south":33.2,"east":-116.6,"north":34.9}}
# ]'
#
# Optional per-region filters (if your deployment supports them):
#   - jurisdiction
#   - jurisdiction_url
#
# Example:
# {"id":"la","baseUrl":"https://api.511la.org","bbox":{...},"jurisdiction":"lacounty"}
#
# Notes:
# - If you *also* set OPEN511_REGION_BASE_URLS with keys like "la" / "bayarea", the proxy will
#   auto-derive rough bounding boxes for common demo regions when OPEN511_REGION_RULES_JSON is not set.
#   For anything real, prefer OPEN511_REGION_RULES_JSON.
# Example:
# Optional legacy map (still supported):
# OPEN511_REGION_BASE_URLS='{"bayarea":"https://api.511.org","la":"https://api.511la.org"}'

# Optional client-side default region/jurisdiction (used by widgets when not passed as props)
# Widgets no longer need to set a region; the proxy can auto-route by bbox.
# If you want to force a region for a specific embed, you can still pass `region=...` to `/api/open511`.
NEXT_PUBLIC_OPEN511_REGION=
NEXT_PUBLIC_OPEN511_JURISDICTION=
```

Spec reference: `https://511.org/sites/default/files/pdfs/Open_511_Data_Exchange_Specification_v1.0_Traffic.pdf`

