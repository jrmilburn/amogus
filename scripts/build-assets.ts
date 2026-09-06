import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { roomPropArtwork } from './station-props.js';

// Original, deterministic material and fixture art. One padded atlas, no remote assets.
const size = 256,
  padding = 2,
  stride = size + padding * 2;
const frame = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${body}</svg>`;
const rivets = [
  [12, 12],
  [244, 12],
  [12, 244],
  [244, 244],
]
  .map(
    ([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="3" fill="#657579"/><path d="M${x! - 2} ${y}h4" stroke="#172327"/>`,
  )
  .join('');
const assets: Record<string, string> = {
  ...roomPropArtwork,
  floor: frame(
    `<rect width="256" height="256" fill="#35464c"/><rect x="3" y="3" width="250" height="250" rx="8" fill="#3e5157" stroke="#1d2b31" stroke-width="5"/><path d="M9 20V9h238M12 236h232" fill="none" stroke="#617278" stroke-opacity=".5"/><path d="M20 60h216M20 64h216M20 192h216M20 196h216" stroke="#34454b"/>${rivets}<path d="M180 30h40m-30 7h30" stroke="#809092" stroke-opacity=".23"/>`,
  ),
  grate: frame(
    `<rect width="256" height="256" fill="#1d2c32"/><rect x="5" y="5" width="246" height="246" rx="4" fill="#35454b" stroke="#132027" stroke-width="7"/>${Array.from({ length: 12 }, (_, i) => `<rect x="24" y="${18 + i * 19}" width="208" height="10" rx="3" fill="#16262d"/><path d="M24 ${19 + i * 19}h208" stroke="#56666b"/>`).join('')}${rivets}`,
  ),
  wall: frame(
    `<rect width="256" height="256" fill="#26353c"/><path d="M0 0h256v48H0z" fill="#53636b"/><path d="M0 50h256M0 232h256" stroke="#0a151b" stroke-width="8"/><path d="M32 56v164M224 56v164" stroke="#13232b" stroke-width="12"/><path d="M44 60v160M236 60v160" stroke="#52616a" stroke-width="3"/><rect x="80" y="88" width="96" height="64" rx="8" fill="#1b2c34"/>`,
  ),
  console: frame(
    `<rect x="24" y="40" width="208" height="208" rx="18" fill="#09151b" opacity=".6"/><rect x="20" y="12" width="216" height="208" rx="18" fill="#5f7176" stroke="#12242d" stroke-width="8"/><rect x="38" y="28" width="180" height="114" rx="8" fill="#152d37" stroke="#819497" stroke-width="4"/><path d="M56 106l28-25 24 8 22-36 28 25h36" fill="none" stroke="#81b9b4" stroke-width="6"/><path d="M54 125h148M54 44h22" stroke="#4d787f" stroke-width="4"/><rect x="42" y="162" width="120" height="32" rx="5" fill="#293d47"/><path d="M50 173h104M50 183h104" stroke="#657f85" stroke-width="3"/><circle cx="194" cy="178" r="17" fill="#e6a65a"/><circle cx="194" cy="178" r="7" fill="#f2d7a1"/>`,
  ),
  vent: frame(
    `<rect x="15" y="34" width="226" height="206" rx="18" fill="#08131a" opacity=".65"/><rect x="12" y="12" width="232" height="216" rx="15" fill="#576a72" stroke="#152a34" stroke-width="8"/><rect x="28" y="28" width="200" height="184" rx="9" fill="#1b2d36"/>${Array.from({ length: 7 }, (_, i) => `<path d="M40 ${48 + i * 23}h176" stroke="#7a8b8f" stroke-width="12"/><path d="M40 ${55 + i * 23}h176" stroke="#344a55" stroke-width="4"/>`).join('')}`,
  ),
  crate: frame(
    `<rect x="20" y="28" width="220" height="220" rx="18" fill="#071319" opacity=".55"/><rect x="12" y="10" width="220" height="220" rx="16" fill="#526b70" stroke="#1b303a" stroke-width="8"/><rect x="36" y="34" width="172" height="172" rx="8" fill="#3c555f" stroke="#80908f" stroke-width="3"/><path d="M60 40v160M184 40v160" stroke="#283f4a" stroke-width="14"/><rect x="82" y="95" width="80" height="40" fill="#a6ac9b"/><path d="M95 107h54M95 118h36" stroke="#516367" stroke-width="5"/>`,
  ),
  tank: frame(
    `<ellipse cx="128" cy="150" rx="106" ry="98" fill="#08151c" opacity=".65"/><rect x="38" y="16" width="180" height="206" rx="80" fill="#5a7880" stroke="#142d3a" stroke-width="8"/><ellipse cx="128" cy="80" rx="81" ry="64" fill="#74949b"/><ellipse cx="128" cy="80" rx="62" ry="45" fill="#304f5d"/><path d="M60 160q68 44 136 0" fill="none" stroke="#a4b1ac" stroke-width="12"/><rect x="104" y="55" width="48" height="45" rx="7" fill="#a5bfc0"/><path d="M128 60v35M110 78h36" stroke="#375562" stroke-width="6"/>`,
  ),
  emergency: frame(
    `<ellipse cx="128" cy="150" rx="122" ry="104" fill="#08151c" opacity=".65"/><circle cx="128" cy="124" r="116" fill="#5c7278" stroke="#1b303a" stroke-width="10"/><circle cx="128" cy="124" r="90" fill="#233b46" stroke="#93a09a" stroke-width="3"/><path d="M44 124h30m108 0h30M128 40v30m0 108v30" stroke="#e6a65a" stroke-width="8"/><circle cx="128" cy="124" r="48" fill="#b45842" stroke="#eda479" stroke-width="8"/><circle cx="128" cy="114" r="29" fill="#d98357"/>`,
  ),
  lamp: frame(
    `<rect x="8" y="87" width="240" height="90" rx="16" fill="#142831"/><rect x="24" y="103" width="208" height="48" rx="10" fill="#b88044"/><rect x="32" y="110" width="192" height="28" rx="8" fill="#f3c681"/><path d="M70 98v62M186 98v62" stroke="#263b43" stroke-width="10"/>`,
  ),
  glow: frame(
    `<defs><radialGradient id="g"><stop stop-color="#f4ba6c" stop-opacity=".65"/><stop offset=".45" stop-color="#e69949" stop-opacity=".17"/><stop offset="1" stop-color="#dc883b" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="128" fill="url(#g)"/>`,
  ),
};
const names = Object.keys(assets),
  columns = 4,
  rows = Math.ceil(names.length / columns);
const frames: Record<string, unknown> = {};
const layers = await Promise.all(
  names.map(async (name, i) => {
    const x = (i % columns) * stride + padding,
      y = Math.floor(i / columns) * stride + padding;
    frames[name] = {
      frame: { x, y, w: size, h: size },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: size, h: size },
      sourceSize: { w: size, h: size },
    };
    return {
      input: await sharp(Buffer.from(assets[name]!)).png().toBuffer(),
      left: x,
      top: y,
    };
  }),
);
const directory = fileURLToPath(
  new URL('../packages/client/public/assets/station/', import.meta.url),
);
await mkdir(directory, { recursive: true });
await sharp({
  create: {
    width: columns * stride,
    height: rows * stride,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(layers)
  .png()
  .toFile(`${directory}/station.png`);
await writeFile(
  `${directory}/station.json`,
  JSON.stringify({
    frames,
    meta: {
      image: 'station.png',
      format: 'RGBA8888',
      size: { w: columns * stride, h: rows * stride },
      scale: '1',
    },
  }),
);
console.log(
  `Built station atlas: ${names.length} original textures, ${columns * stride} × ${rows * stride}.`,
);
