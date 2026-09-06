import type { MapDef } from './maps/schema.js';

/** A non-gameplay room: no tasks, vents, sabotage or emergency interaction. */
export const BOARDING_MAP: MapDef = {
  id: 'boarding',
  name: 'Boarding room',
  version: 1,
  size: { width: 1920, height: 1080 },
  rooms: [
    {
      id: 'boarding',
      name: 'Boarding room',
      kind: 'hub',
      polygon: [
        { x: 120, y: 120 },
        { x: 1800, y: 120 },
        { x: 1800, y: 960 },
        { x: 120, y: 960 },
      ],
    },
  ],
  walls: [
    { x: 0, y: 0, width: 1920, height: 120 },
    { x: 0, y: 960, width: 1920, height: 120 },
    { x: 0, y: 120, width: 120, height: 840 },
    { x: 1800, y: 120, width: 120, height: 840 },
  ],
  spawnPoints: Array.from({ length: 10 }, (_, index) => ({
    x: 640 + (index % 5) * 160,
    y: 530 + Math.floor(index / 5) * 150,
  })),
  corridors: [],
  tasks: [],
  vents: [],
  doors: [],
  sabotagePoints: [],
  cameras: [],
  emergencyButton: { x: 960, y: 540 },
  reviewCircuit: [],
};
