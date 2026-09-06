import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import mapData from '../packages/shared/maps/the-hollow.json' with { type: 'json' };
import { MapDefSchema } from '../packages/shared/src/maps/schema.js';
import {
  ROOM_THEMES,
  roomBounds,
  roomFixtures,
  TASK_ART,
} from '../packages/client/src/renderer/roomThemes.js';

// Atlas/placement QA, not a browser screenshot. Uses the same texture frames and layout data.
const map = MapDefSchema.parse(mapData);
const atlas = await readFile(
  new URL(
    '../packages/client/public/assets/station/station.png',
    import.meta.url,
  ),
);
const manifest = JSON.parse(
  await readFile(
    new URL(
      '../packages/client/public/assets/station/station.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
};
const textures = new Map<string, Buffer>();
async function texture(name: string) {
  if (!textures.has(name)) {
    const f = manifest.frames[name]!.frame;
    textures.set(
      name,
      await sharp(atlas)
        .extract({ left: f.x, top: f.y, width: f.w, height: f.h })
        .png()
        .toBuffer(),
    );
  }
  return textures.get(name)!;
}
const cards: sharp.OverlayOptions[] = [];
await mkdir(new URL('../docs/maps/rooms/', import.meta.url), {
  recursive: true,
});
for (const [index, room] of map.rooms.entries()) {
  const b = roomBounds(room);
  const theme = ROOM_THEMES[room.id]!;
  const scale = Math.min(480 / b.width, 350 / b.height);
  const width = b.width * scale,
    height = b.height * scale;
  const left = (520 - width) / 2,
    top = 72;
  const floor = (await texture('floor')).toString('base64');
  const base = `<svg width="520" height="460" xmlns="http://www.w3.org/2000/svg"><rect width="520" height="460" fill="#102029"/><text x="20" y="29" font-family="sans-serif" font-size="20" fill="#dde6e4">${room.name}</text><text x="20" y="51" font-family="sans-serif" font-size="10" fill="#e6a65a">${theme.purpose}</text><defs><pattern id="floor" width="${256 * scale}" height="${256 * scale}" patternUnits="userSpaceOnUse"><image width="${256 * scale}" height="${256 * scale}" href="data:image/png;base64,${floor}"/></pattern></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#floor)" stroke="#899a9c" stroke-width="3"/><text x="20" y="443" font-family="sans-serif" font-size="10" fill="#a6b6b7">ATLAS + PLACEMENT REVIEW · NO LIGHTING / PLAYERS</text></svg>`;
  const overlays: sharp.OverlayOptions[] = [];
  const fixtures = [
    ...roomFixtures(map, room),
    ...map.tasks
      .filter((t) => t.room === room.id)
      .map((t) => ({ ...t, art: TASK_ART[t.type]!, width: 144, height: 144 })),
    ...map.vents
      .filter((t) => t.room === room.id)
      .map((t) => ({ ...t, art: 'vent', width: 136, height: 136 })),
    ...map.sabotagePoints
      .filter((t) => t.room === room.id)
      .map((t) => ({
        ...t,
        art:
          t.kind === 'lights'
            ? 'switchboard'
            : t.kind.startsWith('o2')
              ? 'scrubber'
              : t.kind === 'comms'
                ? 'servers'
                : 'console',
        width: 156,
        height: 156,
      })),
    ...(room.id === 'commons'
      ? [{ ...map.emergencyButton, art: 'emergency', width: 220, height: 220 }]
      : []),
  ];
  for (const f of fixtures)
    overlays.push({
      input: await sharp(await texture(f.art))
        .resize(Math.round(f.width * scale), Math.round(f.height * scale))
        .png()
        .toBuffer(),
      left: Math.round(left + (f.x - b.x - f.width / 2) * scale),
      top: Math.round(top + (f.y - b.y - f.height / 2) * scale),
    });
  const card = await sharp(Buffer.from(base))
    .composite(overlays)
    .png()
    .toBuffer();
  await sharp(card).toFile(
    fileURLToPath(
      new URL(`../docs/maps/rooms/${room.id}.png`, import.meta.url),
    ),
  );
  cards.push({
    input: card,
    left: (index % 2) * 540,
    top: Math.floor(index / 2) * 480,
  });
}
await sharp({
  create: { width: 1060, height: 2380, channels: 4, background: '#091219' },
})
  .composite(cards)
  .png()
  .toFile('docs/maps/room-theme-review.png');
console.log(
  'Rendered ten room atlas/placement cards; not a gameplay screenshot.',
);
