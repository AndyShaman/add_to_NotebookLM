# Changelog

All notable changes to "Add to NotebookLM" extension.

## [1.0.0] - 2026-01-16

### Initial Release

#### Features
- **Popup Interface**
  - Notebook selection dropdown
  - Add current page to notebook
  - Create new notebook
  - Account selector
  - Settings button

- **YouTube Integration**
  - Single video import
  - Playlist import (full playlist page)
  - Playlist import from video sidebar (when watching video from playlist)
  - Channel videos import
  - Uses YouTube InnerTube API for reliable extraction

- **Bulk Import Page**
  - Paste multiple URLs
  - Import from browser tabs
  - Progress indicator
  - Settings tab with account selection

- **Context Menu**
  - Right-click "Send to NotebookLM"

- **Localization**
  - English
  - Russian

#### Technical
- Manifest V3 compliant
- Service worker architecture
- NotebookLM RPC API integration
- YouTube InnerTube API integration

---

## Development History

### Session 2026-01-16

#### Phase 1: Initial Setup
- Created unified extension structure
- Implemented NotebookLM API client in background.js
- Created popup UI with notebook selection
- Added bulk import page

#### Phase 2: YouTube Integration
- Copied original YouTube to NotebookLM extension's app.js
- Adapted background.js for compatibility with InnerTube API
- Added legacy command handlers (`list-notebooklm`, `save-to-notebooklm`)

#### Phase 3: Bug Fixes
- Fixed "Open Notebook" button (CSP issue with inline onclick)
- Fixed settings button handler
- Fixed hideStatus function
- Added YouTube playlist/channel detection in popup
- Added `playlist_video` type for videos played from playlist

#### Phase 4: Cleanup
- Removed "Rate this extension" context menu
- Removed mixpanel analytics references
- Removed chromewebstore links
- Cleaned youtube.js from tracking code
- Cleaned youtube.css from rating styles
- Updated all localization files

#### Phase 5: Rebranding
- Renamed from "NotebookLM Importer" to "Add to NotebookLM"
- Updated all file headers and titles
- Changed icons to red color

#### Phase 6: Documentation
- Created README.md
- Created CHANGELOG.md
- Created TODO.md
- Created ARCHITECTURE.md
