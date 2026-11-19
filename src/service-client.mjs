async function fetchJSON(path, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('조회 취소', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 10_000);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('상태 조회 실패');
    return await response.json();
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}

export async function fetchServiceState(signal) {
  const data = await fetchJSON('/api/service/state', signal);
  if (!Array.isArray(data.zones) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('운영 응답 확인 필요');
  return data;
}

export async function fetchPublicData(signal) {
  const data = await fetchJSON('/api/public-data', signal);
  const validDate = (value) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const validSource = (source, pedestrian) => source && ['unconfigured', 'ready', 'error'].includes(source.status) && Array.isArray(source.records) && source.records.length <= 1000 && validDate(source.retrievedAt) && validDate(source.nextRefreshAt) && source.records.every((row) => typeof row.id === 'string' && typeof row.district === 'string' && (pedestrian ? validDate(row.observedAt) && row.observedAt !== null && Number.isSafeInteger(row.count) && row.count >= 0 && row.intervalMinutes === 10 : typeof row.name === 'string' && typeof row.address === 'string'));
  if (!Number.isFinite(Date.parse(data.generatedAt)) || !validSource(data.parking, false) || !validSource(data.pedestrians, true)) throw new Error('공공데이터 응답 확인 필요');
  return data;
}

export function decisionTtl(data) {
  if (data.expiresAt === null) return null;
  const ttl = Date.parse(data.expiresAt) - Date.parse(data.generatedAt);
  return Number.isFinite(ttl) ? Math.max(0, ttl) : 0;
}
