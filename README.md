# Add to NotebookLM

Chrome extension for importing YouTube videos, web pages, and other content directly into Google NotebookLM.

## Features

- **One-click import** - Add current page to NotebookLM with a single click
- **YouTube support** - Import single videos, entire playlists, and channel videos
- **Bulk import** - Paste multiple URLs and import them all at once
- **Browser tabs import** - Select and import multiple open tabs
- **Multiple notebooks** - Choose which notebook to add content to
- **Multi-account support** - Switch between Google accounts
- **Dark mode** - Adapts to YouTube's dark theme

## Installation

### Development Mode
1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `unified-notebooklm` folder

### Prerequisites
- Google Chrome browser
- Active Google account with NotebookLM access
- Must be logged into NotebookLM before using

## Usage

### Popup Interface
1. Click the extension icon in Chrome toolbar
2. Select a notebook from the dropdown
3. Click "Add to Notebook" to add the current page

### YouTube Pages
The extension automatically detects YouTube pages:
- **Single video** (`/watch?v=...`) - Adds the video
- **Playlist page** (`/playlist?list=...`) - Adds all videos from playlist
- **Video from playlist** (`/watch?v=...&list=...`) - Adds all videos from sidebar
- **Channel page** (`/@...` or `/channel/...`) - Adds visible channel videos

### Bulk Import
1. Click "Bulk Import" button in popup
2. Paste URLs (one per line)
3. Select target notebook
4. Click "Import Links"

### Context Menu
Right-click on any page or link and select "Send to NotebookLM"

## File Structure

```
unified-notebooklm/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker - handles API calls
├── popup/
│   ├── popup.html         # Popup UI
│   └── popup.js           # Popup logic
├── content/
│   ├── youtube.js         # YouTube content script (InnerTube API)
│   └── youtube.css        # YouTube UI styles
├── app/
│   ├── app.html           # Bulk import page
│   └── app.js             # Bulk import logic
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── _locales/
│   ├── en/messages.json   # English localization
│   └── ru/messages.json   # Russian localization
└── lib/
    └── api.js             # (unused, API is in background.js)
```

## Technical Details

### NotebookLM API
The extension uses NotebookLM's internal RPC API:
- **Endpoint**: `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute`
- **Auth**: Tokens extracted from NotebookLM page (`cfb2h`, `SNlM0e`)

### YouTube InnerTube API
For playlists and channels, uses YouTube's internal API:
- **Endpoint**: `https://www.youtube.com/youtubei/v1/browse`
- Handles pagination via continuation tokens
- Filters member-only content

### Permissions
- `tabs` - Access tab URLs and titles
- `storage` - Save preferences
- `activeTab` - Access current tab
- `scripting` - Inject scripts for URL extraction
- `contextMenus` - Right-click menu
- `unlimitedStorage` - Store data
- `host_permissions` - Access NotebookLM, YouTube, Google accounts

## Localization

Currently supported languages:
- English (en)
- Russian (ru)

To add a new language:
1. Create folder `_locales/{lang_code}/`
2. Copy `messages.json` from `en` folder
3. Translate all message values

## Development

### Building
No build step required - extension runs directly from source.

### Testing
1. Load extension in developer mode
2. Open NotebookLM and login
3. Test on various YouTube pages

### Debugging
- Background script: chrome://extensions → "Service worker" link
- Popup: Right-click extension icon → Inspect popup
- Content script: DevTools on YouTube page → Console

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## License

MIT License - see LICENSE file.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

## Support

For issues or feature requests, please open a GitHub issue.
