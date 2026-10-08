# ARCO TikTok-topplista

Topp 10 TikTok-videor per konkurrentkonto, rankade på engagement rate
(likes + kommentarer + delningar) / visningar, för senaste 7 eller 30 dagarna.

- `config/clients.json` ARCO:s kunder med content planner och deras konkurrenter (max 10 per kund). Ändras via Actions → Ändra konkurrenter
- `scripts/fetch.mjs` kör Apify-actorn `clockworks/tiktok-scraper` och sparar `site/data/videos.json`
- `site/index.html` dashboarden, statisk, läser JSON-filen
- `.github/workflows/fetch.yml` hämtar ny data varje måndag och committar den

## Lokalt

    cp .env.example .env   # lägg in APIFY_TOKEN
    npm run fetch
    npm run dev            # http://localhost:4321

## GitHub

Lägg `APIFY_TOKEN` under Settings → Secrets and variables → Actions.
Kör manuellt under Actions → Hämta TikTok-data → Run workflow.

Kostnad: cirka $3,70 per 1 000 videor (Apify-pris för actorn).

## AI-analys

`npm run analyze` tar topp 10 senaste 7 dagarna (engagement, minst 5 000 visningar),
låter Apify AI-beskriva videorna (`aiVideoDescription`, $0,0013 per videosekund) och ber
Claude (`claude-opus-5-5`) förklara vad de handlar om och varför de troligen presterade.
Resultatet hamnar i `site/data/insights.json`. Redan analyserade videor hoppas över.
Kräver `ANTHROPIC_API_KEY` som secret i GitHub.
