import * as L from 'leaflet';
import { BannedArea, BannedAreas, NWRElement, tagsToHTML } from './overpass.ts';

export class ExclusionCircle extends L.Circle {
  readonly id: string;
  readonly element: NWRElement;
  readonly reason: BannedArea;

  constructor(e: NWRElement, options?: L.CircleOptions) {
    const latLng: [number, number] =
      e.type === 'node'
        ? [e.lat, e.lon]
        : [
            (e.bounds.maxlat + e.bounds.minlat) / 2,
            (e.bounds.maxlon + e.bounds.minlon) / 2
          ];
    const reason = getReason(e);
    super(latLng, {
      radius: 100,
      stroke: false,
      fillOpacity: 0.3,
      fillColor: colorMap[reason],
      ...options
    });

    this.id = e.id;
    this.element = e;
    this.reason = reason;

    this.bindPopup(
      `<div class="whitespace-pre-wrap">${tagsToHTML({ reason, ...e.tags })}</div>`,
      { maxWidth: 500 }
    );
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
