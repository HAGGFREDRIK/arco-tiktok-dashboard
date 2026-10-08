// Laddar ner omslagsbilderna i site/data/videos.json innan TikToks signerade länkar går ut,
// skalar ner dem till små 9:16-miniatyrer och sparar dem som data-URL:er i site/data/thumbs.json.
// Miniatyrer som redan finns hämtas inte igen. Videor som inte längre finns i datan rensas bort.

import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const WIDTH = 96;
const HEIGHT = 128;

const videosFile = new URL('../site/data/videos.json', import.meta.url);
const thumbsFile = new URL('../site/data/thumbs.json', import.meta.url);

const { videos } = JSON.parse(await readFile(videosFile));
const old = await readFile(thumbsFile).then((b) => JSON.parse(b).thumbs).catch(() => ({}));

const thumbs = {};
let fetched = 0;
let failed = 0;
for (const v of videos) {
  if (old[v.id]) {
    thumbs[v.id] = old[v.id];
    continue;
  }
  if (!v.cover) continue;
  try {
    const res = await fetch(v.cover);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(WIDTH, HEIGHT, { fit: 'cover' })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    thumbs[v.id] = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    fetched++;
  } catch (error) {
    failed++;
    console.error(`  @${v.handle} ${v.id}: ${error.message}`);
  }
}

await writeFile(thumbsFile, JSON.stringify({ updatedAt: new Date().toISOString(), thumbs }));
const kb = Math.round(Buffer.byteLength(JSON.stringify(thumbs)) / 1024);
console.log(`Miniatyrer: ${Object.keys(thumbs).length} totalt, ${fetched} nya, ${failed} misslyckades, ${kb} kB`);
