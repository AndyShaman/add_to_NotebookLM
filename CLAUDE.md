# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Add to NotebookLM" is a Chrome extension (Manifest V3) for importing YouTube videos and web pages into Google NotebookLM. It supports bulk import, YouTube playlists/channels, multiple Google accounts, and English/Russian localization.

## Architecture

### Core Components

- **background.js** - Service worker containing the `NotebookLMAPI` client. Handles all API calls to NotebookLM via undocumented RPC endpoints (`batchexecute`). Manages message passing between popup/content scripts and the API.

- **popup/** - Extension popup UI. `popup.js` handles notebook selection, YouTube page type detection, and single-page imports.

- **app/** - Full-page bulk import interface. `app.js` provides tabs for importing multiple links or browser tabs at once, plus settings management.

- **content/youtube.js** - Minified content script injected on YouTube pages. Provides buttons to add videos/playlists/channels directly from YouTube.

- **lib/i18n.js** - Localization system using Chrome's `_locales/` messages format. Supports `data-i18n`, `data-i18n-placeholder`, and `data-i18n-title` attributes.

### Message Flow

1. Popup/App sends commands via `chrome.runtime.sendMessage({ cmd: 'command-name', ...params })`
2. Background service worker receives in `handleMessage()`, calls `NotebookLMAPI` methods
3. API uses token extraction from NotebookLM HTML (`cfb2h`, `SNlM0e`) for authentication
4. RPC calls go to `/_/LabsTailwindUi/data/batchexecute` endpoint

### Key RPC IDs

- `wXbhsf` - List notebooks
- `CCqFvf` - Create notebook
- `izAoDd` - Add sources to notebook
- `rLM1Ne` - Check notebook status
- `tGMBJ` - Delete source from notebook

### Available Message Commands

Commands sent via `chrome.runtime.sendMessage({ cmd: '...', ...params })`:

| Command | Parameters | Description |
|---------|------------|-------------|
| `list-accounts` | - | Get logged-in Google accounts |
| `list-notebooks` | - | Get user's notebooks |
| `create-notebook` | `title`, `emoji` | Create new notebook |
| `add-source` | `notebookId`, `url` | Add single URL |
| `add-sources` | `notebookId`, `urls[]` | Add multiple URLs |
| `add-text-source` | `notebookId`, `text`, `title` | Add text content |
| `get-notebook` | `notebookId` | Get notebook with sources |
| `delete-source` | `notebookId`, `sourceId` | Delete a source |
| `delete-sources` | `notebookId`, `sourceIds[]` | Delete multiple sources |
| `get-current-tab` | - | Get active tab info |
| `get-all-tabs` | - | Get all open tabs |

## Development

### Loading the Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
4. Login to [NotebookLM](https://notebooklm.google.com) before using

### Testing Manually

Test these workflows after changes:
- Login detection and notebook listing
- Add single video/page to existing notebook
- Create new notebook and add source
- YouTube playlist extraction (from playlist page and from video with playlist sidebar)
- YouTube channel video extraction
- Bulk import multiple URLs
- Import from browser tabs
- Account switching

### Adding Translations

1. Add key to both `_locales/en/messages.json` and `_locales/ru/messages.json`
2. Use in HTML: `<span data-i18n="your_key"></span>`
3. Use in JS: `I18n.get('your_key')` or `t('your_key', 'fallback')`

### YouTube Page Type Detection

The popup detects YouTube page types and adjusts button behavior:
- `video` - Single video at `/watch` without playlist param
- `playlist` - Dedicated playlist page at `/playlist`
- `playlist_video` - Video playing from a playlist (has `list` URL param)
- `channel` - Channel pages (`/@username`, `/channel/`, `/c/`)

Video extraction uses `chrome.scripting.executeScript()` to inject `extractYouTubeUrls()` into the page DOM.

## Known Limitations

- NotebookLM API is undocumented and may change without notice
- YouTube InnerTube API is internal and may change
- Playlist/channel extraction only gets videos visible in DOM (requires scrolling for more)
- Channel extraction limited to ~50 videos
- `content/youtube.js` is minified - see TODO.md for cleanup task
