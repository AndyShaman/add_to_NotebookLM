# Architecture

Technical architecture of "Add to NotebookLM" Chrome extension.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Popup UI   │    │  Bulk Import │    │  YouTube Page    │  │
│  │  popup.html  │    │   app.html   │    │                  │  │
│  │  popup.js    │    │   app.js     │    │  youtube.js      │  │
│  └──────┬───────┘    └──────┬───────┘    │  youtube.css     │  │
│         │                   │            └────────┬─────────┘  │
│         │                   │                     │             │
│         └───────────────────┼─────────────────────┘             │
│                             │                                    │
│                    chrome.runtime.sendMessage                   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Background Service Worker               │  │
│  │                      background.js                        │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │                 NotebookLMAPI                        │ │  │
│  │  │  - getTokens()      - listNotebooks()               │ │  │
│  │  │  - createNotebook() - addSources()                  │ │  │
│  │  │  - listAccounts()   - waitForSources()              │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                    fetch() with credentials
                              │
                              ▼
              ┌───────────────────────────────┐
              │      NotebookLM Server        │
              │  notebooklm.google.com        │
              │                               │
              │  /_/LabsTailwindUi/data/      │
              │     batchexecute              │
              └───────────────────────────────┘
```

## Components

### 1. Background Service Worker (`background.js`)

The central hub for all API communication.

#### NotebookLMAPI Object
```javascript
NotebookLMAPI = {
  BASE_URL: 'https://notebooklm.google.com',
  tokens: { bl, at, authuser },

  // Authentication
  getTokens(authuser) → { bl, at, authuser }
  extractToken(key, html) → string

  // Notebooks
  listNotebooks() → [{ id, name, sources, emoji }]
  createNotebook(title, emoji) → { id, name, emoji }

  // Sources
  addSource(notebookId, url) → response
  addSources(notebookId, urls[]) → response
  addTextSource(notebookId, text, title) → response

  // Status
  getNotebookStatus(notebookId) → boolean
  waitForSources(notebookId, maxAttempts) → boolean

  // Accounts
  listAccounts() → [{ name, email, avatar, index }]

  // Utility
  getNotebookUrl(notebookId, authuser) → string
  rpc(rpcId, params, sourcePath) → response
}
```

#### Message Commands
| Command | Parameters | Response |
|---------|------------|----------|
| `ping` | - | `{ ok: true }` |
| `list-accounts` | - | `{ accounts: [], list: [] }` |
| `list-notebooks` | - | `{ notebooks: [] }` |
| `list-notebooklm` | - | `{ list: [] }` (legacy) |
| `create-notebook` | title, emoji | `{ notebook: {} }` |
| `add-source` | notebookId, url | `{ success: true }` |
| `add-sources` | notebookId, urls[] | `{ success, notebookUrl }` |
| `add-text-source` | notebookId, text, title | `{ success: true }` |
| `get-current-tab` | - | `{ tab: {} }` |
| `get-all-tabs` | - | `{ tabs: [] }` |
| `save-to-notebook` | title, urls, notebookId, createNew | `{ success, notebookUrl }` |
| `save-to-notebooklm` | title, urls, currentURL, notebookID | `{ url }` (legacy) |

### 2. Popup (`popup/`)

Main user interface shown when clicking the extension icon.

#### State
```javascript
currentTab = { id, url, title, favIconUrl }
notebooks = [{ id, name, sources, emoji }]
youtubePageType = 'video' | 'playlist' | 'playlist_video' | 'channel' | null
```

#### YouTube Detection
```javascript
detectYouTubePageType(url) {
  if (url.includes('/playlist')) → 'playlist'
  if (url.includes('/watch') && hasListParam) → 'playlist_video'
  if (url.includes('/watch')) → 'video'
  if (url.includes('/@') || '/channel/') → 'channel'
}
```

#### URL Extraction
Uses `chrome.scripting.executeScript` to inject extraction function:
```javascript
extractYouTubeUrls(pageType) {
  // 'playlist' → ytd-playlist-video-renderer a#video-title
  // 'playlist_video' → ytd-playlist-panel-video-renderer a
  // 'channel' → ytd-rich-grid-media a#video-title-link
}
```

### 3. Content Script (`content/youtube.js`)

Injected on all pages, provides YouTube-specific UI.

#### Features
- Adds "Add to NotebookLM" buttons on YouTube
- Uses InnerTube API for playlist/channel extraction
- Handles pagination via continuation tokens
- Communicates with background via `chrome.runtime.sendMessage`

#### InnerTube API
```javascript
// Endpoint
POST https://www.youtube.com/youtubei/v1/browse

// Request
{
  browseId: "VL{playlistId}" | "UC{channelId}",
  continuation: "token",
  context: {
    client: {
      clientName: "WEB",
      clientVersion: "2.x"
    }
  }
}
```

### 4. Bulk Import (`app/`)

Full-page interface for importing multiple URLs.

#### Tabs
1. **Links** - Paste URLs (one per line)
2. **Browser Tabs** - Select from open tabs
3. **Settings** - Account selection, preferences

#### Batch Processing
```javascript
// Import in batches of 10
for (i = 0; i < urls.length; i += 10) {
  batch = urls.slice(i, i + 10)
  await sendMessage({ cmd: 'add-sources', urls: batch })
  updateProgress(i, urls.length)
}
```

## Data Flow

### Adding a YouTube Video

```
1. User clicks extension icon
2. popup.js → sendMessage({ cmd: 'get-current-tab' })
3. background.js → chrome.tabs.query() → returns tab info
4. popup.js displays current page, detects YouTube type
5. User clicks "Add to Notebook"
6. popup.js → sendMessage({ cmd: 'add-source', url, notebookId })
7. background.js → NotebookLMAPI.addSource()
8. background.js → fetch(batchexecute) with RPC payload
9. NotebookLM server processes request
10. background.js → returns { success: true }
11. popup.js shows success message
```

### Adding a Playlist

```
1. User on YouTube playlist page, clicks extension
2. popup.js detects 'playlist' or 'playlist_video' type
3. User clicks "Add All Playlist Videos"
4. popup.js → chrome.scripting.executeScript(extractYouTubeUrls)
5. Content script extracts video URLs from DOM
6. popup.js receives URL array
7. popup.js → sendMessage({ cmd: 'add-sources', urls })
8. background.js → NotebookLMAPI.addSources()
9. background.js → fetch() with batch of URLs
10. Success response shown to user
```

## Storage

### chrome.storage.sync
```javascript
{
  selectedAccount: 0,          // Selected Google account index
  lastNotebook: "uuid",        // Last used notebook ID
  autoOpenNotebook: false      // Auto-open after adding
}
```

### chrome.storage.local
```javascript
{
  pendingUrl: "url",           // From context menu
  pendingTitle: "title"        // Page title
}
```

## Security Considerations

1. **Credentials** - Uses `credentials: 'include'` for authenticated requests
2. **Tokens** - Extracted from page, stored in memory only
3. **CSP** - No inline scripts, uses event listeners
4. **Permissions** - Minimal required permissions

## Error Handling

```javascript
try {
  await NotebookLMAPI.getTokens()
} catch {
  return { error: 'Please login to NotebookLM first' }
}
```

Common errors:
- Not logged in → Prompt to login
- Token expired → Re-fetch tokens
- API error → Show error message
- Network error → Retry or show error
