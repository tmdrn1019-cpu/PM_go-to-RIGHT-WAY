import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
// Leaflet requires its own tile-positioning and map-control CSS.
import 'leaflet/dist/leaflet.css';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { visibleMapCenterY } from './zone-search.mjs';

const names = { open: '개방', reduced: '축소 운영', closed: '폐쇄', unknown: '확인 중' };
const pilotCenter = [37.4827, 126.941];

export default function ZoneMap({ zones, vehicles = [], areas = [], routes = [], selectedVehicleId = null, onVehicleSelect, towingAreas, selectedId, onSelect, onBoundsChange, focus, position, bottomFraction = 0 }) {
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
    const color = (token) => css.getPropertyValue(token).trim() || css.color;
    const palette = { open: color('--color-success'), reduced: color('--color-warning'), closed: color('--color-error'), unknown: color('--color-text-secondary') };
    // Demo overlays: meter-radius towing circles and mission paths, drawn under the zones.
    for (const area of areas) {
      const label = document.createElement('strong'); label.textContent = area.label;
      L.circle(area.point, { radius: area.radiusM, color: color('--color-error'), weight: 1, dashArray: '4 4', fillOpacity: 0.08 }).addTo(layer.current).bindTooltip(label);
    }
    for (const route of routes) L.polyline(route, { color: color('--color-accent'), weight: 3, dashArray: '6 6', interactive: false }).addTo(layer.current);
    for (const zone of zones) {
      const selected = zone.id === selectedId;
      const shape = L.polygon(zone.boundary, { color: palette[zone.status], weight: selected ? 4 : 2, fillOpacity: selected ? 0.4 : 0.18 }).addTo(layer.current);
      const marker = L.circleMarker(zone.point, { radius: selected ? 10 : 7, color: palette[zone.status], fillColor: palette[zone.status], fillOpacity: 1 }).addTo(layer.current);
      for (const overlay of [shape, marker]) {
        const label = document.createElement('strong'); label.textContent = `${zone.name} · ${names[zone.status]} · 여유 ${zone.available}대`;
        overlay.bindTooltip(label); overlay.on('click', () => onSelect(zone.id));
      }
    }
    for (const vehicle of vehicles) {
      const picked = vehicle.id === selectedVehicleId;
      const marker = L.circleMarker(vehicle.point, { radius: picked ? 9 : 5, weight: picked ? 3 : 1, color: color(vehicle.alert ? '--color-error' : '--color-accent'), fillOpacity: 0.8 }).addTo(layer.current);
      const label = document.createElement('strong'); label.textContent = vehicle.label ?? `${vehicle.cityName} · ${vehicle.provider} ${vehicle.id} · 배터리 ${vehicle.battery}% · 원관측 시각 미제공`;
      marker.bindTooltip(label);
      if (onVehicleSelect) marker.on('click', () => onVehicleSelect(vehicle.id));
    }
    if (position) {
      L.circle(position.point, { radius: Math.min(position.accuracy, 5000), color: color('--color-accent'), weight: 1, fillOpacity: 0.07, interactive: false }).addTo(layer.current);
      L.circleMarker(position.point, { radius: 7, color: color('--color-accent'), fillOpacity: 1, interactive: false }).addTo(layer.current);
    }
  }, [zones, vehicles, areas, routes, selectedVehicleId, onVehicleSelect, selectedId, onSelect, position]);
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
      projected.y += instance.getSize().y / 2 - visibleMapCenterY(instance.getSize().y, bottomFraction);
      instance.panTo(instance.unproject(projected), { animate: false });
    }
  }, [selectedId, bottomFraction]);
  useEffect(() => {
    if (!map.current || !focus) return;
    if (focus.point) {
      const projected = map.current.project(focus.point, 17);
      projected.y += map.current.getSize().y / 2 - visibleMapCenterY(map.current.getSize().y, bottomFraction);
      map.current.setView(map.current.unproject(projected, 17), 17, { animate: false });
    } else if (focus.points?.length) map.current.fitBounds(focus.points, { paddingTopLeft: [30, 30], paddingBottomRight: [30, map.current.getSize().y * bottomFraction + 30], maxZoom: 17, animate: false });
    else map.current.setView(pilotCenter, 15, { animate: false });
  }, [focus, bottomFraction]);
  return <VStack height="100%" width="100%" style={{ position: 'relative', minHeight: 0 }}>
    <VStack ref={element} height="100%" width="100%" style={{ zIndex: 0 }} role="region" aria-label="동적 주차존 지도. 같은 정보와 선택 기능은 주차존 목록에서도 이용할 수 있습니다." />
    {tileError && <VStack padding={3} style={{ position: 'absolute', top: '45%', left: 'var(--spacing-4)', right: 'var(--spacing-4)', background: 'var(--color-background-surface)', zIndex: 1 }}><Text role="status">배경 지도 연결이 원활하지 않습니다. 주차존 목록을 이용해 주세요.</Text></VStack>}
  </VStack>;
}
