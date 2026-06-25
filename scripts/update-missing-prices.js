#!/usr/bin/env node
// Fetches prices from Steam for all released games that have no price set,
// then writes the updated records back to Google Sheets via the Apps Script API.
//
// Usage:
//   SHEET_URL=<your-apps-script-deploy-url> node scripts/update-missing-prices.js
//
// Options:
//   --dry-run   Print what would be updated without writing anything

'use strict';

const STEAM_PROXY = 'https://steam-proxy-cm26.carmine-migliore26.workers.dev';
const DELAY_MS = 1000; // polite delay between Steam API requests
const DRY_RUN = process.argv.includes('--dry-run');

const SHEET_URL = process.env.SHEET_URL;
if (!SHEET_URL) {
  console.error('Error: SHEET_URL environment variable is required.');
  console.error('  export SHEET_URL=https://script.google.com/macros/s/.../exec');
  process.exit(1);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normaliseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
  if (/^\d{10,13}$/.test(String(raw))) {
    const ms = String(raw).length <= 10 ? Number(raw) * 1000 : Number(raw);
    const d = new Date(ms);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const fd = new Date(String(raw));
  if (!isNaN(fd) && fd.getFullYear() > 1900) {
    return `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}-${String(fd.getDate()).padStart(2, '0')}`;
  }
  return String(raw);
}

function isReleased(game) {
  const date = normaliseDate(game.releaseDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; // TBA / text date → not released
  return date <= todayISO();
}

function hasNoPrice(game) {
  const p = game.price;
  return p === undefined || p === null || String(p).trim() === '';
}

async function fetchAllGames() {
  const url = `${SHEET_URL}?action=getAll&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getAll failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchSteamPrice(appId) {
  const url = `${STEAM_PROXY}/?appid=${appId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam proxy HTTP ${res.status}`);
  const json = await res.json();
  const entry = json[String(appId)];
  if (!entry || !entry.success || !entry.data) return null;
  const d = entry.data;
  if (d.price_overview && d.price_overview.initial != null) {
    return (d.price_overview.initial / 100).toFixed(2);
  }
  if (d.is_free) return '0.00';
  return null;
}

async function writeRows(records) {
  const res = await fetch(`${SHEET_URL}?action=setRows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`setRows failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`setRows error: ${json.error}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log('Fetching all games from Google Sheets…');

  const games = await fetchAllGames();
  console.log(`Total games: ${games.length}`);

  const targets = games.filter(g => isReleased(g) && hasNoPrice(g) && g.steamAppId);
  console.log(`Released with no price and a Steam App ID: ${targets.length}`);

  if (targets.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  const updated = [];
  let skipped = 0;

  for (const game of targets) {
    process.stdout.write(`  [${game.steamAppId}] ${game.title} … `);
    try {
      const price = await fetchSteamPrice(game.steamAppId);
      if (price === null) {
        console.log('no price data, skipping');
        skipped++;
      } else {
        console.log(`€${price}`);
        updated.push({ ...game, price });
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}, skipping`);
      skipped++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nResults: ${updated.length} to update, ${skipped} skipped`);

  if (updated.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry-run — would update:');
    updated.forEach(g => console.log(`  ${g.title} (${g.steamAppId}) → €${g.price}`));
  } else {
    console.log('Writing updated records to Google Sheets…');
    await writeRows(updated);
    console.log('Done.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
