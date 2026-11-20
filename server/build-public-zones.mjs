// npm run build:zones -- <towing source .jsonl>
// Writes data/public-zones.json: Seoul-designated PM parking zones next to the busiest 2025 towing hotspots,
// judged by the nearest subway station's hourly ridership.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { aggregateTowing } from './towing.mjs';
import { collectGeocodes } from './sgis.mjs';
import { createSeoulData, boundedJson } from './seoul-data.mjs';
import { stationProfiles, buildHotspotZones } from './public-zones.mjs';

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
  // Optional evidence from npm run convert:sidewalk; zones are still built without it.
  const sidewalk = existsSync('data/sidewalk-2015.json') ? JSON.parse(readFileSync('data/sidewalk-2015.json', 'utf8')).spots : [];
  if (!sidewalk.length) console.warn('data/sidewalk-2015.json이 없어 보도 실측 근거 없이 만듭니다.');
  const zones = buildHotspotZones({ areas: towing.areas, designated, stations, period, month, sidewalk });
  mkdirSync('data', { recursive: true });
  const temporary = `data/public-zones.json.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: 4, builtAt: new Date().toISOString(), period, month, zones }, null, 2));
  renameSync(temporary, 'data/public-zones.json');
  if (zones[0]) console.log(`서울 기준선 (역 ${zones[0].thresholds.stations}곳 · 역·시간 ${zones[0].thresholds.stationHours}개): 폐쇄 ${zones[0].thresholds.close}명 이상 · 축소 ${zones[0].thresholds.reduce}명 이상`);
  console.log(`지정 주차구역 ${designated.length}/${parking.records.length}곳 좌표 · 역 ${stations.length}곳 · 존 ${zones.length}곳`);
  for (const z of zones) console.log(`${z.name} (${z.address}) · 견인 ${z.basis.towingCount}건 · 다발 지점 ${z.basis.hotspotDistanceM}m · ${z.basis.stationName}역 ${z.basis.stationDistanceM}m · 2015 보도 ${z.basis.sidewalk ? `${z.basis.sidewalk.distanceM}m 폭 ${z.basis.sidewalk.widthM}m LOS ${z.basis.sidewalk.los}/${z.basis.sidewalk.parkedLos ?? '-'}` : '없음'}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
