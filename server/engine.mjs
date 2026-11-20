export const LOS_REFERENCE = {
  name: '2022 보행업무편람 수록 보도 LOS · 적용성 검토 필요',
  source: 'https://clik.nanet.go.kr/clikr-collection/policyinfo/19/665/2025/CLIKC29563816565329919_attach_1.pdf',
  bounds: [20, 32, 46, 70, 106],
  unit: '명/분/m',
};

// LOS letter for a flow in 명/분/m; shared by the zone engine and the sidewalk evidence.
export const losGrade = (flow, profile = LOS_REFERENCE) => { const grade = profile.bounds.findIndex((bound) => flow <= bound + 1e-9); return 'ABCDEF'[grade < 0 ? 5 : grade]; };

const MINUTE = 60_000;
const DAY = 1440 * MINUTE;
const OFFSET = 540 * MINUTE;

export function koreaDay(at) {
  return new Date(new Date(at).getTime() + OFFSET).toISOString().slice(0, 10);
}

export function operatingIntervals(windows, at) {
  const time = new Date(at).getTime();
  const local = new Date(time + OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  const intervals = [];
  for (let offset = -1; offset <= 8; offset++) {
    const startDay = midnight + offset * DAY;
    const weekday = new Date(startDay + OFFSET).getUTCDay();
    for (const window of windows) {
      if (window.days && !window.days.includes(weekday)) continue;
      const toMinute = (text) => { const [h, m] = text.split(':').map(Number); return h * 60 + m; };
      const startMinute = toMinute(window.start);
      const endMinute = toMinute(window.end);
      const start = startDay + startMinute * MINUTE;
      const end = startDay + (endMinute <= startMinute ? endMinute + 1440 : endMinute) * MINUTE;
      intervals.push({ start, end });
    }
  }
  const merged = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    if (merged.length && interval.start <= merged.at(-1).end) merged.at(-1).end = Math.max(merged.at(-1).end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function intervalAt(windows, time) {
  if (!windows?.length) return { end: null };
  return operatingIntervals(windows, time).find((interval) => time >= interval.start && time < interval.end) ?? null;
}

export function nextScheduledChange(zone, at) {
  if (!zone.windows.length) return null;
  const now = new Date(at).getTime();
  const events = operatingIntervals(zone.windows, at).flatMap(({ start, end }) => [
    { time: start, type: 'open' },
    ...(zone.preClose && zone.preClose.minutes > 0 ? [{ time: Math.max(start, end - zone.preClose.minutes * MINUTE), type: 'reduce' }] : []),
    { time: end, type: 'close' },
  ]).filter((event) => event.time > now && event.time <= now + 7 * DAY).sort((a, b) => a.time - b.time);
  return events.length ? { at: new Date(events[0].time).toISOString(), type: events[0].type } : null;
}

export function evaluateZone(zone, at, profile) {
  const time = new Date(at).getTime();
  const result = { status: 'unknown', capacity: 0, los: null, flow: null, selectedFlow: null, effectiveWidthM: null, nextClose: null, reason: '입력 자료 또는 LOS 기준을 확인할 수 없습니다.' };
  const hour = new Date(time + OFFSET).getUTCHours();
  const count = zone.hourlyCounts?.[hour] ?? zone.pedestrianCount15Min;
  if (!Number.isFinite(time) || !Number.isFinite(count) || count < 0 ||
      profile?.unit !== '명/분/m' || !Array.isArray(profile?.bounds) || profile.bounds.length !== 5 ||
      profile.bounds.some((n, i, values) => !Number.isFinite(n) || n <= (i ? values[i - 1] : 0)) ||
      !zone.layouts?.length || zone.layouts.some((layout) => !Number.isInteger(layout.capacity) || layout.capacity < 1 || !Number.isFinite(layout.effectiveWidthM) || layout.effectiveWidthM <= 0)) return result;

  result.currentPedestrianCount15Min = count;
  const interval = intervalAt(zone.windows, time);
  if (!interval) return { ...result, status: 'closed', reason: '운영시간 외입니다.' };
  result.nextClose = interval.end ? new Date(interval.end).toISOString() : null;
  const layouts = [...zone.layouts].filter((layout) => layout.effectiveWidthM >= 2).sort((a, b) => a.capacity - b.capacity);
  if (!layouts.length) return { ...result, status: 'closed', reason: '주차 후 유효폭 2m를 확보하는 배치가 없습니다.' };
  const base = layouts.at(-1);
  const flow = count / 15 / base.effectiveWidthM;
  result.flow = flow;
  result.los = losGrade(flow, profile);
  const grade = 'ABCDEF'.indexOf(result.los);
  if (grade >= 4) return { ...result, status: 'closed', reason: `${result.los}등급: 혼잡 시간 반납을 제한합니다.` };

  let selected = base;
  result.status = 'open';
  result.reason = `${result.los}등급: 주차 후 유효폭을 확보합니다.`;
  if (grade === 3) {
    selected = layouts.filter((layout) => layout.capacity < base.capacity && count / 15 / layout.effectiveWidthM <= profile.bounds[3]).at(-1);
    result.status = selected ? 'reduced' : 'closed';
    result.reason = 'D등급: 더 적은 기기를 놓는 배치로 수용량을 줄입니다.';
  }
  if (selected && zone.preClose && interval.end && interval.end - time <= zone.preClose.minutes * MINUTE) {
    const limit = Math.min(selected.capacity, zone.preClose.capacity);
    selected = layouts.filter((layout) => layout.capacity <= limit && count / 15 / layout.effectiveWidthM <= profile.bounds[3]).at(-1);
    result.status = selected ? 'reduced' : 'closed';
    result.reason = selected ? '폐쇄 예고: 잔류 기기를 줄이기 위해 신규 반납 정원을 조절합니다.' : '폐쇄 예고 배치에서 보행 기준을 확보할 수 없어 반납을 닫습니다.';
  }
  return { ...result, capacity: selected?.capacity ?? 0, effectiveWidthM: selected?.effectiveWidthM ?? null, selectedFlow: selected ? count / 15 / selected.effectiveWidthM : null };
}

export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const lat = (b[0] - a[0]) * rad;
  const lng = (b[1] - a[1]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(lng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Evenly spaced points from a straight two-point route's start to its end (the last one is the end itself).
export function walkSteps([from, to], count) {
  return Array.from({ length: count }, (_, i) => i === count - 1 ? to : [from[0] + (to[0] - from[0]) * (i + 1) / count, from[1] + (to[1] - from[1]) * (i + 1) / count]);
}

export function distanceToRouteM(point, route) {
  if (route.length < 2) return route.length ? distanceM(point, route[0]) : Infinity;
  const scaleX = 111_195 * Math.cos(point[0] * Math.PI / 180);
  const scaleY = 111_195;
  const project = ([lat, lng]) => [(lng - point[1]) * scaleX, (lat - point[0]) * scaleY];
  return Math.min(...route.slice(1).map((end, index) => {
    const a = project(route[index]); const b = project(end);
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length)) : 0;
    return Math.hypot(a[0] + t * dx, a[1] + t * dy);
  }));
}

// User policy (2026-11-20): public data never reaches LOS D, so hotspot zones compare this hour's station ridership
// with Seoul-wide station-hour cut-offs (zone.thresholds, built from every station's hourly profile) and say which numbers decided.
export const RELATIVE_POLICY = { closeShare: 0.05, reduceShare: 0.15 };
// Nearest-rank cut-off: the value reached by the busiest share of a descending list.
export const shareCutoff = (descending, share) => descending[Math.max(0, Math.ceil(descending.length * share) - 1)];
export function evaluateRelative(zone, at) {
  const time = new Date(at).getTime();
  const counts = Object.values(zone.hourlyCounts ?? {}).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => b - a);
  const hour = new Date(time + OFFSET).getUTCHours();
  const count = zone.hourlyCounts?.[hour];
  const capacities = (zone.layouts ?? []).map((l) => l.capacity).filter((c) => Number.isInteger(c) && c > 0).sort((a, b) => b - a);
  const t = zone.thresholds;
  const base = { status: 'unknown', capacity: 0, los: null, flow: null, effectiveWidthM: null, nextClose: null, crowdRank: null, currentPedestrianCount15Min: Number.isFinite(count) ? count : null, reason: '이 시간대 보행량 자료나 서울 기준선이 없어 판정하지 않습니다.' };
  const thresholdsOk = Number.isFinite(t?.close) && Number.isFinite(t?.reduce) && t.reduce > 0 && t.close >= t.reduce && t.closeShare > 0 && t.reduceShare >= t.closeShare;
  if (!Number.isFinite(time) || !Number.isFinite(count) || count < 0 || counts.length < 10 || !capacities.length || !thresholdsOk) return base;
  const n = (v) => v.toLocaleString('ko-KR');
  const pct = (share) => Math.round(share * 1000) / 10;
  const crowdRank = counts.indexOf(count) + 1; // ties share the busier rank
  const now = `이 시간 승하차는 ${n(count)}명(일평균, 이 장소 하루 중 ${crowdRank}번째)으로`;
  if (count >= t.close) return { ...base, crowdRank, status: 'closed', reason: `${now} 서울 역·시간 상위 ${pct(t.closeShare)}% 기준 ${n(t.close)}명 이상이라 반납을 닫습니다.` };
  if (count >= t.reduce && capacities.length > 1) return { ...base, crowdRank, status: 'reduced', capacity: capacities.at(-1), reason: `${now} 서울 역·시간 상위 ${pct(t.reduceShare)}% 기준 ${n(t.reduce)}명 이상이라 수용 대수를 ${capacities.at(-1)}대로 줄입니다. 폐쇄 기준은 ${n(t.close)}명입니다.` };
  return { ...base, crowdRank, status: 'open', capacity: capacities[0], reason: count >= t.reduce ? `${now} 축소 기준 ${n(t.reduce)}명 이상이지만 줄일 배치가 없어 개방합니다.` : `${now} 서울 역·시간 상위 ${pct(t.reduceShare)}% 기준 ${n(t.reduce)}명보다 적어 개방합니다.` };
}
