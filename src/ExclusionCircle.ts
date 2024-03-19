import {
  BannedArea,
  BannedAreas,
  isNode,
  isRelation,
  isWay,
  NWRElement,
  tagsToHTML
} from './overpass.ts';
import { Circle, FeatureGroup, Polygon } from 'leaflet';

export class ExclusionCircle extends FeatureGroup<Polygon | Circle> {
  readonly id: string;
  readonly element: NWRElement;
  readonly reason: BannedArea;

  constructor(e: NWRElement) {
    super();
    const reason = getReason(e);
    const color = colorMap[getReason(e)];
    switch (e.type) {
      case 'node':
        this.addLayer(this.getCircle(e, color));
        break;
      case 'way':
        if (e.geometry.length > 3) {
          this.addLayer(this.getPolygon(e.geometry, color));
        } else {
          this.addLayer(this.getCircle(e.geometry[0], color));
        }
        break;
      case 'relation':
        e.members
          .filter((m) => !isRelation(m))
          .forEach((m) => {
            if (isWay(m)) {
              m.geometry.length > 3
                ? this.addLayer(this.getPolygon(m.geometry, color))
                : this.addLayer(this.getCircle(m.geometry[0], color));
            } else if (isNode(m)) {
              this.addLayer(this.getCircle(m, color));
            }
          });
        break;
    }

    this.id = e.id;
    this.element = e;
    this.reason = reason;

    this.bindPopup(
      `<div class="whitespace-pre-wrap flex flex-col gap-3">${tagsToHTML({ reason, ...e.tags })}<a href="https://www.openstreetmap.org/${e.type}/${e.id}" target="_blank">↗ Auf OpenStreetMap öffnen</a></div>`,
      { maxWidth: 500 }
    );
  }

  private getPolygon(g: { lat: number; lon: number }[], fillColor: string) {
    return new Polygon(
      g.map(({ lat, lon }) => ({ lat, lng: lon })),
      {
        fillColor,
        fillOpacity: 0.4,
        fill: true,
        stroke: false
      }
    );
  }

  private getCircle(g: { lat: number; lon: number }, fillColor: string) {
    return new Circle([g.lat, g.lon], {
      radius: 10,
      fillColor,
      fillOpacity: 0.4,
      fill: true,
      stroke: false
    });
  }
}

export const colorMap: { [reason in BannedArea]: string } = {
  [BannedAreas.SCHOOL]: 'red',
  [BannedAreas.UNIVERSITY]: 'orange',
  [BannedAreas.SPORT]: 'yellow',
  [BannedAreas.PEDESTRIAN]: 'green',
  [BannedAreas.OTHER]: 'blue'
};

export function getReason(element: NWRElement): BannedArea {
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
