// PM map pin: teardrop with a kick-scooter glyph, shared by the 2D (Leaflet) and 3D (MapLibre) maps.
// Towing risk uses the error colour AND a "!" badge, so it is not told apart by colour alone.
export function pmPin({ alert = false, picked = false, battery = null } = {}) {
  const width = picked ? 46 : 34; const height = Math.round(width * 46 / 36);
  const fill = alert ? 'var(--color-error)' : 'var(--color-accent)';
  const level = Number.isFinite(battery) ? Math.max(0, Math.min(100, battery)) : null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="${width}" height="${height}" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))">
<path d="M18 45C18 45 4 30 4 17a14 14 0 1 1 28 0c0 13-14 28-14 28z" fill="${fill}" stroke="var(--color-background-surface)" stroke-width="2"/>
<g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="21" r="2.6"/><circle cx="25" cy="21" r="2.6"/><path d="M11 21h12l-2-12M18.5 9h5"/></g>
${level === null ? '' : `<rect x="11" y="25.5" width="14" height="2.6" rx="1.3" fill="white" opacity="0.35"/><rect x="11" y="25.5" width="${(14 * level / 100).toFixed(1)}" height="2.6" rx="1.3" fill="white"/>`}
${alert ? '<circle cx="30" cy="5" r="6" fill="var(--color-error)" stroke="white" stroke-width="1.5"/><path d="M30 2v3.6M30 7.6v.1" stroke="white" stroke-width="2" stroke-linecap="round"/>' : ''}
</svg>`;
  return { svg, width, height };
}

// Parking zone sign: a "P" panel on a short post. Status is a badge shape (none / ↓ / × / ?) plus colour, never colour alone.
const BADGES = { reduced: ['var(--color-warning)', '<path d="M27 2.5v5M24.6 5.6 27 8l2.4-2.4" stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'],
  closed: ['var(--color-error)', '<path d="M25 3l4 4M29 3l-4 4" stroke="white" stroke-width="1.8" stroke-linecap="round"/>'],
  unknown: ['var(--color-text-secondary)', '<text x="27" y="8.2" font-size="7" font-weight="700" text-anchor="middle" fill="white" font-family="sans-serif">?</text>'] };
export function parkingSign({ status = null, picked = false, muted = false } = {}) {
  const width = picked ? 38 : muted ? 22 : 28; const height = Math.round(width * 40 / 30);
  const panel = muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)';
  const badge = BADGES[status];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40" width="${width}" height="${height}" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))">
<rect x="13.5" y="26" width="3" height="13" fill="${panel}"/><rect x="11" y="37" width="8" height="3" rx="1" fill="${panel}"/>
<rect x="2" y="2" width="26" height="26" rx="3" fill="${panel}" stroke="var(--color-background-surface)" stroke-width="1.5"/>
<text x="15" y="22" font-size="19" font-weight="800" text-anchor="middle" fill="var(--color-background-surface)" font-family="sans-serif">P</text>
${badge ? `<circle cx="27" cy="5" r="6" fill="${badge[0]}" stroke="white" stroke-width="1.5"/>${badge[1]}` : ''}
</svg>`;
  return { svg, width, height };
}
