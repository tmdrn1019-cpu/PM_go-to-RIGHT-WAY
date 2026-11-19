// Seoul-designated PM parking zones in the pilot district, with SGIS points for prefilling operator registration.
// shortcut: 관악구 only (pilot area); widen the district filter when other districts are onboarded.
export function createOfficialZones({ readParking, geocode }) {
  const points = new Map();
  return async () => {
    const parking = await readParking();
    if (parking.status !== 'ready') return { status: parking.status, sourceUrl: parking.sourceUrl, zones: [] };
    const zones = [];
    for (const row of parking.records.filter((r) => r.district === '관악구')) {
      const address = `서울특별시 관악구 ${row.address}`;
      if (!points.has(address)) {
        // Only exact SGIS matches are cached; failures are retried on the next request.
        const point = await geocode(address).catch(() => null);
        if (point) points.set(address, point);
      }
      zones.push({ id: row.id, name: row.name, address, detail: row.detail, hasStand: row.hasStand, point: points.get(address) ?? null });
    }
    return { status: 'ready', sourceUrl: parking.sourceUrl, retrievedAt: parking.retrievedAt, zones };
  };
}
