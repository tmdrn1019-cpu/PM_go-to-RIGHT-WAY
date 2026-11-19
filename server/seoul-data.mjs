const datasets = {
  parking: { service: 'parkingKickboard', ttl: 86_400_000, sourceUrl: 'https://data.seoul.go.kr/dataList/OA-21710/S/1/datasetView.do', name: '서울시 전동킥보드 주차구역 현황' },
  pedestrians: { service: 'sDoTPeople', ttl: 600_000, sourceUrl: 'https://data.seoul.go.kr/dataList/OA-22832/S/1/datasetView.do', name: '서울시 S-DoT 유동인구 측정 정보' },
};
const districts = { Jongno: '종로구', Jung: '중구', Yongsan: '용산구', Seongdong: '성동구', Gwangjin: '광진구', Dongdaemun: '동대문구', Jungnang: '중랑구', Seongbuk: '성북구', Gangbuk: '강북구', Dobong: '도봉구', Nowon: '노원구', Eunpyeong: '은평구', Seodaemun: '서대문구', Mapo: '마포구', Yangcheon: '양천구', Gangseo: '강서구', Guro: '구로구', Geumcheon: '금천구', Yeongdeungpo: '영등포구', Dongjak: '동작구', Gwanak: '관악구', Seocho: '서초구', Gangnam: '강남구', Songpa: '송파구', Gangdong: '강동구' };
const check = (valid) => { if (!valid) throw new TypeError('공공데이터 형식을 확인하세요.'); };
function text(value, max = 200, optional = false) {
  check(typeof value === 'string' && value.length <= max && (optional || value.trim().length));
  return value.trim();
}
function count(value) {
  check(typeof value === 'number' || (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)));
  const number = Number(value); check(Number.isSafeInteger(number) && number >= 0); return number;
}
function koreaTime(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[_ T]\d{2}:\d{2}:\d{2}$/.test(value));
  const local = value.replace(/[_ ]/, 'T');
  const time = Date.parse(`${local}+09:00`);
  check(Number.isFinite(time) && new Date(time + 9 * 3_600_000).toISOString().slice(0, 19) === local);
  return new Date(time).toISOString();
}

export function normalizeParking(rows) {
  const ids = new Set();
  return rows.map((row) => {
    const id = String(count(row.SN)); check(id !== '0' && !ids.has(id)); ids.add(id);
    const district = text(row.SGG_NM, 50); const detail = text(row.DTL_PSTN, 300, true);
    return { id, district, address: text(row.PSTN), detail, name: detail || `${district} 주차구역 ${id}`, hasStand: row.STAND_YN === 'Y' ? true : row.STAND_YN === 'N' ? false : null };
  });
}

export function normalizePedestrians(rows) {
  const latest = new Map();
  for (const row of rows) {
    const id = text(row.SERIAL, 64); const district = text(row.AUTONOMOUS_DISTRICT, 80);
    const districtKey = district.replace(/-gu$/i, '');
    const record = { id, district: Object.hasOwn(districts, districtKey) ? districts[districtKey] : district, area: text(row.ADMINISTRATIVE_DISTRICT, 100), observedAt: koreaTime(row.SENSING_TIME), count: count(row.VISITOR_COUNT), intervalMinutes: 10 };
    if (!latest.has(id) || record.observedAt > latest.get(id).observedAt) latest.set(id, record);
  }
  return [...latest.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id));
}

async function boundedJson(response) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
    await response.body?.cancel().catch(() => {});
    check(false);
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let bytes = 0; let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; check(bytes <= 2 * 1024 * 1024);
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createSeoulData({ apiKey = '', fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const configured = typeof apiKey === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(apiKey);
  const cache = new Map(); const pending = new Map();
  const empty = (id, status) => ({ status, sourceName: datasets[id].name, sourceUrl: datasets[id].sourceUrl, records: [], retrievedAt: null, lastSuccessAt: null, nextRefreshAt: null, totalRows: null, fetchedRows: 0, partial: false });
  async function load(id) {
    if (!configured) return empty(id, 'unconfigured');
    const previous = cache.get(id); const time = now();
    if (previous && time < Date.parse(previous.nextRefreshAt)) return previous;
    if (pending.has(id)) return pending.get(id);
    const job = (async () => {
      const { service, ttl } = datasets[id];
      try {
        // shortcut: first 1,000 rows only; use a shared paginated collector when full sensor coverage is required.
        const response = await fetchImpl(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${service}/1/1000/`, { signal: AbortSignal.timeout(5_000), redirect: 'error', headers: { Accept: 'application/json' } });
        const data = await boundedJson(response); const payload = data[service];
        const code = payload?.RESULT?.CODE ?? data.RESULT?.CODE;
        check(code === 'INFO-000' || code === 'INFO-200');
        const rows = code === 'INFO-200' ? [] : payload?.row;
        const totalRows = code === 'INFO-200' ? 0 : count(payload?.list_total_count);
        check(Array.isArray(rows) && rows.length <= 1000 && totalRows >= rows.length && (totalRows === 0 || rows.length > 0));
        const records = id === 'parking' ? normalizeParking(rows) : normalizePedestrians(rows);
        const received = now(); check(records.every((row) => !row.observedAt || Date.parse(row.observedAt) <= received));
        const retrievedAt = new Date(received).toISOString();
        const state = { ...empty(id, 'ready'), records, retrievedAt, lastSuccessAt: retrievedAt, nextRefreshAt: new Date(received + ttl).toISOString(), totalRows, fetchedRows: rows.length, partial: totalRows > rows.length };
        cache.set(id, state); return state;
      } catch {
        const state = { ...empty(id, 'error'), lastSuccessAt: previous?.lastSuccessAt ?? null, nextRefreshAt: new Date(now() + 60_000).toISOString() };
        cache.set(id, state); return state;
      }
    })();
    pending.set(id, job);
    try { return await job; } finally { pending.delete(id); }
  }
  return async () => {
    const [parking, pedestrians] = await Promise.all([load('parking'), load('pedestrians')]);
    const time = now();
    return { generatedAt: new Date(time).toISOString(), refreshIntervalMs: 60_000, parking, pedestrians: { ...pedestrians, records: pedestrians.records.map((row) => ({ ...row, delayed: time - Date.parse(row.observedAt) >= 30 * 60_000 })) } };
  };
}
