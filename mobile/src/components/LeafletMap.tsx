import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewSharedProps } from 'react-native-webview/lib/WebViewTypes';

interface WebViewHandle {
  injectJavaScript: (script: string) => void;
}
// react-native-webview 14 intersects iOS/Android/Windows props, which TS 6 reduces
// to `never`; the shared props are all this component uses.
const WebView = RNWebView as unknown as ComponentType<WebViewSharedProps & { ref?: Ref<WebViewHandle> }>;

/**
 * Leaflet + OpenStreetMap/CARTO tiles inside a WebView: no Google Maps API key
 * or native map SDK needed. Supports listing markers and a draggable/tap-to-set
 * pin for choosing a location.
 */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  approximate?: boolean;
}

interface Props {
  markers?: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  /** When set, shows a movable pin; updates are reported through onPick. */
  pin?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string) => void;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BENGALURU = { lat: 12.9716, lng: 77.5946 };

function buildHtml(markers: MapMarker[], center: { lat: number; lng: number }, zoom: number, pickable: boolean, interactive: boolean): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}
.price{background:#008069;color:#fff;font:700 12px sans-serif;padding:4px 8px;border-radius:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}</style>
</head><body><div id="map"></div><script>
const send = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
const map = L.map('map', {zoomControl:${interactive}, dragging:${interactive}, scrollWheelZoom:false, touchZoom:${interactive}, doubleClickZoom:${interactive}})
  .setView([${center.lat}, ${center.lng}], ${zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
const markers = ${JSON.stringify(markers)};
const group = [];
markers.forEach(m => {
  const icon = L.divIcon({className:'', html:'<div class="price">'+m.label+'</div>', iconSize:null});
  const mk = L.marker([m.lat, m.lng], {icon}).addTo(map).on('click', () => send({type:'marker', id:m.id}));
  if (m.approximate) L.circle([m.lat, m.lng], {radius: 800, color:'#B26A00', weight:1, fillOpacity:0.12}).addTo(map);
  group.push(mk);
});
if (markers.length > 1) map.fitBounds(L.featureGroup(group).getBounds().pad(0.2));
let pin = null;
window.setPin = (lat, lng, recenter) => {
  if (!pin) {
    pin = L.marker([lat, lng], {draggable:true}).addTo(map);
    pin.on('dragend', () => { const p = pin.getLatLng(); send({type:'pick', lat:p.lat, lng:p.lng}); });
  } else pin.setLatLng([lat, lng]);
  if (recenter) map.setView([lat, lng], Math.max(map.getZoom(), 14));
};
if (${pickable}) map.on('click', e => { window.setPin(e.latlng.lat, e.latlng.lng, false); send({type:'pick', lat:e.latlng.lat, lng:e.latlng.lng}); });
</script></body></html>`;
}

export function LeafletMap({ markers = [], center, zoom = 10, pin, onPick, onMarkerPress, interactive = true, style }: Props) {
  const ref = useRef<WebViewHandle>(null);
  const markerKey = JSON.stringify(markers);
  const pickable = !!onPick;
  // Freeze the initial view; later pin moves are injected instead of reloading the page.
  const [initial] = useState(() => ({ center: center ?? pin ?? markers[0] ?? BENGALURU, zoom }));
  const html = useMemo(
    () => buildHtml(JSON.parse(markerKey) as MapMarker[], initial.center, initial.zoom, pickable, interactive),
    [markerKey, initial, pickable, interactive],
  );

  // Pins chosen inside the map are already drawn there; only external changes
  // (e.g. "use my location") need to be pushed in and re-centred.
  const lastPicked = useRef<string | null>(null);
  useEffect(() => {
    if (!pin || lastPicked.current === `${pin.lat},${pin.lng}`) return;
    ref.current?.injectJavaScript(`window.setPin && window.setPin(${pin.lat}, ${pin.lng}, true); true;`);
  }, [pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string; lat?: number; lng?: number };
    if (msg.type === 'marker' && msg.id) onMarkerPress?.(msg.id);
    if (msg.type === 'pick' && msg.lat !== undefined && msg.lng !== undefined) {
      lastPicked.current = `${msg.lat},${msg.lng}`;
      onPick?.(msg.lat, msg.lng);
    }
  };

  return (
    <WebView
      ref={ref}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://landconnect.local/' }}
      onMessage={onMessage}
      onLoadEnd={() => {
        if (pin) ref.current?.injectJavaScript(`window.setPin(${pin.lat}, ${pin.lng}, true); true;`);
      }}
      style={style}
      javaScriptEnabled
    />
  );
}
