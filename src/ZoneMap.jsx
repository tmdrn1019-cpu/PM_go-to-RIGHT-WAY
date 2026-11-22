import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
// Leaflet requires its own tile-positioning and map-control CSS.
import 'leaflet/dist/leaflet.css';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { visibleMapCenterY } from './zone-search.mjs';
import { pmPin, parkingSign } from './pm-pin.mjs';

const names = { open: '주차존 개방', reduced: '일부 개방', closed: '페널티 유지', unknown: '확인 중' };
// Web demo area: 강남구 (user request 2026-11-22).
const pilotCenter = [37.5045, 127.0400];

export default function ZoneMap({ zones, vehicles = [], areas = [], routes = [], designated = [], selectedVehicleId = null, onVehicleSelect, towingAreas, selectedId, onSelect, onBoundsChange, focus, position, bottomFraction = 0, topInset = 0, fitMaxZoom = 17 }) {
  const element = useRef(null); const map = useRef(null); const layer = useRef(null);
  const towingLayer = useRef(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    const instance = L.map(element.current, { scrollWheelZoom: true, attributionControl: false, zoomControl: false }).setView(pilotCenter, 15);
    map.current = instance;
    L.control.attribution({ position: 'topright', prefix: false }).addTo(instance);
    L.control.zoom({ position: 'topright', zoomInTitle: '지도 확대', zoomOutTitle: '지도 축소' }).addTo(instance);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(instance);
    tiles.on('tileerror', () => setTileError(true)); tiles.on('tileload', () => setTileError(false));
    layer.current = L.layerGroup().addTo(instance);
    towingLayer.current = L.layerGroup().addTo(instance);
    const report = () => { const bounds = instance.getBounds(); onBoundsChange([bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]); };
    instance.on('moveend', report); report();
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, [onBoundsChange]);
  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const css = getComputedStyle(element.current);
    // Theme tokens are light-dark(...), which canvas cannot parse: let the browser resolve each one to rgb on a probe element.
    const probe = document.createElement('i'); element.current.appendChild(probe);
    const color = (token) => { probe.style.color = `var(${token}, currentColor)`; return getComputedStyle(probe).color || css.color; };
    const palette = { open: color('--color-success'), reduced: color('--color-warning'), closed: color('--color-error'), unknown: color('--color-text-secondary') };
    // Towing areas as shaded red areas (where not to leave a PM), drawn under the zones and mission paths.
    for (const area of areas) {
      const label = document.createElement('strong'); label.textContent = area.label;
      L.circle(area.point, { radius: area.radiusM, color: color('--color-error'), weight: 1.5, opacity: 0.8, fillColor: color('--color-error'), fillOpacity: 0.25 }).addTo(layer.current).bindTooltip(label);
    }
    for (const route of routes) L.polyline(route, { color: color('--color-accent'), weight: 3, dashArray: '6 6', interactive: false }).addTo(layer.current);
    const sign = (point, options, title, zIndexOffset) => { const s = parkingSign(options);
      return L.marker(point, { icon: L.divIcon({ html: s.svg, className: '', iconSize: [s.width, s.height], iconAnchor: [s.width / 2, s.height], tooltipAnchor: [0, -s.height] }), title, zIndexOffset }).addTo(layer.current); };
    // Designated zones without an operating verdict: a smaller grey P sign with no status badge.
    for (const zone of designated) {
      const label = document.createElement('strong'); label.textContent = `${zone.name} · 서울시 지정 구역 · 운영 상태 없음`;
      sign(zone.point, { muted: true }, label.textContent, -200).bindTooltip(label);
    }
    // Area zones can number in the thousands: polygons go on one canvas, and only the selected zone gets a P sign.
    // Penalty cells are towing-risk areas, so they are always red (user request): solid and dark while the penalty holds,
    // long dashes when partly open, light with short dots when open. Line style tells status apart without colour.
    const renderer = L.canvas({ padding: 0.2 });
    const risk = color('--color-error');
    const cellStyle = { closed: { weight: 3, fillOpacity: 0.55 }, reduced: { weight: 3, dashArray: '10 5', fillOpacity: 0.38 }, open: { weight: 2.5, dashArray: '3 5', fillOpacity: 0.22 }, unknown: { weight: 2.5, dashArray: '3 5', fillOpacity: 0.22 } };
    for (const zone of zones) {
      const selected = zone.id === selectedId;
      const style = zone.kind === 'penalty' ? { color: risk, ...cellStyle[zone.status] }
        : { color: palette[zone.status], weight: 1.5, dashArray: { closed: '2 4', reduced: '8 4' }[zone.status], fillOpacity: zone.status === 'closed' ? 0.35 : 0.2 };
      const shape = L.polygon(zone.boundary, { renderer, ...style, ...(selected && { weight: 5, fillOpacity: style.fillOpacity + 0.15 }) }).addTo(layer.current);
      const text = zone.kind === 'penalty' ? `${zone.name} · ${names[zone.status]} · 2025 견인 ${zone.towingCount}건` : `${zone.name} · ${names[zone.status]} · ${zone.available === null ? `정원 ${zone.capacity}` : `여유 ${zone.available}`}대`;
      const overlays = [shape];
      if (selected || !['area', 'penalty'].includes(zone.kind)) overlays.push(sign(zone.point, { status: zone.status, picked: selected }, text, selected ? 900 : 200));
      for (const overlay of overlays) {
        const label = document.createElement('strong'); label.textContent = text;
        overlay.bindTooltip(label); overlay.on('click', () => onSelect(zone.id));
      }
    }
    for (const vehicle of vehicles) {
      const picked = vehicle.id === selectedVehicleId;
      const label = document.createElement('strong'); label.textContent = vehicle.label ?? `${vehicle.cityName} · ${vehicle.provider} ${vehicle.id} · 배터리 ${vehicle.battery}% · 원관측 시각 미제공`;
      const pin = pmPin({ alert: vehicle.alert, picked, battery: vehicle.battery });
      const marker = L.marker(vehicle.point, { icon: L.divIcon({ html: pin.svg, className: '', iconSize: [pin.width, pin.height], iconAnchor: [pin.width / 2, pin.height], tooltipAnchor: [0, -pin.height] }), title: label.textContent, zIndexOffset: picked ? 1000 : vehicle.alert ? 500 : 0 }).addTo(layer.current);
      marker.bindTooltip(label);
      if (onVehicleSelect) marker.on('click', () => onVehicleSelect(vehicle.id));
    }
    if (position) {
      L.circle(position.point, { radius: Math.min(position.accuracy, 5000), color: color('--color-accent'), weight: 1, fillOpacity: 0.07, interactive: false }).addTo(layer.current);
      L.circleMarker(position.point, { radius: 7, color: color('--color-accent'), fillOpacity: 1, interactive: false }).addTo(layer.current);
    }
    probe.remove();
  }, [zones, vehicles, areas, routes, designated, selectedVehicleId, onVehicleSelect, selectedId, onSelect, position]);
  useEffect(() => {
    if (!map.current) return;
    towingLayer.current.clearLayers();
    const css = getComputedStyle(element.current); const color = css.getPropertyValue('--color-warning').trim() || css.color;
    for (const area of towingAreas ?? []) {
      const marker = L.circleMarker(area.point, { radius: Math.min(24, 6 + Math.sqrt(area.count)), color, weight: 2, fillOpacity: 0.35 }).addTo(towingLayer.current);
      const label = document.createElement('strong'); label.textContent = `${area.address} · 견인 ${area.count}건 · ${area.firstDate}~${area.lastDate} · SGIS 주소 대표점 (금지 경계 아님)`;
      marker.bindTooltip(label); marker.bindPopup(label.cloneNode(true));
    }
  }, [towingAreas]);
  useEffect(() => {
    const zone = zones.find((value) => value.id === selectedId);
    if (zone && map.current) {
      const instance = map.current; const projected = instance.project(zone.point);
      projected.y += instance.getSize().y / 2 - visibleMapCenterY(instance.getSize().y, bottomFraction, topInset);
      instance.panTo(instance.unproject(projected), { animate: false });
    }
  }, [selectedId, bottomFraction, topInset]);
  useEffect(() => {
    if (!map.current || !focus) return;
    // The first fit can run before layout settles; a stale zero size makes fitBounds jump to max zoom.
    map.current.invalidateSize({ pan: false });
    if (focus.point) {
      const projected = map.current.project(focus.point, 17);
      projected.y += map.current.getSize().y / 2 - visibleMapCenterY(map.current.getSize().y, bottomFraction, topInset);
      map.current.setView(map.current.unproject(projected, 17), 17, { animate: false });
    } else if (focus.points?.length) map.current.fitBounds(focus.points, { paddingTopLeft: [30, Math.max(30, topInset)], paddingBottomRight: [30, map.current.getSize().y * bottomFraction + 30], maxZoom: fitMaxZoom, animate: false });
    else map.current.setView(pilotCenter, 15, { animate: false });
  }, [focus, bottomFraction, topInset, fitMaxZoom]);
  return <VStack height="100%" width="100%" style={{ position: 'relative', minHeight: 0 }}>
    <VStack ref={element} height="100%" width="100%" style={{ zIndex: 0 }} role="region" aria-label="동적 주차존 지도. 같은 정보와 선택 기능은 주차존 목록에서도 이용할 수 있습니다." />
    {tileError && <VStack padding={3} style={{ position: 'absolute', top: '45%', left: 'var(--spacing-4)', right: 'var(--spacing-4)', background: 'var(--color-background-surface)', zIndex: 1 }}><Text role="status">배경 지도 연결이 원활하지 않습니다. 주차존 목록을 이용해 주세요.</Text></VStack>}
  </VStack>;
}
