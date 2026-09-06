import type { MapDef, Rect } from '@mutiny/shared/maps';

interface Fixture {
  art: string;
  u: number;
  v: number;
  width: number;
  height: number;
}
interface Theme {
  tint: number;
  accent: number;
  purpose: string;
  fixtures: Fixture[];
}
const prop = (
  art: string,
  u: number,
  v: number,
  width: number,
  height = width,
): Fixture => ({ art, u, v, width, height });
/** THESIS: rooms are workplaces you recognize by equipment, not interchangeable crates.
 * OWN-WORLD: original cold-metal fixtures, cyan preservation glass, amber power and paper.
 * STORY: equipment explains the room and its existing tasks before a player reads a label.
 * FIRST VIEWPORT: a tighter room, clear travel lanes, task-specific instruments and perimeter storage.
 * FORM: extend the existing orthographic atlas; no new identity or decorative UI chrome.
 */
export const ROOM_THEMES: Record<string, Theme> = {
  boarding: {
    tint: 0xc6d0cc,
    accent: 0xe6a65a,
    purpose: 'SUIT UP / WAIT FOR YOUR CREW',
    fixtures: [
      prop('suits', 0.25, 0.14, 300, 150),
      prop('suits', 0.75, 0.14, 300, 150),
      prop('bench', 0.16, 0.77, 230, 145),
      prop('bench', 0.84, 0.77, 230, 145),
    ],
  },
  dock: {
    tint: 0xc6d0cc,
    accent: 0xc4b58a,
    purpose: 'ARRIVAL / ID CHECK',
    fixtures: [
      prop('suits', 0.5, 0.13, 310, 160),
      prop('supplies', 0.18, 0.76, 260, 170),
      prop('relay', 0.55, 0.75, 210),
    ],
  },
  relay: {
    tint: 0xb6cddb,
    accent: 0x94c8d8,
    purpose: 'SIGNAL ALIGNMENT / DOWNLINK',
    fixtures: [
      prop('servers', 0.5, 0.12, 330, 150),
      prop('relay', 0.52, 0.62, 260),
      prop('servers', 0.22, 0.84, 300, 140),
    ],
  },
  cryo: {
    tint: 0xadcfd1,
    accent: 0xa2dfd8,
    purpose: 'STASIS / SPECIMEN RECORDS',
    fixtures: [
      prop('cryopod', 0.42, 0.23, 175, 240),
      prop('cryopod', 0.58, 0.23, 175, 240),
      prop('cryopod', 0.18, 0.8, 175, 225),
      prop('samples', 0.43, 0.84, 180, 120),
    ],
  },
  engine: {
    tint: 0xd2c0ad,
    accent: 0xe2aa6b,
    purpose: 'PROPULSION / FUEL INTAKE',
    fixtures: [
      prop('engine', 0.51, 0.58, 280, 230),
      prop('switchboard', 0.19, 0.18, 220, 155),
      prop('tank', 0.8, 0.17, 180, 175),
    ],
  },
  stores: {
    tint: 0xc9ccb5,
    accent: 0xd3c58e,
    purpose: 'PROVISIONS / SUIT ISSUE / FUEL',
    fixtures: [
      prop('supplies', 0.22, 0.14, 290, 155),
      prop('suits', 0.54, 0.14, 320, 155),
      prop('supplies', 0.84, 0.14, 210, 155),
      prop('tank', 0.52, 0.8, 150, 160),
    ],
  },
  scrubber: {
    tint: 0xb2cbbf,
    accent: 0xa6c6ab,
    purpose: 'AIR RECLAMATION / FILTER CHECK',
    fixtures: [
      prop('scrubber', 0.52, 0.52, 280, 310),
      prop('cleaning', 0.83, 0.22, 190, 210),
      prop('cleaning', 0.18, 0.5, 160, 180),
    ],
  },
  commons: {
    tint: 0xd8d5c0,
    accent: 0xd3bf91,
    purpose: 'CREW MESS / ASSEMBLY',
    fixtures: [
      prop('bench', 0.18, 0.8, 300, 190),
      prop('bench', 0.8, 0.8, 300, 190),
      prop('supplies', 0.81, 0.15, 260, 165),
      prop('bench', 0.2, 0.48, 190, 280),
    ],
  },
  switchyard: {
    tint: 0xc0c9d2,
    accent: 0xdbbd79,
    purpose: 'POWER DISTRIBUTION / LOAD BALANCE',
    fixtures: [
      prop('switchboard', 0.5, 0.13, 340, 180),
      prop('switchboard', 0.19, 0.79, 280, 185),
      prop('servers', 0.81, 0.86, 270, 145),
      prop('switchboard', 0.5, 0.42, 220, 170),
    ],
  },
  archive: {
    tint: 0xcec7b1,
    accent: 0xd2c09a,
    purpose: 'PERSONNEL FILES / DATA VAULT',
    fixtures: [
      prop('files', 0.5, 0.11, 340, 140),
      prop('files', 0.86, 0.16, 220, 160),
      prop('files', 0.14, 0.64, 200, 300),
      prop('servers', 0.45, 0.56, 200, 220),
      prop('files', 0.68, 0.91, 240, 125),
    ],
  },
  reactor: {
    tint: 0xb7c8ce,
    accent: 0x8fceca,
    purpose: 'CONTAINMENT / COOLANT LOOP',
    fixtures: [
      prop('reactor', 0.5, 0.53, 320),
      prop('scrubber', 0.14, 0.52, 160, 220),
      prop('scrubber', 0.86, 0.52, 160, 220),
    ],
  },
};

export function roomBounds(room: MapDef['rooms'][number]): Rect {
  const xs = room.polygon.map((p) => p.x),
    ys = room.polygon.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Decorative equipment never covers a usable station, vent or spawn footprint. */
export function roomFixtures(map: MapDef, room: MapDef['rooms'][number]) {
  const bounds = roomBounds(room);
  const protectedPoints = [
    ...map.tasks,
    ...map.vents,
    ...map.sabotagePoints,
    ...map.spawnPoints,
    map.emergencyButton,
  ];
  return (ROOM_THEMES[room.id]?.fixtures ?? [])
    .map((f) => ({
      ...f,
      x: bounds.x + bounds.width * f.u,
      y: bounds.y + bounds.height * f.v,
    }))
    .filter((f) =>
      protectedPoints.every((p) => {
        const dx = Math.max(0, Math.abs(p.x - f.x) - f.width / 2);
        const dy = Math.max(0, Math.abs(p.y - f.y) - f.height / 2);
        return Math.hypot(dx, dy) >= 90;
      }),
    );
}

export const TASK_ART: Record<string, string> = {
  'reroute-power': 'switchboard',
  'calibrate-gyro': 'relay',
  'data-transfer': 'servers',
  'sort-samples': 'samples',
  'fuel-engines': 'tank',
  'clear-vents': 'vent',
  'enter-access-code': 'access',
  'scan-id': 'access',
};
