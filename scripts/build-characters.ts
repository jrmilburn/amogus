import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { COLORS } from '@mutiny/shared';
import {
  CHARACTER_ANIMATIONS,
  CHARACTER_FRAME,
  CHARACTER_LAYERS,
  animationKey,
  type CharacterAnimation,
  type CharacterLayer,
} from '../packages/client/src/characters/animations.js';

// ImageGen source parts are cropped once, then rigged deterministically. No network at build time.
const root = new URL('../', import.meta.url);
const source = await readFile(
  new URL('packages/client/art/engineer/parts.png', root),
);
const boxes = {
  torso: [45, 27, 344, 357],
  head: [491, 45, 299, 330],
  belt: [898, 119, 309, 188],
  farArm: [120, 432, 185, 376],
  nearArm: [543, 430, 179, 381],
  farLeg: [956, 418, 200, 408],
  nearLeg: [107, 831, 223, 395],
  pack: [474, 851, 309, 352],
  visor: [922, 919, 251, 227],
} as const;
type Part = keyof typeof boxes;
const parts = {} as Record<Part, string>;
for (const name of Object.keys(boxes) as Part[]) {
  const [left, top, width, height] = boxes[name];
  let pipeline = sharp(source).extract({ left, top, width, height });
  if (name !== 'pack' && name !== 'visor')
    pipeline = pipeline.grayscale().toColourspace('srgb');
  parts[name] =
    `data:image/png;base64,${(await pipeline.png().toBuffer()).toString('base64')}`;
}
function part(
  name: Part,
  x: number,
  y: number,
  w: number,
  h: number,
  angle = 0,
) {
  return `<image href="${parts[name]}" x="${x}" y="${y}" width="${w}" height="${h}" transform="rotate(${angle} ${x + w / 2} ${y + 3})"/>`;
}
function frame(
  animation: CharacterAnimation,
  index: number,
  layer: CharacterLayer,
) {
  const walking = animation === 'walk';
  const phase = (index / CHARACTER_ANIMATIONS[animation].frames) * Math.PI * 2;
  const stride = walking ? Math.sin(phase) : 0;
  const bob = walking
    ? -Math.abs(Math.sin(phase * 2)) * 2
    : -[0, 1, 2, 1][index % 4]!;
  const ghost = animation === 'ghost';
  const body = animation === 'body';
  const death = body ? 1 : animation === 'killed' ? index / 7 : 0;
  const vent =
    animation === 'ventEnter'
      ? index / 5
      : animation === 'ventExit'
        ? 1 - index / 5
        : 0;
  const crouch = vent * 0.85;
  const missingLegs = body || ghost;
  const upperY = bob + (ghost ? -7 : 0);
  let content = '';
  if (layer === 'pack') content = part('pack', 29, 54 + upperY, 33, 44);
  if (layer === 'suit') {
    content = part('farArm', 83, 58 + upperY, 20, 49, -stride * 23);
    if (!missingLegs)
      content += `<g opacity="${1 - death}">${part('farLeg', 73, 95 - Math.max(0, -stride) * 5, 24, 49, -stride * 19)}${part('nearLeg', 53, 95 - Math.max(0, stride) * 5, 27, 49, stride * 19)}</g>`;
    if (ghost)
      content += `<defs><linearGradient id="mist" x2="0" y2="1"><stop stop-color="#dedede"/><stop offset=".48" stop-color="#999999" stop-opacity=".8"/><stop offset="1" stop-color="#c8c8c8" stop-opacity="0"/></linearGradient></defs><g transform="translate(0 ${bob})"><path d="M53 96 Q70 90 92 96 Q95 111 88 121 Q82 130 88 142 Q72 136 73 120 Q67 133 53 143 Q61 126 52 118 Q46 107 53 96Z" fill="url(#mist)" stroke="#424242" stroke-opacity=".35" stroke-width="2"/><path d="M56 103 Q71 112 87 103 M56 110 Q70 118 84 110" fill="none" stroke="#e5e5e5" stroke-opacity=".45" stroke-width="2"/><path d="M61 111 Q72 119 61 133 M82 109 Q74 118 81 132" fill="none" stroke="#ededed" stroke-opacity=".3" stroke-width="2"/></g>`;
    content +=
      part('torso', 47, 51 + upperY, 51, 54) +
      part('belt', 51, 93 + upperY, 43, 17) +
      part('head', 61, 16 + upperY, 45, 48) +
      part('nearArm', 43, 59 + upperY, 23, 50, stride * 25);
    if (body)
      content +=
        '<path d="M56 106l7-4 7 5 8-4 10 4" fill="none" stroke="#373737" stroke-width="5"/>';
  }
  if (layer === 'visor') content = part('visor', 84, 31 + upperY, 27, 25);
  // Collapse stays inside the canvas; the body is a sealed, non-graphic upper suit.
  const deathTransform = death
    ? `translate(${-death * 8} ${death * 28}) rotate(${death * 82} 80 92)`
    : '';
  const ventTransform = `translate(80 144) scale(${1 - crouch * 0.5} ${1 - crouch}) translate(-80 -144)`;
  const opacity = vent === 1 ? 0 : ghost ? 0.72 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g opacity="${opacity}" transform="${ventTransform}"><g transform="${deathTransform}">${content}</g></g></svg>`;
}

const directory = new URL('packages/client/public/assets/engineer/', root);
await mkdir(directory, { recursive: true });
const stride = CHARACTER_FRAME.width + 4;
const columns = 8;
const names = Object.keys(CHARACTER_ANIMATIONS) as CharacterAnimation[];
const total = names.reduce(
  (sum, name) =>
    sum + CHARACTER_ANIMATIONS[name].frames * CHARACTER_LAYERS.length,
  0,
);
const width = columns * stride,
  height = Math.ceil(total / columns) * stride;
const frames: Record<string, unknown> = {};
const animations: Record<string, string[]> = {};
const buffers = new Map<string, Buffer>();
const composite: sharp.OverlayOptions[] = [];
let cell = 0;
for (const animation of names) {
  for (const layer of CHARACTER_LAYERS) {
    const key = animationKey(animation, layer);
    animations[key] = [];
    for (
      let index = 0;
      index < CHARACTER_ANIMATIONS[animation].frames;
      index++
    ) {
      const name = `${key}-${index}`;
      const x = (cell % columns) * stride + 2,
        y = Math.floor(cell / columns) * stride + 2;
      const png = await sharp(Buffer.from(frame(animation, index, layer)))
        .png()
        .toBuffer();
      buffers.set(name, png);
      composite.push({ input: png, left: x, top: y });
      frames[name] = {
        frame: { x, y, w: 160, h: 160 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 160, h: 160 },
        sourceSize: { w: 160, h: 160 },
      };
      animations[key]!.push(name);
      cell++;
    }
  }
}
await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
  .composite(composite)
  .png()
  .toFile(fileURLToPath(new URL('engineer.png', directory)));
await writeFile(
  new URL('engineer.json', directory),
  JSON.stringify({
    frames,
    animations,
    meta: {
      image: 'engineer.png',
      format: 'RGBA8888',
      size: { w: width, h: height },
      scale: '1',
    },
  }),
);

// Shareable review sheets use the same three layers and multiplicative suit tint as Pixi.
async function assembled(
  animation: CharacterAnimation,
  index: number,
  color: string,
) {
  const layers: sharp.OverlayOptions[] = [];
  for (const layer of CHARACTER_LAYERS) {
    let input = buffers.get(`${animationKey(animation, layer)}-${index}`)!;
    if (layer === 'suit') {
      const rgb = [1, 3, 5].map(
        (i) => parseInt(color.slice(i, i + 2), 16) / 255,
      );
      input = await sharp(input)
        .recomb([
          [rgb[0]!, 0, 0],
          [0, rgb[1]!, 0],
          [0, 0, rgb[2]!],
        ])
        .png()
        .toBuffer();
    }
    layers.push({ input, left: 0, top: 0 });
  }
  return sharp({
    create: { width: 160, height: 160, channels: 4, background: '#00000000' },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
const reviewDir = new URL('docs/art/', root);
await mkdir(reviewDir, { recursive: true });
const lineup: sharp.OverlayOptions[] = [];
const floor = await sharp(
  fileURLToPath(
    new URL('packages/client/public/assets/station/station.png', root),
  ),
)
  .extract({ left: 2, top: 2, width: 256, height: 256 })
  .png()
  .toBuffer();
for (let y = 0; y < 640; y += 256)
  for (let x = 0; x < 1152; x += 256)
    lineup.push({
      input: await sharp(floor)
        .resize(Math.min(256, 1152 - x), Math.min(256, 640 - y))
        .png()
        .toBuffer(),
      left: x,
      top: y,
    });
for (const [i, color] of COLORS.entries()) {
  const x = (i % 6) * 192 + 16,
    y = Math.floor(i / 6) * 250 + 80;
  lineup.push({
    input: Buffer.from(
      `<svg width="160" height="160"><ellipse cx="80" cy="148" rx="27" ry="9" fill="#091219" opacity=".6"/></svg>`,
    ),
    left: x,
    top: y,
  });
  lineup.push({
    input: await assembled('idle', 0, color.hex),
    left: x,
    top: y,
  });
  lineup.push({
    input: Buffer.from(
      `<svg width="192" height="40"><rect x="8" width="176" height="36" rx="4" fill="#102029"/><text x="96" y="25" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#dde6e4">${color.number} · ${color.name}</text></svg>`,
    ),
    left: x - 16,
    top: y + 172,
  });
}
await sharp({
  create: { width: 1152, height: 640, channels: 4, background: '#091219' },
})
  .composite(lineup)
  .png()
  .toFile(fileURLToPath(new URL('engineer-lineup.png', reviewDir)));
const contact: sharp.OverlayOptions[] = [];
for (const [row, animation] of names.entries()) {
  contact.push({
    input: Buffer.from(
      `<svg width="1280" height="32"><text x="12" y="23" font-family="sans-serif" font-size="20" fill="#dde6e4">${animation} · ${CHARACTER_ANIMATIONS[animation].frames} frames</text></svg>`,
    ),
    left: 0,
    top: row * 192,
  });
  for (let i = 0; i < CHARACTER_ANIMATIONS[animation].frames; i++)
    contact.push({
      input: await assembled(animation, i, COLORS[0].hex),
      left: i * 160,
      top: row * 192 + 32,
    });
}
await sharp({
  create: {
    width: 1280,
    height: names.length * 192,
    channels: 4,
    background: '#263b43',
  },
})
  .composite(contact)
  .png()
  .toFile(fileURLToPath(new URL('engineer-animations.png', reviewDir)));
console.log(
  `Built engineer atlas: ${total} layered frames, ${width} × ${height}; review sheets in docs/art.`,
);
