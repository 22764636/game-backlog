# Building the Backlog

A personal game backlog manager that runs entirely in the browser — no build step, no server, no framework. Track your wishlist, collection, and play progress with optional cloud sync via Google Sheets.

---

## Features

### Wishlist & Collection
- Add games with title, genres, platforms, release date, priority, and hotness (hype) score
- Track purchase price and date
- Move games between wishlist → pre-order → bought states
- Soft-delete with a one-click reinstate option
- DLC management — nest DLC under parent games with a mini-cover shelf

### Play Status Tracking
Eight statuses for your collection:

| Code | Meaning |
|------|---------|
| UP | Unplayed |
| IP | In Progress |
| COM | Completed |
| SUP | Superseded (replaced by a better version) |
| UF | Unfinishable |
| PDP | Played on a Different Platform |
| WNC | Will Never Complete |
| WNP | Will Never Play |

### Game Details
- Steam cover art via App ID (or custom image URL)
- Developer, publisher, store links (Steam, gg.deals, SteamDB)
- 5-star personal rating and written review
- Timestamped notes per game
- Hotness bar (0–100) for tracking current interest

### Filtering & Sorting
- Filter by status, genre (AND/OR), platform, tag, priority, hotness range
- Special filters: Wishlist only, Unreleased, Pre-orders
- Sort by hotness, priority, genre, platform, release date, added date, or Steam Collection

### Views
- **Grid** — card layout with cover art
- **List** — compact two-column view with thumbnails
- **Calendar** — monthly release calendar with TBA list
- **Dark / Light theme** toggle

### Data & Sync
- **Google Sheets backend** — games live in a spreadsheet, synced via Google Apps Script (JSONP, works from `file://`)
- **LocalStorage fallback** — works fully offline when no `SHEET_URL` is set
- Export / import JSON backups
- Visual sync status indicator (idle / syncing / ok / error / offline)

### PWA
- Installable as a home-screen app (inline manifest)
- Service worker for offline caching (cache-first)

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `/` | Focus search |
| `A` or `N` | Add game |
| `C` | Open calendar |
| `G` | Grid view |
| `L` | List view |
| `Esc` | Close panel / modal |

---

## Getting Started

### Option A — Offline / Local (no sync)

1. Clone or download this repository.
2. Open `index.html` in any modern browser.

That's it. Games are saved in `localStorage` under the key `btb_v4`.

### Option B — Cloud Sync via Google Sheets

1. Create a Google Sheet to store your games.
2. In the sheet, open **Extensions → Apps Script** and paste the companion Apps Script (see [Setting up the backend](#setting-up-the-backend)).
3. Deploy the script as a **Web App** (Execute as: Me, Access: Anyone).
4. Copy the deployment URL.
5. Open `index.html`, find line ~1450, and replace the `SHEET_URL` constant:

```js
const SHEET_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

6. Open `index.html` in your browser. The sync indicator in the top bar will turn green when connected.

---

## Setting up the Backend

The Apps Script web app must expose at minimum these actions over JSONP:

| `action` param | Description |
|----------------|-------------|
| `getAll` | Returns all game records as JSON |
| `getMeta` | Returns genre/tag metadata |
| `save` | Writes a single game record |
| `delete` | Removes a game by ID |

The app calls the endpoint with `?action=<action>&callback=<fn>&_=<timestamp>` query parameters.

---

## Data Model

Each game record contains:

```jsonc
{
  "id": "1700000000000",        // timestamp-based unique ID
  "title": "Game Title",
  "status": "wishlist",         // "wishlist" | "bought"
  "playStatus": "Unplayed",     // see status table above
  "steamAppId": 123456,
  "genres": ["RPG", "Action"],
  "platforms": ["PC", "PS5"],
  "priority": "high",           // "high" | "medium" | "low"
  "hotness": 85,                // 0–100
  "releaseDate": "2025-11-15",  // ISO 8601, or "" for TBA
  "tbaText": "Q4 2025",         // free-text when date is unknown
  "price": "£49.99",
  "cost": 29.99,                // actual amount paid
  "purchaseDate": "15/06/2025",
  "developer": "Studio Name",
  "publisher": "Publisher Name",
  "cover": "https://...",       // custom cover URL (overrides Steam art)
  "storeLink": "https://...",
  "type": "game",               // "game" | "dlc"
  "parentAppId": 0,             // Steam App ID of parent (DLC only)
  "steamCollection": ["Action RPGs"],
  "myRating": 4,                // 1–5
  "myReview": "...",
  "added": 1700000000000,       // epoch ms
  "cancelled": false,
  "notes": [
    { "id": "n1", "text": "...", "timestamp": 1700000000000 }
  ]
}
```

---

## Browser Support

Requires a modern browser with:
- ES6 (modules not required — all inline)
- LocalStorage
- Fetch API
- CSS Grid & Custom Properties
- Service Workers (for offline; degrades gracefully without)

---

## Architecture Notes

- **Single-file** — all HTML, CSS, and JavaScript live in `index.html` for maximum portability. Copy one file to any host and it works.
- **No build step** — zero npm, zero bundlers. Open and run.
- **JSONP transport** — the Google Sheets backend is called via JSONP script tags so the app works from `file://` URLs with no CORS issues.
- **Blob-based service worker** — the service worker is injected as a blob URL at runtime, so no separate `.js` file is needed.
- **Inline PWA manifest** — the web app manifest is injected into the `<head>` at runtime, keeping the single-file design intact.
- **Virtual/sentinel rendering** — game cards are rendered in batches using an IntersectionObserver sentinel for smooth scrolling over large collections.

---

## License

Personal project — no license. Fork and adapt freely.
