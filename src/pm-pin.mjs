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
