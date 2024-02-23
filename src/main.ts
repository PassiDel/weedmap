import './style.css';
import 'leaflet/dist/leaflet.css';
import {
  Circle,
  Control,
  easyButton,
  FeatureGroup,
  Map as LMap,
  Popup,
  TileLayer
} from 'leaflet';
import 'leaflet-easybutton';
import { BannedArea, BannedAreas, NWRElement, tagsToHTML } from './overpass.ts';

const m_mono = new TileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution:
      'Kartendaten &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Mitwirkende'
  }
);

const features: { [reason in BannedArea]: FeatureGroup } = {
  [BannedAreas.SCHOOL]: new FeatureGroup(),
  [BannedAreas.UNIVERSITY]: new FeatureGroup(),
  [BannedAreas.SPORT]: new FeatureGroup(),
  [BannedAreas.PEDESTRIAN]: new FeatureGroup(),
  [BannedAreas.OTHER]: new FeatureGroup()
};

const center = [53.0711829, 8.8087718] as [number, number];
const map = new LMap('map', {
  center,
  zoom: 14,
  zoomControl: true,
  layers: [m_mono, ...Object.values(features)]
});

new Popup()
  .setLatLng(center)
  .setContent(
    `<p>Diese Karte zeigt die Orte, an denen der Konsum von Cannabis verboten ist. Um jeden Ort wird ein Kreis mit Radius von 200 Metern (gemäß <a href="https://dserver.bundestag.de/btd/20/087/2008704.pdf" target="_blank">Gesetzentwurf § 5 Konsumverbot</a>) gezeichnet.</p>
<p>Oben rechts können die verschiedenen Arten von Orten an- und abgeschaltet werden</p>
<p>Datenquelle: <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMaps</a> via <a href="https://overpass-turbo.eu/" target="_blank">Overpass</a></p>
<p>Keine Garantie für Korrektheit!</p>`
  )
  .addTo(map);

map.on('moveend', async () => {
  await fetchData();
});
let loading = false;
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

  Object.values(features).forEach((f) => f.clearLayers());

  elements.forEach((e) => {
    const reason = getReason(e);
    const marker = new Circle(
      e.type === 'node' ? [e.lat, e.lon] : [e.bounds.maxlat, e.bounds.maxlon],
      200,
      {
        radius: 200,
        stroke: false,
        fillOpacity: 0.3,
        fillColor: colorMap[reason]
      }
    ).bindPopup(
      `<div class="whitespace-pre-wrap">${tagsToHTML({ reason, ...e.tags })}</div>`,
      { maxWidth: 500 }
    );

    features[reason].addLayer(marker);
  });

  loading = false;
}

const colorMap: { [reason in BannedArea]: string } = {
  [BannedAreas.SCHOOL]: 'red',
  [BannedAreas.UNIVERSITY]: 'orange',
  [BannedAreas.SPORT]: 'yellow',
  [BannedAreas.PEDESTRIAN]: 'green',
  [BannedAreas.OTHER]: 'blue'
};

function getReason(element: NWRElement): BannedArea {
  const t = element.tags;
  if (
    t.amenity === 'school' ||
    t.building === 'school' ||
    t.amenity === 'kindergarten' ||
    t.leisure === 'playground' ||
    t.community_centre === 'youth_centre'
  ) {
    return BannedAreas.SCHOOL;
  }
  if (t.building === 'university') {
    return BannedAreas.UNIVERSITY;
  }
  if (
    t.sport !== undefined ||
    ['sports_centre', 'sports_hall', 'stadium', 'track', 'pitch'].includes(
      t.leisure
    )
  ) {
    return BannedAreas.SPORT;
  }
  if (t.highway !== undefined) {
    return BannedAreas.PEDESTRIAN;
  }

  return BannedAreas.OTHER;
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
