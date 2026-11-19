export async function fetchServiceState(signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('조회 취소', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 10_000);
  try {
    const response = await fetch('/api/service/state', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('상태 조회 실패');
    const data = await response.json();
    if (!Array.isArray(data.zones) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('운영 응답 확인 필요');
    return data;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}

export function decisionTtl(data) {
  if (data.expiresAt === null) return null;
  const ttl = Date.parse(data.expiresAt) - Date.parse(data.generatedAt);
  return Number.isFinite(ttl) ? Math.max(0, ttl) : 0;
}
