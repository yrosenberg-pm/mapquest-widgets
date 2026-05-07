// lib/mapquestPoiMatch.ts
// Shared ntpois filter logic for API route + client-side pool filtering (Neighborhood Score).

function haystackForQMatch(sr: any): string {
  const f = sr.fields || {};
  const name = String(f.name || sr.name || '').toLowerCase();
  const gn = String(f.group_sic_code_name || '').toLowerCase();
  const gnx = String(f.group_sic_code_name_ext || '').toLowerCase();
  return `${name} ${gn} ${gnx}`;
}

function tokenAppearsInHay(hay: string, raw: string): boolean {
  const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length < 3) return false;
  if (hay.includes(w)) return true;
  if (w.length >= 5 && w.endsWith('ing') && hay.includes(w.slice(0, -3))) return true;
  if (w.length >= 5 && w.endsWith('er') && hay.includes(w.slice(0, -2))) return true;
  if (w.length >= 6 && w.endsWith('ery') && hay.includes(w.slice(0, -3))) return true;
  return false;
}

function matchQueryText(hay: string, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  if (hay.includes(ql)) return true;
  const normWords = ql
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 3);
  if (normWords.length === 0) return true;
  if (normWords.length === 1) return tokenAppearsInHay(hay, normWords[0]);
  const hits = normWords.filter((w) => tokenAppearsInHay(hay, w));
  if (hits.length >= Math.ceil(normWords.length * 0.51)) return true;
  if (normWords.some((w) => w.length >= 6 && tokenAppearsInHay(hay, w))) return true;
  return false;
}

/** Server: raw MapQuest v2 searchResult row. */
export function searchV2MatchesFilter(sr: any, q: string | null, category: string | null): boolean {
  const f = sr.fields || {};
  const sicRaw = (category || '').trim();
  if (sicRaw.toLowerCase().startsWith('sic:')) {
    const code = sicRaw.slice(4).trim();
    if (!code) return true;
    const gc = String(f.group_sic_code || f.group_sic_code_ext || '').trim();
    return gc === code;
  }
  if (q && q.trim()) {
    if (!matchQueryText(haystackForQMatch(sr), q)) return false;
  }
  return true;
}

/**
 * True if row matches MapQuest category string (sic:, q:, plain text, or multi:...).
 * `sr` must look like `{ fields?: {...}, name?: string }`.
 */
export function matchesMqCategory(sr: any, mqCategory: string): boolean {
  const t0 = mqCategory.trim();
  if (!t0.startsWith('multi:')) {
    if (t0.startsWith('sic:')) return searchV2MatchesFilter(sr, null, t0);
    if (t0.startsWith('q:')) return searchV2MatchesFilter(sr, t0.slice(2), null);
    return searchV2MatchesFilter(sr, t0, null);
  }
  const terms = t0
    .slice(6)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return terms.some((term) => {
    if (term.startsWith('sic:')) return searchV2MatchesFilter(sr, null, term);
    if (term.startsWith('q:')) return searchV2MatchesFilter(sr, term.slice(2), null);
    return searchV2MatchesFilter(sr, term, null);
  });
}

/** Client: normalized place row from /api/mapquest?rawPool=1. */
export function matchesMqCategoryFromNormalized(
  row: { name: string; sic?: string; sicName?: string; sicNameExt?: string },
  mqCategory: string,
): boolean {
  const sr = {
    name: row.name,
    fields: {
      name: row.name,
      group_sic_code: row.sic,
      group_sic_code_ext: row.sic,
      group_sic_code_name: row.sicName,
      group_sic_code_name_ext: row.sicNameExt,
    },
  };
  return matchesMqCategory(sr, mqCategory);
}
