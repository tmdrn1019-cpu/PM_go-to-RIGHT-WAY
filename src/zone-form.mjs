// Converts the operator form (plain strings) into a feed zone; the server re-validates the whole feed.
const fail = (message) => { throw new Error(message); };
const number = (value, label) => { const n = Number(String(value).trim()); if (String(value).trim() === '' || !Number.isFinite(n)) fail(`${label}을(를) 숫자로 입력하세요.`); return n; };
const lines = (text) => String(text).split('\n').map((line) => line.trim()).filter(Boolean);
const pair = (line, label) => { const parts = line.split(',').map((v) => v.trim()); if (parts.length !== 2) fail(`${label}: "${line}"은 쉼표로 두 값을 적어야 합니다.`); return parts.map((v) => number(v, label)); };

export function koreaInput(ms) { return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16); }
function koreaTime(text, label) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(text).trim())) fail(`${label}은(는) YYYY-MM-DDTHH:mm 형식(한국 시각)으로 입력하세요.`);
  const ms = Date.parse(`${String(text).trim()}:00+09:00`); if (!Number.isFinite(ms)) fail(`${label}을(를) 확인하세요.`); return ms;
}
const until = (ms, minutes, label) => { const m = number(minutes, label); if (m <= 0 || m > 1440) fail(`${label}은(는) 1~1440분입니다.`); return new Date(ms + m * 60_000).toISOString(); };

export function buildZone(form) {
  const boundary = lines(form.boundary).map((line) => pair(line, '경계 좌표'));
  if (boundary.length < 3) fail('경계 좌표는 3점 이상 입력하세요.');
  const [first] = boundary; const last = boundary.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) boundary.push([...first]);
  const layouts = lines(form.layouts).map((line) => { const [capacity, effectiveWidthM] = pair(line, '배치'); return { capacity, effectiveWidthM }; });
  if (!layouts.length) fail('측정한 배치를 1개 이상 입력하세요.');
  const windows = lines(form.windows).map((line) => {
    const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(line); if (!match) fail(`운영시간 "${line}"은 HH:mm-HH:mm 형식이어야 합니다.`);
    return { start: match[1], end: match[2] };
  });
  const vehicleTypes = [form.scooter && 'scooter', form.ebike && 'ebike'].filter(Boolean);
  if (!vehicleTypes.length) fail('허용 기기를 1개 이상 선택하세요.');
  const observedAt = koreaTime(form.observedAt, '보행량 관측 시각');
  const inventoryAt = koreaTime(form.inventoryAt, '주차 현황 확인 시각');
  const zone = {
    id: String(form.id).trim(), name: String(form.name).trim(), address: String(form.address).trim(),
    point: [number(form.lat, '위도'), number(form.lng, '경도')], boundary, vehicleTypes,
    parkingAuthorized: form.parkingAuthorized === true, capacityAppliesToAllTypes: vehicleTypes.length > 1 && form.capacityAppliesToAllTypes === true,
    layouts, windows,
    observation: { pedestrianCount15Min: number(form.count15, '15분 보행량'), observedAt: new Date(observedAt).toISOString(), validUntil: until(observedAt, form.observationMinutes, '보행량 유효 시간'), source: String(form.observationSource).trim() },
    inventory: { parked: number(form.parked, '주차 대수'), reserved: number(form.reserved, '예약 대수'), observedAt: new Date(inventoryAt).toISOString(), validUntil: until(inventoryAt, form.inventoryMinutes, '주차 현황 유효 시간') },
  };
  if (String(form.preCloseMinutes).trim() || String(form.preCloseCapacity).trim()) zone.preClose = { minutes: number(form.preCloseMinutes, '폐쇄 예고 시간'), capacity: number(form.preCloseCapacity, '폐쇄 예고 정원') };
  return zone;
}

export function zoneToForm(zone) {
  const ring = zone.boundary.slice(0, -1);
  return {
    id: zone.id, name: zone.name, address: zone.address, lat: String(zone.point[0]), lng: String(zone.point[1]),
    boundary: ring.map((p) => p.join(', ')).join('\n'), scooter: zone.vehicleTypes.includes('scooter'), ebike: zone.vehicleTypes.includes('ebike'),
    parkingAuthorized: zone.parkingAuthorized === true, capacityAppliesToAllTypes: zone.capacityAppliesToAllTypes === true,
    layouts: zone.layouts.map((l) => `${l.capacity}, ${l.effectiveWidthM}`).join('\n'), windows: zone.windows.map((w) => `${w.start}-${w.end}`).join('\n'),
    preCloseMinutes: zone.preClose ? String(zone.preClose.minutes) : '', preCloseCapacity: zone.preClose ? String(zone.preClose.capacity) : '',
    count15: String(zone.observation?.pedestrianCount15Min ?? ''), observedAt: koreaInput(Date.now()), observationMinutes: '15', observationSource: zone.observation?.source ?? '',
    parked: String(zone.inventory?.parked ?? ''), reserved: String(zone.inventory?.reserved ?? '0'), inventoryAt: koreaInput(Date.now()), inventoryMinutes: '15',
  };
}
