// @ts-ignore
import { Feature } from '@turf/helpers';
// @ts-ignore
import { dissolve, featureCollection } from '@turf/turf';

self.onmessage = function (e: MessageEvent<Feature[]>) {
  try {
    const b = dissolve(featureCollection(e.data));
    self.postMessage(b);
  } catch (err) {
    console.error('dissolve', err);
  }
};
