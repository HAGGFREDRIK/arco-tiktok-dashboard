// Lägger till eller tar bort konkurrenter för en kund i config/clients.json.
// Körs av formuläret "Ändra konkurrenter" i GitHub Actions, men fungerar även lokalt:
//   KUND="PROfeel" LAGG_TILL="https://www.tiktok.com/@oatly, @barebells" TA_BORT="" node scripts/competitors.mjs
// Tar emot TikTok-länkar, @namn eller bara namn, separerade med komma, mellanslag eller radbrytning.

import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../config/clients.json', import.meta.url);
const config = JSON.parse(await readFile(file));

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const parse = (input) =>
  String(input ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const fromUrl = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/);
      const handle = (fromUrl ? fromUrl[1] : s.replace(/^@/, '')).toLowerCase();
      if (!/^[a-z0-9._]{2,24}$/.test(handle)) fail(`"${s}" ser inte ut som ett TikTok-konto.`);
      return handle;
    });

const name = process.env.KUND;
const client = config.clients.find((c) => c.name === name);
if (!client) fail(`Hittar ingen kund som heter "${name}". Kunder: ${config.clients.map((c) => c.name).join(', ')}`);

const add = parse(process.env.LAGG_TILL);
const remove = new Set(parse(process.env.TA_BORT));
const before = [...client.competitors];

let next = client.competitors.filter((h) => !remove.has(h));
for (const h of add) if (!next.includes(h)) next.push(h);
if (next.length > config.maxCompetitors) {
  fail(`${name} skulle få ${next.length} konkurrenter, max är ${config.maxCompetitors}. Ta bort några först.`);
}
client.competitors = next;

const added = next.filter((h) => !before.includes(h));
const removed = before.filter((h) => !next.includes(h));
const notFound = [...remove].filter((h) => !before.includes(h));

await writeFile(file, JSON.stringify(config, null, 2) + '\n');

const lines = [
  `### ${name}: ${next.length} av ${config.maxCompetitors} konkurrenter`,
  added.length ? `Tillagda: ${added.map((h) => '@' + h).join(', ')}` : 'Inga tillagda.',
  removed.length ? `Borttagna: ${removed.map((h) => '@' + h).join(', ')}` : 'Inga borttagna.',
  notFound.length ? `Fanns inte i listan: ${notFound.map((h) => '@' + h).join(', ')}` : '',
  '',
  next.map((h) => `- @${h}`).join('\n') || '_Inga konkurrenter än._',
].filter((l) => l !== '');
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
