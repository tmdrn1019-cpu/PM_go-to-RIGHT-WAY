import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { VStack } from '@astryxdesign/core/Layout';
import { pmPin } from './pm-pin.mjs';

// Real streets with OSM building heights (OpenFreeMap, no key). Used only while a scooter is being walked.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ll = ([lat, lng]) => [lng, lat];
const meters = (lat) => [111_195 * Math.cos(lat * Math.PI / 180), 111_195];
// Camera faces the walking direction, so "forward" on screen is forward on the street.
const heading = ([from, to]) => { const [sx, sy] = meters(from[0]); return Math.atan2((to[1] - from[1]) * sx, (to[0] - from[0]) * sy) * 180 / Math.PI; };
const circle = ([lat, lng], m) => { const [sx, sy] = meters(lat); return [Array.from({ length: 41 }, (_, i) => { const a = i / 40 * 2 * Math.PI; return [lng + m * Math.sin(a) / sx, lat + m * Math.cos(a) / sy]; })]; };
const dot = (text, color, size) => { const el = document.createElement('span'); el.title = text; el.setAttribute('aria-label', text); el.setAttribute('role', 'img');
  Object.assign(el.style, { width: size, height: size, borderRadius: '50%', background: color, border: 'var(--border-width-thick, 3px) solid var(--color-background-surface)', boxShadow: 'var(--shadow-md)' }); return el; };

export default function WalkMap3D({ route, point, clearM, startLabel, targetLabel, scooterLabel, onFail }) {
  const element = useRef(null); const scooter = useRef(null);
  // Each server reply brings a new route array; rebuild the map only when the route itself changes.
  const routeKey = route.flat().join();
  useEffect(() => {
    // Theme tokens are light-dark(...) values that MapLibre cannot parse; let the browser resolve them to rgb first.
    const probe = document.createElement('span'); element.current.append(probe);
    const palette = Object.fromEntries(['--color-error', '--color-success', '--color-accent'].map((token) => { probe.style.color = `var(${token})`; return [token, getComputedStyle(probe).color]; }));
    probe.remove(); const color = (token) => palette[token];
    let map;
    try { map = new maplibregl.Map({ container: element.current, style: STYLE, center: ll(route[0]), zoom: 18, pitch: 60, maxPitch: 70, bearing: heading(route), attributionControl: { compact: true } }); }
    catch { onFail(); return undefined; } // no WebGL
    // A missing icon or slow tiles are fine; a style that never arrives falls back to 2D instead of a blank view.
    let ready = false; const timer = setTimeout(() => { if (!ready) onFail(); }, 10_000);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
    new maplibregl.Marker({ element: dot(startLabel, color('--color-error'), '16px') }).setLngLat(ll(route[0])).addTo(map);
    new maplibregl.Marker({ color: color('--color-success'), title: targetLabel }).setLngLat(ll(route[1])).addTo(map);
    const pin = document.createElement('span'); pin.innerHTML = pmPin({ picked: true }).svg; pin.title = scooterLabel; pin.setAttribute('aria-label', scooterLabel); pin.setAttribute('role', 'img');
    scooter.current = new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat(ll(point)).addTo(map);
    map.once('style.load', () => {
      ready = true;
      if (clearM) {
        map.addSource('clear', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: circle(route[0], clearM) } } });
        map.addLayer({ id: 'clear-fill', type: 'fill', source: 'clear', paint: { 'fill-color': color('--color-error'), 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'clear-line', type: 'line', source: 'clear', paint: { 'line-color': color('--color-error'), 'line-width': 2 } });
      }
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route.map(ll) } } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': color('--color-accent'), 'line-width': 5, 'line-dasharray': [1, 1.5] } });
      const bounds = route.reduce((b, p) => b.extend(ll(p)), new maplibregl.LngLatBounds(ll(route[0]), ll(route[0])));
      map.fitBounds(bounds, { padding: 70, pitch: 60, bearing: heading(route), maxZoom: 18, duration: 0 }); // 18 keeps surrounding buildings in view on 13~15m moves
    });
    const observer = new ResizeObserver(() => map.resize()); observer.observe(element.current);
    return () => { clearTimeout(timer); observer.disconnect(); map.remove(); scooter.current = null; };
  }, [routeKey, clearM, startLabel, targetLabel, scooterLabel, onFail]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scooter.current?.setLngLat(ll(point)); }, [point]);
  return <VStack ref={element} height="100%" width="100%" role="region" aria-label="킥보드 이동 3D 지도. 같은 안내는 아래 미션 패널에 글로 있습니다." />;
}
