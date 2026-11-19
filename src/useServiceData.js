import { useCallback, useEffect, useState } from 'react';
import { fetchServiceState, decisionTtl } from './service-client.mjs';

export default function useServiceData() {
  const [data, setData] = useState(null);
  const [connection, setConnection] = useState('loading');
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let stopped = false; let timer; let expiry; let controller;
    setConnection('loading');
    const read = async () => {
      controller = new AbortController();
      const started = performance.now();
      try {
        const next = await fetchServiceState(controller.signal);
        if (!stopped) {
          clearTimeout(expiry);
          const ttl = decisionTtl(next);
          const remaining = ttl === null ? null : ttl - (performance.now() - started);
          setData(next); setConnection(remaining !== null && remaining <= 0 ? 'stale' : 'online');
          if (remaining !== null && remaining > 0) expiry = setTimeout(() => setConnection('stale'), remaining);
        }
      } catch { if (!stopped) setConnection('offline'); }
      finally { if (!stopped) timer = setTimeout(readIfVisible, 15_000); }
    };
    const readIfVisible = () => { clearTimeout(timer); if (document.hidden) { timer = setTimeout(readIfVisible, 15_000); return; } read(); };
    const visible = () => { if (!document.hidden) { setConnection('loading'); refresh(); } };
    read(); document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; clearTimeout(timer); clearTimeout(expiry); controller?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [version]);
  return { data, connection, refresh };
}
