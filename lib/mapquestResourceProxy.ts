/** When true, map tiles/styles load via `/api/mapquest/resource` (key stays server-side). */
export function mapQuestMapsProxyEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_MAPQUEST_PROXY_MAPS?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

export function mapQuestMapsReady(apiKey: string | undefined | null): boolean {
  return Boolean(apiKey?.trim()) || mapQuestMapsProxyEnabled();
}

const MAPQUEST_HOST_PATTERNS = [
  /^www\.mapquestapi\.com$/i,
  /^mapquestapi\.com$/i,
  /^tiles\.mapquest\.com$/i,
  /^[a-z0-9-]+\.tiles\.mapquest\.com$/i,
  /^[a-z0-9-]+\.aws\.mapquest\.com$/i,
];

export function isMapQuestUpstreamResourceUrl(url: string): boolean {
  if (!url || url.startsWith('/api/mapquest/resource')) return false;
  try {
    const u = new URL(url, 'https://placeholder.local');
    if (u.protocol !== 'https:') return false;
    return MAPQUEST_HOST_PATTERNS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export function stripMapQuestKeyFromUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('key');
  return u.toString();
}

export function mapQuestResourceProxyUrl(targetUrl: string, clientApiKey?: string | null): string {
  const stripped = isMapQuestUpstreamResourceUrl(targetUrl)
    ? stripMapQuestKeyFromUrl(targetUrl)
    : targetUrl;
  const params = new URLSearchParams({ target: stripped });
  const key = clientApiKey?.trim();
  if (key && key !== 'YOUR_MAPQUEST_API_KEY') {
    params.set('apiKey', key);
  }
  return `/api/mapquest/resource?${params.toString()}`;
}

export function assertMapQuestProxyTarget(target: string): URL {
  const u = new URL(target);
  if (u.protocol !== 'https:') {
    throw new Error('Only HTTPS MapQuest URLs are allowed');
  }
  if (!MAPQUEST_HOST_PATTERNS.some((re) => re.test(u.hostname))) {
    throw new Error('URL host is not an allowed MapQuest resource');
  }
  return u;
}