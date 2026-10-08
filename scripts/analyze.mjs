// Tar topp 10 per kund senaste 7 dagarna (engagement, minst 5 000 visningar, bland kundens konkurrenter i config/clients.json),
// låter Apify AI-beskriva videorna scen för scen och ber Claude förklara vad de handlar om
// och varför de troligen presterade. Resultatet sparas i site/data/insights.json.
// Videor som redan analyserats hoppas över, så samma video kostar bara en gång.
// Kräver APIFY_TOKEN och ANTHROPIC_API_KEY.

import { readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const DAYS = 7;
const MIN_VIEWS = 5000;
const ACTOR = 'clockworks~tiktok-scraper';
const API = 'https://api.apify.com/v2';

for (const key of ['APIFY_TOKEN', 'ANTHROPIC_API_KEY']) {
  if (!process.env[key]) {
    console.error(`${key} saknas.`);
    process.exit(1);
  }
}

const videosFile = new URL('../site/data/videos.json', import.meta.url);
const insightsFile = new URL('../site/data/insights.json', import.meta.url);

const { fetchedAt, videos } = JSON.parse(await readFile(videosFile));
const { clients } = JSON.parse(await readFile(new URL('../config/clients.json', import.meta.url)));
const insights = await readFile(insightsFile).then((b) => JSON.parse(b)).catch(() => ({ videos: {} }));

const ref = Date.parse(fetchedAt);
const recent = videos.filter((v) => Date.parse(v.posted) >= ref - DAYS * 864e5 && v.views >= MIN_VIEWS);
const top = new Map();
for (const c of clients) {
  const own = new Set(c.competitors.map((h) => h.toLowerCase()));
  const best = recent.filter((v) => own.has(v.handle)).sort((a, b) => b.er - a.er).slice(0, 10);
  for (const v of best) top.set(v.id, v);
  if (best.length) console.log(`  ${c.name}: ${best.length} videor i topp 10`);
}
const missing = [...top.values()].filter((v) => !insights.videos[v.id]);

console.log(`Topp 10 per kund senaste ${DAYS} dagarna: ${top.size} unika videor, ${missing.length} nya att analysera.`);
if (!missing.length) process.exit(0);

// 1. AI-beskrivning av videorna via Apify
async function apify(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
  return res.json();
}

const { data: run } = await apify(`/acts/${ACTOR}/runs`, {
  method: 'POST',
  body: JSON.stringify({
    postURLs: missing.map((v) => v.url),
    aiVideoDescription: true,
    downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
  }),
});
console.log(`AI-beskrivning, körning ${run.id}: https://console.apify.com/actors/runs/${run.id}`);

let status = run.status;
while (['READY', 'RUNNING'].includes(status)) {
  await new Promise((r) => setTimeout(r, 10_000));
  ({ data: { status } } = await apify(`/actor-runs/${run.id}`));
  console.log(`  ${status} …`);
}
if (status !== 'SUCCEEDED') {
  console.error(`Körningen slutade med ${status}.`);
  process.exit(1);
}
const items = await apify(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
const describedById = Object.fromEntries(items.filter((i) => i.id).map((i) => [String(i.id), i.videoMeta?.aiVideoDescription ?? null]));

// 2. Claude förklarar innehåll och prestation
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const baseline = (handle) => {
  const own = videos.filter((v) => v.handle === handle);
  return { videos: own.length, medianViews: median(own.map((v) => v.views)), medianEr: median(own.map((v) => v.er)) };
};

const Insight = z.object({
  topic: z.string().describe('Vad videon handlar om, en till två meningar.'),
  format: z.string().describe('Kort etikett för formatet, t.ex. Tävling, Trend, Recept, Produktnyhet, Sketch.'),
  hook: z.string().describe('Hur videon fångar tittaren de första sekunderna, en mening.'),
  why: z.string().describe('Varför videon troligen presterade bättre än kontots vanliga nivå, två till tre meningar.'),
  drivers: z.array(z.string()).describe('Högst tre korta drivkrafter bakom resultatet.'),
});

const SYSTEM = `Du analyserar TikTok-videor åt ARCO, en svensk byrå som följer konkurrenter till sina kunder.
För varje video får du kontot, videotexten, siffrorna, kontots normala nivå och en AI-genererad beskrivning av vad som syns och hörs scen för scen.
Skriv på svenska, kort och konkret, för en kreatör som vill förstå vad som fungerar.
Utgå från det som faktiskt finns i underlaget. Om beskrivningen saknas, säg att analysen bara bygger på texten och siffrorna.
Förklara prestationen i relation till kontots normala nivå, och nämn mekanismer som tävlingar, trender, igenkänning, kändisar eller samarbeten när underlaget visar dem.`;

const client = new Anthropic();
const pct = (x) => (x * 100).toFixed(1) + ' %';

for (const v of missing) {
  const base = baseline(v.handle);
  const description = describedById[String(v.id)];
  const prompt = [
    `Konto: @${v.handle}`,
    `Publicerad: ${v.posted.slice(0, 10)}, längd ${v.duration ?? 'okänd'} s`,
    `Videotext: ${v.text || '(ingen)'}`,
    `Siffror: ${v.views} visningar, ${v.likes} likes, ${v.comments} kommentarer, ${v.shares} delningar, ${v.saves} sparade, engagement ${pct(v.er)}`,
    `Kontots normala nivå (${base.videos} videor senaste 30 dagarna): medianvisningar ${Math.round(base.medianViews)}, median-engagement ${pct(base.medianEr)}`,
    `AI-beskrivning av videon:\n${description ? (typeof description === 'string' ? description : JSON.stringify(description)) : '(saknas)'}`,
  ].join('\n');

  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Insight) },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      console.error(`  @${v.handle} ${v.id}: ingen analys (${response.stop_reason}).`);
      continue;
    }
    insights.videos[v.id] = {
      ...response.parsed_output,
      handle: v.handle,
      described: Boolean(description),
      analyzedAt: new Date().toISOString(),
      model: response.model,
    };
    console.log(`  @${v.handle}: ${response.parsed_output.format}, ${response.parsed_output.topic.slice(0, 70)}`);
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`  @${v.handle} ${v.id}: Claude ${error.status} ${error.message}`);
    else throw error;
  }
}

insights.updatedAt = new Date().toISOString();
await writeFile(insightsFile, JSON.stringify(insights, null, 2));
console.log(`Sparade ${Object.keys(insights.videos).length} analyser i site/data/insights.json`);
