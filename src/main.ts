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
import { colorMap, ExclusionCircle, getReason } from './ExclusionCircle.ts';
import { buffer, dissolve, featureCollection } from '@turf/turf';
import { Feature } from '@turf/helpers';

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

const center = [53.0552419, 8.7712428] as [number, number];
const map = new LMap('map', {
  center,
  zoom: 19,
  zoomControl: true,
  layers: [m_mono, ...Object.values(features)]
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
const areas = new FeatureGroup();
let exclusionZone: GeoJSON | undefined;
async function fetchData() {
  if (map.getZoom() < 12 || loading) {
    return;
  }
  loading = true;
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

  const ids = elements.map((e) => e.id);
  const exclude: string[] = [];
  Object.values(features).forEach((f) =>
    f.eachLayer((l) => {
      const id = (l as ExclusionCircle).id;
      if (ids.includes(id)) {
        exclude.push(id);
        return;
      }
      f.removeLayer(l);
    })
  );

  const buffers: Feature[] = [];
  elements.forEach((e) => {
    if (exclude.includes(e.id)) {
      return;
    }
    const marker = new ExclusionCircle(e);
    features[marker.reason].addLayer(marker);

    if (e.type === 'way') {
      const area = new Polygon(
        e.geometry.map(({ lat, lon }) => ({ lat, lng: lon })),
        {
          fillColor: colorMap[getReason(e)],
          fillOpacity: 0.4,
          fill: true,
          stroke: false
        }
      );
      area.addTo(map);
      const b = buffer(area.toGeoJSON(), 100, { units: 'meters' });

      // new GeoJSON(b).addTo(map);
      buffers.push(b);
    }
  });

  // const forbidden = buffers.reduce((u, b) => union(u, b), buffers.pop());
  // new GeoJSON(forbidden).addTo(map);
  const b = dissolve(featureCollection(buffers));
  exclusionZone?.removeFrom(map);
  exclusionZone = new GeoJSON(b, {
    style: { color: 'red', fillOpacity: 0.1, weight: 1 }
  });
  exclusionZone.addTo(map);

  loading = false;
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
