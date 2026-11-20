import { distanceM } from '../server/engine.mjs';

// Middle of the map strip left between top overlays (topInset px) and the bottom panel.
export function visibleMapCenterY(height, bottomFraction, topInset = 0) { return (topInset + height * (1 - bottomFraction)) / 2; }

export function filterZones(zones, { query = '', vehicleType = 'all', statuses, bounds, origin } = {}) {
  const search = query.trim().toLocaleLowerCase('ko-KR');
  const result = zones.filter((zone) => {
    const [lat, lng] = zone.point;
    return `${zone.name} ${zone.address}`.toLocaleLowerCase('ko-KR').includes(search) &&
      (vehicleType === 'all' || zone.vehicleTypes.includes(vehicleType)) &&
      (!statuses || statuses.includes(zone.status)) &&
      (!bounds || (lat >= bounds[0] && lat <= bounds[2] && (bounds[1] <= bounds[3] ? lng >= bounds[1] && lng <= bounds[3] : lng >= bounds[1] || lng <= bounds[3])));
  });
  if (origin) result.sort((a, b) => distanceM(origin, a.point) - distanceM(origin, b.point));
  return result;
}
