// npm run build:zones -- <towing source .jsonl>
// Writes data/public-zones.json: OSM land-use areas in the chosen districts, open by default and closed or shrunk when the
// nearest station's ridership or the nearest 2015 sidewalk LOS is crowded. Towing data only feeds the synthetic PM layer.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { aggregateTowing } from './towing.mjs';
import { collectGeocodes } from './sgis.mjs';
import { createSeoulData, boundedJson } from './seoul-data.mjs';
import { buildAreaZones, buildPenaltyZones, stationProfiles, inZoneDistricts } from './public-zones.mjs';

const [towingPath] = process.argv.slice(2);
// shortcut: only the top towing addresses are geocoded; raise TOP if hotspots outside them start to matter.
const TOP = 150;
const key = process.env.SEOUL_OPEN_DATA_KEY;
if (!towingPath || !/^[A-Za-z0-9_-]{1,128}$/.test(key ?? '')) { console.error('예: npm run build:zones -- data/towing-source-12968.jsonl (SEOUL_OPEN_DATA_KEY 필요)'); process.exit(1); }
const seoul = async (service, path) => {
  const data = await boundedJson(await fetch(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${service}/${path}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' }));
  const body = data[service]; if (body?.RESULT?.CODE !== 'INFO-000' || !Array.isArray(body.row)) throw new Error(`${service} 응답을 확인하세요.`);
  return body.row;
};
try {
  const pages = readFileSync(towingPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const { areas, districtRows } = aggregateTowing(pages.flatMap((p) => p.rows), null);
  const dates = pages.map((p) => p.date).filter(Boolean).sort();
  const period = `${dates[0]}~${dates.at(-1)}`;
  console.log(`서울 견인 ${districtRows.toLocaleString('ko-KR')}건 · 주소 ${areas.length.toLocaleString('ko-KR')}곳 · 상위 ${TOP}곳 좌표 변환`);
  const towing = await collectGeocodes({ data: { status: 'ready', areas: areas.slice(0, TOP) } });
  const { parking } = await createSeoulData({ apiKey: key })();
  if (parking.status !== 'ready' || parking.partial) throw new Error('서울시 지정 PM 주차구역 전체를 받지 못했습니다.');
  const designatedGeo = await collectGeocodes({ data: { status: 'ready', areas: parking.records.map((r) => ({ id: `pk-${r.id}`, address: `서울특별시 ${r.district} ${r.address}`, name: r.name })) }, file: 'data/parking-geocodes.json' });
  const designated = designatedGeo.areas.filter((a) => a.point);
  const sidewalk = existsSync('data/sidewalk-2015.json') ? JSON.parse(readFileSync('data/sidewalk-2015.json', 'utf8')).spots : [];
  if (!sidewalk.length) throw new Error('data/sidewalk-2015.json이 필요합니다. 먼저 npm run convert:sidewalk를 실행하세요.');
  // Latest month the ridership API already publishes (usually one or two months back).
  let month; let rides;
  for (let back = 1; back <= 3 && !rides; back++) {
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back);
    month = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    rides = await seoul('CardSubwayTime', `1/1000/${month}/`).catch(() => null);
  }
  if (!rides) throw new Error('지하철 시간대별 승하차 자료를 받지 못했습니다.');
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4)), 0)).getUTCDate();
  const stations = stationProfiles(await seoul('subwayStationMaster', '1/1000/'), rides, days);
  const zones = buildAreaZones({ areas: await osmAreas(), spots: sidewalk, stations, month });
  mkdirSync('data', { recursive: true });
  const temporary = `data/public-zones.json.${process.pid}.tmp`;
  // v7 also carries every geocoded designated zone and towing address for the map's extra layers and the synthetic fleet.
  const designatedOut = designated.filter(inZoneDistricts).map(({ id, name, address, point }) => ({ id, name, address, point }));
  const towingHotspots = towing.areas.filter((a) => a.point && inZoneDistricts(a)).map(({ id, address, district, count, point }) => ({ id, address, district, count, point }));
  const penaltyZones = buildPenaltyZones({ hotspots: towingHotspots, stations, month });
  writeFileSync(temporary, JSON.stringify({ version: 7, builtAt: new Date().toISOString(), period, month, zones, penaltyZones, designated: designatedOut, towingHotspots }, null, 2));
  renameSync(temporary, 'data/public-zones.json');
  console.log(`승하차 ${month} · 역 ${stations.length}곳 · 구역 존 ${zones.length}곳 · 페널티 구역 ${penaltyZones.length}곳 (역 자료 ${zones.filter((z) => z.station).length} · 보도 LOS 자료 ${zones.filter((z) => z.walk?.layouts.length).length})`);
} catch (error) { console.error(error.message); process.exitCode = 1; }

// OSM land-use area polygons over the chosen districts' bounding box, cached in data/osm-areas.json (delete it to refetch).
// shortcut: closed ways only; multipolygon relations (a few large complexes) are skipped until they are needed.
async function osmAreas() {
  const cache = 'data/osm-areas.json';
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')).areas;
  const body = new URLSearchParams({ data: '[out:json][timeout:170];way["landuse"~"^(residential|commercial|retail)$"](37.42,126.88,37.54,127.13);out geom tags;' });
  let data;
  for (let attempt = 0; attempt < 6 && !data; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body, headers: { 'User-Agent': 'pm-zone-build/0.1' }, signal: AbortSignal.timeout(200_000) }).catch(() => null);
    if (res?.ok) data = await res.json().catch(() => null); else await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
  }
  if (!data) throw new Error('OpenStreetMap Overpass에서 토지이용 구역을 받지 못했습니다. 잠시 뒤 다시 실행하세요.');
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const areas = (data.elements ?? []).filter((w) => w.type === 'way' && Array.isArray(w.geometry) && w.geometry.length >= 4 && w.nodes?.[0] === w.nodes?.at(-1))
    .map((w) => ({ id: w.id, landuse: w.tags?.landuse, name: w.tags?.name ?? null, ring: w.geometry.map((g) => [round(g.lat), round(g.lon)]) }));
  writeFileSync(cache, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'OpenStreetMap contributors (ODbL)', areas }));
  console.log(`OSM 토지이용 구역 ${areas.length}개`);
  return areas;
}
