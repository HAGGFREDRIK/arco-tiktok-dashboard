// Kör clockworks/tiktok-scraper för alla kunders konkurrenter i config/clients.json
// och sparar en normaliserad lista i site/data/videos.json.
// Kräver APIFY_TOKEN i miljön (lokalt via .env, i GitHub Actions som secret).

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ACTOR = 'clockworks~tiktok-scraper';
const API = 'https://api.apify.com/v2';
const token = process.env.APIFY_TOKEN;

if (!token) {
  console.error('APIFY_TOKEN saknas. Lägg den i .env (se .env.example).');
  process.exit(1);
}

const config = JSON.parse(await readFile(new URL('../config/clients.json', import.meta.url)));
const handles = [...new Set(config.clients.flatMap((c) => c.competitors.map((h) => h.toLowerCase())))];
if (!handles.length) {
  console.log('Inga konkurrenter inlagda för någon kund, ingen hämtning.');
  process.exit(0);
}

const input = {
  profiles: handles,
  profileScrapeSections: ['videos'],
  profileSorting: 'latest',
  resultsPerPage: config.maxVideosPerAccount,
  oldestPostDateUnified: `${config.daysBack} days`,
  excludePinnedPosts: false,
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadSubtitles: false,
  shouldDownloadSlideshowImages: false,
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
  return res.json();
}

console.log(`Startar ${ACTOR} för ${handles.length} konton, ${config.daysBack} dagar bakåt …`);
const { data: run } = await api(`/acts/${ACTOR}/runs`, { method: 'POST', body: JSON.stringify(input) });
console.log(`Körning ${run.id}: https://console.apify.com/actors/runs/${run.id}`);

let status = run.status;
while (['READY', 'RUNNING'].includes(status)) {
  await new Promise((r) => setTimeout(r, 10_000));
  const { data } = await api(`/actor-runs/${run.id}`);
  status = data.status;
  process.stdout.write(`  ${status} …\n`);
}
if (status !== 'SUCCEEDED') {
  console.error(`Körningen slutade med ${status}.`);
  process.exit(1);
}

const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);

const videos = items
  .filter((v) => v.id && v.authorMeta)
  .map((v) => {
    const views = v.playCount ?? 0;
    const likes = v.diggCount ?? 0;
    const comments = v.commentCount ?? 0;
    const shares = v.shareCount ?? 0;
    const saves = v.collectCount ?? 0;
    const handle = v.authorMeta.name?.toLowerCase();
    return {
      id: v.id,
      handle,
      author: v.authorMeta.nickName || handle,
      avatar: v.authorMeta.avatar ?? null,
      followers: v.authorMeta.fans ?? null,
      url: v.webVideoUrl,
      text: v.text ?? '',
      posted: v.createTimeISO,
      duration: v.videoMeta?.duration ?? null,
      cover: v.videoMeta?.coverUrl ?? null,
      views,
      likes,
      comments,
      shares,
      saves,
      er: views > 0 ? (likes + comments + shares) / views : 0,
    };
  });

await mkdir(new URL('../site/data/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../site/data/videos.json', import.meta.url),
  JSON.stringify({ fetchedAt: new Date().toISOString(), runId: run.id, daysBack: config.daysBack, videos }, null, 2),
);

const perAccount = Object.groupBy(videos, (v) => v.handle);
for (const h of handles) console.log(`  @${h}: ${perAccount[h]?.length ?? 0} videor`);
console.log(`Sparade ${videos.length} videor i site/data/videos.json`);
