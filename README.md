# ARCO TikTok-topplista

Topp 10 TikTok-videor per konkurrentkonto, rankade på engagement rate
(likes + kommentarer + delningar) / visningar, för senaste 7 eller 30 dagarna.

- `config/accounts.json` konton som bevakas, hur långt bakåt och max antal videor per konto
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
