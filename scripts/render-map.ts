import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  MapDefSchema,
  routeLength,
  type Point,
  type Rect,
} from '@mutiny/shared/maps';
import { DEFAULT_SETTINGS } from '@mutiny/shared';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = resolve(
  process.argv[2] ?? `${root}/packages/shared/maps/the-hollow.json`,
);
const output = resolve(process.argv[3] ?? `${root}/docs/maps/the-hollow.png`);
const map = MapDefSchema.parse(JSON.parse(await readFile(input, 'utf8')));
const scale = 0.09,
  left = 52,
  top = 148;
const width = map.size.width * scale + left * 2;
const height = map.size.height * scale + top + 148;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
const position = (p: Point) => `${p.x * scale + left},${p.y * scale + top}`;
const rect = (r: Rect, attrs: string) =>
  `<rect x="${r.x * scale + left}" y="${r.y * scale + top}" width="${r.width * scale}" height="${r.height * scale}" ${attrs}/>`;
const text = (x: number, y: number, value: string, attrs = '') =>
  `<text x="${x}" y="${y}" ${attrs}>${escape(value)}</text>`;
const pieces = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f2ec"/><g font-family="sans-serif" fill="#20292d">`,
  text(
    left,
    48,
    `${map.name} — collision review`,
    'font-size="28" font-weight="bold"',
  ),
  text(
    left,
    78,
    `${map.rooms.length} rooms · ${map.tasks.length} task stations · ${map.vents.length} vents · ${map.doors.length} doors`,
    'font-size="16"',
  ),
  text(
    left,
    106,
    `Outer circuit: ${routeLength(map.reviewCircuit).toLocaleString('en-US')} px / ${DEFAULT_SETTINGS.playerSpeed} px/s = ${Math.round(routeLength(map.reviewCircuit) / DEFAULT_SETTINGS.playerSpeed)} s, uninterrupted. Not a playtest measurement.`,
    'font-size="14"',
  ),
  rect({ x: 0, y: 0, ...map.size }, 'fill="#ffffff"'),
  ...map.walls.map((wall) =>
    rect(wall, 'fill="#343e42" stroke="#667175" stroke-width="0.4"'),
  ),
  ...map.rooms.map(
    (room) =>
      `<polygon points="${room.polygon.map(position).join(' ')}" fill="${room.kind === 'hub' ? '#d5e7e2' : room.kind === 'dead-end' ? '#e8dccd' : '#e3e7e8'}"/>`,
  ),
  `<polyline points="${map.reviewCircuit.map(position).join(' ')}" fill="none" stroke="#728d9b" stroke-width="2" stroke-dasharray="7 5"/>`,
  ...map.doors.map((door) => rect(door, 'fill="#d28c23"')),
];
for (const room of map.rooms) {
  const cx = room.polygon.reduce((n, p) => n + p.x, 0) / room.polygon.length;
  const cy = Math.min(...room.polygon.map((p) => p.y));
  pieces.push(
    text(
      cx * scale + left,
      cy * scale + top - 14,
      room.name,
      'text-anchor="middle" font-size="15" font-weight="bold" fill="#ffffff" stroke="#343e42" stroke-width="5" paint-order="stroke"',
    ),
  );
}
const vents = new Map(map.vents.map((vent) => [vent.id, vent]));
for (const vent of map.vents) {
  for (const link of vent.links.filter((id) => id > vent.id)) {
    pieces.push(
      `<polyline points="${position(vent)} ${position(vents.get(link)!)}" fill="none" stroke="#aa728e" stroke-width="1.2" stroke-dasharray="3 6" opacity="0.7"/>`,
    );
  }
}
for (const task of map.tasks)
  pieces.push(
    `<circle cx="${task.x * scale + left}" cy="${task.y * scale + top}" r="5" fill="#206ca0" stroke="#fff" stroke-width="1"/>`,
  );
for (const vent of map.vents)
  pieces.push(
    rect(
      { x: vent.x - 55, y: vent.y - 40, width: 110, height: 80 },
      'fill="#9a426f" stroke="#fff" stroke-width="1"',
    ),
  );
for (const panel of map.sabotagePoints) {
  const x = panel.x * scale + left,
    y = panel.y * scale + top;
  pieces.push(
    `<path d="M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z" fill="#b74630" stroke="#fff" stroke-width="1"/>`,
  );
}
for (const spawn of map.spawnPoints)
  pieces.push(
    `<circle cx="${spawn.x * scale + left}" cy="${spawn.y * scale + top}" r="2.5" fill="#24754c"/>`,
  );
const button = map.emergencyButton;
pieces.push(
  `<circle cx="${button.x * scale + left}" cy="${button.y * scale + top}" r="8" fill="#fff" stroke="#b74630" stroke-width="3"/>`,
);
const baseline = map.size.height * scale + top + 40;
pieces.push(
  text(
    left,
    baseline,
    'Dark = solid collision / void · White = corridors · Green rooms = hubs · Sand rooms = dead ends',
    'font-size="15"',
  ),
);
pieces.push(
  text(
    left,
    baseline + 28,
    'Blue dots = tasks · Plum rectangles / dotted links = vents · Red diamonds = sabotage · Amber bars = doors',
    'font-size="15"',
  ),
);
pieces.push(
  text(
    left,
    baseline + 56,
    'Commons: green dots = spawns, red ring = emergency button. Doors shown open; closing adds collision.',
    'font-size="14"',
  ),
);
pieces.push('</g></svg>');
await mkdir(dirname(output), { recursive: true });
const svg = pieces.join('\n');
await sharp(Buffer.from(svg)).png().toFile(output);
await writeFile(output.replace(/\.png$/i, '') + '.svg', svg);
console.log(
  `Rendered ${output} (${Math.round(width)} × ${Math.round(height)}).`,
);
