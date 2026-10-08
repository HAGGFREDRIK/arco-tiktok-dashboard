// Bygger de tre datafilerna som dashboard-artifacten läser, ur site/data/.
// Användning: node scripts/artifact-rows.mjs <utkatalog>
// Skriver tiktok_videos.json, tiktok_insights.json och tiktok_thumbs.json och skriver ut en sammanfattning.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('Ange en utkatalog.');
  process.exit(1);
}
await mkdir(out, { recursive: true });

const read = (name) => readFile(new URL(`../site/data/${name}`, import.meta.url)).then((b) => JSON.parse(b));
const d = await read('videos.json');
const ins = await read('insights.json').catch(() => ({ videos: {} }));
const th = await read('thumbs.json').catch(() => ({ thumbs: {} }));

const ids = new Set(d.videos.map((v) => String(v.id)));
const videos = d.videos.map((v) => ({
  id: String(v.id), handle: v.handle, text: v.text.replace(/\s+/g, ' ').trim(), posted: v.posted, url: v.url,
  duration: v.duration, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves,
  er: Math.round(v.er * 1e5) / 1e5, fetched: d.fetchedAt,
}));
const insights = Object.entries(ins.videos)
  .filter(([id]) => ids.has(String(id)))
  .map(([id, a]) => ({
    id: String(id), handle: a.handle, format: a.format, topic: a.topic, hook: a.hook, why: a.why,
    drivers: a.drivers.join(' · '), described: a.described, analyzed: a.analyzedAt,
  }));
const thumbs = Object.entries(th.thumbs).filter(([id]) => ids.has(String(id))).map(([id, thumb]) => ({ id: String(id), thumb }));

await writeFile(join(out, 'tiktok_videos.json'), JSON.stringify(videos));
await writeFile(join(out, 'tiktok_insights.json'), JSON.stringify(insights));
await writeFile(join(out, 'tiktok_thumbs.json'), JSON.stringify(thumbs));

const top = [...videos].filter((v) => Date.parse(v.posted) >= Date.parse(d.fetchedAt) - 7 * 864e5 && v.views >= 5000).sort((a, b) => b.er - a.er)[0];
console.log(JSON.stringify({
  fetchedAt: d.fetchedAt,
  videos: videos.length,
  accounts: [...new Set(videos.map((v) => v.handle))],
  insights: insights.length,
  thumbs: thumbs.length,
  topWeek: top && { handle: top.handle, er: top.er, views: top.views, text: top.text.slice(0, 80) },
}, null, 2));
