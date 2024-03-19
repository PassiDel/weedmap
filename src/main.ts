import './style.css';
import 'leaflet/dist/leaflet.css';
import {
  Control,
  easyButton,
  FeatureGroup,
  GeoJSON,
  Map as LMap,
  Popup,
  TileLayer
} from 'leaflet';
import 'leaflet-easybutton';
import { BannedArea, BannedAreas, NWRElement } from './overpass.ts';
import { colorMap, ExclusionCircle } from './ExclusionCircle.ts';
import {
  buffer,
  dissolve,
  featureCollection,
  FeatureCollection,
  truncate
} from '@turf/turf';
// @ts-ignore
import type { Feature } from '@turf/helpers';

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

const center = [53.0711829, 8.8087718] as [number, number];
const map = new LMap('map', {
  center,
  zoom: 14,
  zoomControl: true,
  layers: [m_mono, exclusionZone, ...Object.values(features)]
});

new Popup()
  .setLatLng(center)
  .setContent(
    `<p>Diese Karte zeigt die Orte, an denen der Konsum von Cannabis verboten ist. Um jeden Ort wird ein Kreis mit Radius von 100 Metern (gemäß <a href="https://dserver.bundestag.de/btd/20/104/2010426.pdf" target="_blank">Beschlussempfehlung § 5 Konsumverbot</a>) gezeichnet.</p>
<p>Oben rechts können die verschiedenen Arten von Orten an- und abgeschaltet werden</p>
<p>Datenquelle: <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMaps</a> via <a href="https://overpass-turbo.eu/" target="_blank">Overpass</a></p>
<p>Keine Garantie für Korrektheit!</p>`
  )
  .addTo(map);

map.on('moveend', async () => {
  await fetchData();
});
let loading = false;

function showBuffer() {
  console.time('prepare');
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
    exclusionZone.clearLayers();
    console.timeEnd('prepare');
    try {
      console.time('dissolve');
      const b = dissolve(featureCollection(fs));
      const zone = new GeoJSON(b, {
        style: { color: 'red', fillOpacity: 0.1, weight: 1 }
      });
      console.timeEnd('dissolve');
      console.time('render');
      exclusionZone.addLayer(zone);
      console.timeEnd('render');
      exclusionZone.bringToBack();
    } catch (err) {
      console.error('dissolve', err);
    }
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
  console.time('parse');
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
    try {
      const b = buffer(marker.toGeoJSON(), 100, { units: 'meters' });

      // new GeoJSON(b).addTo(map);
      buffers[marker.reason].push(truncate(b));
    } catch (err) {
      console.error(
        `Buffer calc for id=${e.id}, type=${e.type} failed`,
        e,
        err
      );
    }
  });
  console.timeEnd('parse');

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
