export interface APIElement {
  id: string;
  tags: Record<string, string>;
}

export interface NodeElement extends APIElement {
  type: 'node';
  lat: number;
  lon: number;
}

export interface WayElement extends APIElement {
  type: 'way';
  bounds: {
    minlat: number;
    minlon: number;
    maxlat: number;
    maxlon: number;
  };
  nodes: number[];
  geometry: { lat: number; lon: number }[];
}

export interface RelationElement extends APIElement {
  type: 'relation';
  bounds: {
    minlat: number;
    minlon: number;
    maxlat: number;
    maxlon: number;
  };
  members: {
    type: 'way';
    ref: number;
    role: string;
    geometry: { lat: number; lon: number }[];
  }[];
}

export type NWRElement = Readonly<NodeElement | WayElement | RelationElement>;

export function tagsToHTML(tags: APIElement['tags']) {
  const entries = Object.entries(tags);

  let keyValues = entries.map(
    ([k, v]) => `<span class="font-bold">${k}:</span><span class="">${v}</span>`
  );
  return `<div class="grid grid-cols-[max-content_1fr] gap-2">${keyValues.join('')}</div>`;
}

export const BannedAreas = {
  SCHOOL: 'Schule, Kindergarten, Spielplätze, Jugendeinrichtungen',
  UNIVERSITY: 'Hochschule',
  SPORT: 'Sportanlagen',
  PEDESTRIAN: 'Fußgängerzonen (7-20 Uhr)',
  OTHER: 'Andere'
} as const;

export type BannedArea = (typeof BannedAreas)[keyof typeof BannedAreas];
