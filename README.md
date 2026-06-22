# Building the Backlog

A personal game backlog manager that runs entirely in the browser — no build step, no framework. Track your wishlist and collection with optional cloud sync via Google Sheets.

---

## Features

### Wishlist
- Add games with title, genres, platforms, release date, priority, and hotness (hype) score
- Move games between wishlist → pre-order → bought
- Soft-delete with one-click reinstate
- DLC management — nest DLC under parent games with a mini-cover shelf
- Hotness bar (0–100) for tracking current interest

### Collection
- Per-platform entries — each platform tracks its own store, cost, purchase date, and play status
- Eight play statuses: `UP` · `IP` · `COM` · `SUP` · `UF` · `PDP` · `WNC` · `WNP`
- Filter by platform (any / exclusive), Steam collection, genre, or play status

### Game Details
- Steam cover art via App ID (or custom image URL)
- Developer, publisher, and store links (Steam, gg.deals, SteamDB)
- 5-star personal rating and written review
- Timestamped notes per game
- Release date, added date, and purchase date all displayed as `dd mmm yyyy`

### Filtering & Sorting
- Wishlist: filter by genre (AND/OR), tag (AND/OR), priority, hotness range
- Collection: filter by platform (any/exclusive), Steam collection (AND/OR), genre, play status
- Sort by hotness, priority, title, release date, price, added date, or Steam collection
- Group by priority, genre, platform, or year
- All filter/sort/view state persisted in the URL hash — shareable and survives refresh

### Views
- **Grid** — card layout with cover art
- **List** — compact two-column view with thumbnails
- **Calendar** — monthly release calendar with TBA list

### Data & Sync
- **Google Sheets backend** — games live in a spreadsheet, synced via Google Apps Script
- **LocalStorage fallback** — works fully offline when no `SHEET_URL` is configured
- Export / import JSON backups
- Visual sync status indicator (idle / syncing / ok / error / offline)

### PWA
- Installable as a home-screen app
- Service worker for offline caching (cache-first for assets, always-fresh for HTML)
- **Web Share Target** — share a Steam store URL from any Android app directly into BtB; a picker lets you add it to Wishlist or Collection

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `/` | Focus search |
| `A` | Add game |
| `C` | Open calendar |
| `G` | Grid view |
| `L` | List view |
| `Esc` | Close panel / modal |

---

## File Structure

```
index.html              — app shell and markup
app.js                  — all application logic
style.css               — styles (dark theme only)
sw.js                   — service worker (caching)
manifest.json           — PWA manifest
btb-url.js              — runtime config: sets window.BTB_SHEET_URL (not committed)
config.example.js       — template for local config
google-apps-script/
  Code.gs               — Google Apps Script backend
.github/workflows/
  pages.yml             — deploys to GitHub Pages, injects SHEET_URL secret into btb-url.js
```

---

## Getting Started

### Option A — Offline / Local (no sync)

1. Clone or download this repository.
2. Open `index.html` in any modern browser.

Games are saved in `localStorage`. No network required.

### Option B — Cloud Sync via Google Sheets

1. Create a Google Sheet.
2. Open **Extensions → Apps Script**, paste the contents of `google-apps-script/Code.gs`, and save.
3. Click **Deploy → New deployment** (Execute as: Me, Who has access: Anyone).
4. Copy the Web App URL.
5. Copy `config.example.js` to `btb-url.js` and paste your URL:

```js
window.BTB_SHEET_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

6. Open `index.html`. The sync indicator turns green when connected.

### Option C — GitHub Pages (hosted)

1. Fork the repository.
2. Go to **Settings → Secrets and variables → Actions** and create a secret named `SHEET_URL` with your Apps Script URL.
3. Push to `main`. The `pages.yml` workflow injects the secret into `btb-url.js` and deploys to the `gh-pages` branch.

---

## Apps Script API

The `Code.gs` web app handles these `action` values:

| `action` | Description |
|----------|-------------|
| `getAll` | Returns all game records |
| `getMeta` | Returns genre/tag metadata |
| `getPlatStores` | Returns platform-specific store options |
| `save` | Writes a single game record |
| `delete` | Removes a game by ID |

Requests use either JSONP (`?callback=fn`) or plain JSON (CORS), whichever the browser supports.

---

## Data Model

```jsonc
{
  "id": "1700000000000",
  "title": "Game Title",
  "status": "wishlist",           // "wishlist" | "bought"
  "steamAppId": 123456,
  "genres": ["RPG", "Action"],
  "platforms": ["PC", "PS5"],
  "priority": "high",             // "high" | "medium" | "low"
  "hotness": 85,                  // 0–100
  "releaseDate": "2025-11-15",    // ISO 8601, or "" for TBA
  "tbaText": "Q4 2025",
  "price": "£49.99",              // listed price
  "developer": "Studio Name",
  "publisher": "Publisher Name",
  "cover": "https://...",         // custom cover URL (overrides Steam art)
  "storeLink": "https://...",
  "type": "game",                 // "game" | "dlc"
  "parentAppId": 0,               // Steam App ID of parent (DLC only)
  "tags": ["Coop", "Couch"],
  "myRating": 4,                  // 1–5
  "myReview": "...",
  "added": 1700000000000,         // epoch ms
  "cancelled": false,
  "notes": [
    { "id": "n1", "text": "...", "timestamp": 1700000000000 }
  ],
  "platforms_data": {             // per-platform collection entries
    "PC": {
      "store": "Steam",
      "cost": 29.99,
      "purchaseDate": "15 Jun 2025",
      "playStatus": "IP"
    }
  }
}
```

---

## Browser Support

Requires a modern browser with ES6, LocalStorage, Fetch API, CSS Grid, and CSS Custom Properties. Service Workers add offline support but degrade gracefully without.

---

## License

Personal project — no license. Fork and adapt freely.
