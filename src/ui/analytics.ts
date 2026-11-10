/**
 * Visit counting (ADR-0012): one page view per visit, sent to tp53's Google
 * Analytics property. It counts visits and where they came from (the
 * utm_ tags on launch links). It never sends anything written in the editor
 * or anything about an account, and it only runs on the live site.
 */
export const GA_ID = 'G-YQXJ75PNDQ';
export const LIVE_HOST = 'write-on.up.railway.app';

/** Whether to count this visit: only on the live site, and never when the browser asks not to be tracked. */
export function shouldCount(host: string, nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  if (host !== LIVE_HOST) return false;
  if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return false;
  return true;
}

/**
 * The address to report: the path and the utm_ tags only. Anything else in
 * the query (such as a sign-in result) is left out.
 */
export function pageLocation(href: string): string {
  const url = new URL(href);
  const keep = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (/^utm_(source|medium|campaign|content|term)$/.test(k)) keep.set(k, v);
  const q = keep.toString();
  return `${url.origin}${url.pathname}${q ? `?${q}` : ''}`;
}

export function countVisit(href: string = location.href): void {
  try {
    if (!shouldCount(location.hostname, navigator as Navigator & { globalPrivacyControl?: boolean })) return;
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag.js reads the arguments object itself, as Google's snippet does.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', GA_ID, {
      page_location: pageLocation(href),
      page_title: 'Write_On app',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.append(s);
  } catch {
    /* counting is never worth breaking the page for */
  }
}
