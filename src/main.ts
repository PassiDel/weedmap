import './style.css';
import 'leaflet/dist/leaflet.css';
import {
  Control,
  easyButton,
  FeatureGroup,
  GeoJSON,
  Map as LMap,
  Polygon,
  Popup,
  TileLayer
} from 'leaflet';
import 'leaflet-easybutton';
import { BannedArea, BannedAreas, NWRElement } from './overpass.ts';
import { colorMap, ExclusionCircle } from './ExclusionCircle.ts';
// @ts-ignore
import { FeatureCollection, truncate } from '@turf/turf';
// @ts-ignore
import type { Feature } from '@turf/helpers';
import workerUrl from './worker/worker.ts?worker&url';

const worker = new Worker(workerUrl, { type: 'module' });

const m_mono = new TileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution:
      'Kartendaten &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Mitwirkende'
  }
);

const features: { [reason in BannedArea]: FeatureGroup<ExclusionCircle> } = {
  [BannedAreas.SCHOOL]: new FeatureGroup(),
  [BannedAreas.UNIVERSITY]: new FeatureGroup(),
  [BannedAreas.SPORT]: new FeatureGroup(),
  [BannedAreas.PEDESTRIAN]: new FeatureGroup(),
  [BannedAreas.OTHER]: new FeatureGroup()
};
const exclusionZone = new FeatureGroup<GeoJSON>();

const buffers: { [reason in BannedArea]: (FeatureCollection | Feature)[] } = {
  [BannedAreas.SCHOOL]: [],
  [BannedAreas.UNIVERSITY]: [],
  [BannedAreas.SPORT]: [],
  [BannedAreas.PEDESTRIAN]: [],
  [BannedAreas.OTHER]: []
};

let center: [number, number] = [53.0711829, 8.8087718];
let zoom = 14;
const urlPosition = /#@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+)/.exec(
  window.location.hash
);
if (urlPosition && urlPosition.length === 4) {
  const lat = parseFloat(urlPosition[1]);
  const lon = parseFloat(urlPosition[2]);
  const z = parseInt(urlPosition[3]);
  if (!isNaN(lat) && !isNaN(lon) && !isNaN(z)) {
    center = [lat, lon];
    zoom = z;
  }
}

const map = new LMap('map', {
  center,
  zoom,
  zoomControl: true,
  layers: [m_mono, exclusionZone, ...Object.values(features)]
});

new Popup()
  .setLatLng(center)
  .setContent(
    `<p>Diese Karte zeigt die Orte, an denen der Konsum von Cannabis verboten ist. Um jeden Ort wird ein Kreis mit Radius von 100 Metern (gemäß <a href="https://dserver.bundestag.de/btd/20/104/2010426.pdf" target="_blank">Beschlussempfehlung § 5 Konsumverbot</a>) gezeichnet.</p>
<p>Oben rechts können die verschiedenen Arten von Orten an- und abgeschaltet werden</p>
<p>Datenquelle: <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMaps</a> via <a href="https://overpass-turbo.eu/" target="_blank">Overpass</a></p>
<p>Keine Garantie für Korrektheit!</p>
<a href="https://github.com/PassiDel/weedmap" target="_blank">↗ Auf GitHub öffnen</a>`
  )
  .addTo(map);

map.on('moveend', async () => {
  const center = map.getCenter();
  window.history.pushState(
    {},
    '',
    `${import.meta.env.BASE_URL || '/'}#@${center.lat.toFixed(4)},${center.lng.toFixed(4)},${map.getZoom()}`
  );
  await fetchData();
});
let loading = false;

worker.addEventListener(
  'message',
  (b: MessageEvent<FeatureCollection<Polygon>>) => {
    exclusionZone.clearLayers();
    const zone = new GeoJSON(b.data, {
      style: { color: 'red', fillOpacity: 0.1, weight: 1 }
    });
    exclusionZone.addLayer(zone);
    exclusionZone.bringToBack();
  }
);
function showBuffer() {
  map.attributionControl.setPrefix('Berechne Zone');
  const fs = Object.entries(buffers)
    .filter(([k]) => map.hasLayer(features[k as keyof typeof features]))
    .flatMap(([_, buff]) => {
      const fs: Feature[] = buff.flatMap((f) =>
        f.type === 'Feature' ? [f] : f.features
      );
      return fs;
    });

  if (fs.length > 0) {
    worker.postMessage(fs);
  }
  map.attributionControl.setPrefix('');
}

Object.values(features).forEach((f) => {
  f.on('add', showBuffer);
  f.on('remove', showBuffer);
});

async function fetchData() {
  if (map.getZoom() < 12 || loading) {
    return;
  }
  loading = true;
  map.attributionControl.setPrefix('Lädt...');
  const bounds = map.getBounds();
  const query = `[out:json][timeout:25][bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}];
(
  nwr["amenity"="school"];
  nwr["building"="school"];
  nwr["building"="university"];
  nwr["leisure"="playground"];
  nwr["amenity"="kindergarten"];
  nwr["community_centre"="youth_centre"];
  nwr["leisure"="sports_centre"];
  nwr["leisure"="sports_hall"];
  nwr["leisure"="stadium"];
  nwr["leisure"="track"];
  nwr["leisure"="pitch"];
  nwr["sport"]["amenity"!="restaurant"]["amenity"!="pub"]["amenity"!="cafe"]["tourism"!="hotel"];
  nwr["highway"="pedestrian"]["area"!="yes"];
);
out geom;`;

  const elements = await fetch('https://overpass-api.de/api/interpreter', {
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'data=' + encodeURIComponent(query),
    method: 'POST'
  })
    .then((b) => b.json())
    .catch(() => ({ elements: [] }))
    .then((r) => r.elements as NWRElement[]);

  loading = false;
  map.attributionControl.setPrefix('Berechne Orte...');
  const ids = elements.map((e) => e.id);
  const exclude: ExclusionCircle[] = [];
  Object.values(buffers).forEach((b) => b.splice(0));
  Object.values(features).forEach((f) =>
    f.eachLayer((l) => {
      const id = (l as ExclusionCircle).id;
      if (ids.includes(id)) {
        exclude.push(l as ExclusionCircle);
        return;
      }
      f.removeLayer(l);
    })
  );

  elements.forEach((e) => {
    let marker = exclude.find((it) => it.id === e.id);
    if (!marker) {
      marker = new ExclusionCircle(e);
    }

    features[marker.reason].addLayer(marker);
    if (marker.buffer) {
      buffers[marker.reason].push(marker.buffer);
    }
  });

  queueMicrotask(showBuffer);
  map.attributionControl.setPrefix('');
}

new Control.Layers(
  {},
  Object.fromEntries(
    Object.entries(features).map(([k, v]) => [
      `<i class="w-3 h-3 my-auto inline-block" style="background-color: ${colorMap[k as BannedArea]}"></i> ${k}`,
      v
    ])
  )
).addTo(map);

easyButton(
  '<span class="bg-white p-2 rounded" title="Standort">📍</span>',
  function () {
    if (!navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => map.panTo([p.coords.latitude, p.coords.longitude]),
      undefined,
      { enableHighAccuracy: true }
    );
  }
).addTo(map);

fetchData();
