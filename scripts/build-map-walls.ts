import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'prettier';
import { fileURLToPath } from 'node:url';
import {
  buildCollisionWalls,
  MapDefSchema,
  MapStructureSchema,
} from '@mutiny/shared/maps';

const path = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(
      new URL('../packages/shared/maps/the-hollow.json', import.meta.url),
    );
// Validate the authored layout before generating collision, then validate the result.
const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
const map = MapStructureSchema.parse(input);
map.walls = buildCollisionWalls(map);
MapDefSchema.parse(map);
await writeFile(path, await format(JSON.stringify(map), { parser: 'json' }));
console.log(`Wrote ${map.walls.length} collision rectangles to ${path}`);
