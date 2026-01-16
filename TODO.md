# TODO

Future tasks and improvements for "Add to NotebookLM" extension.

## Priority: High

### Bug Fixes
- [ ] Test playlist extraction on various playlist sizes (10, 50, 100+ videos)
- [ ] Test channel video extraction with infinite scroll
- [ ] Verify extension works after NotebookLM API changes

### Before GitHub Publication
- [ ] Add LICENSE file (MIT recommended)
- [ ] Add .gitignore file
- [ ] Remove `.venv` folder from repository
- [ ] Remove `original_icon*.png` backup files
- [ ] Test fresh installation on clean Chrome profile
- [ ] Create extension screenshots for Chrome Web Store

## Priority: Medium

### Features
- [ ] Add support for Google Drive links
- [ ] Add support for Google Docs/Sheets/Slides
- [ ] Add keyboard shortcuts (Ctrl+Shift+N to add)
- [ ] Add notification when source is successfully added
- [ ] Add option to auto-open notebook after adding
- [ ] Add history of recently added sources

### UI Improvements
- [ ] Show video count before adding playlist
- [ ] Add loading spinner on YouTube buttons
- [ ] Improve error messages
- [ ] Add "Scroll to load more videos" hint for channels

### YouTube
- [ ] Auto-scroll to load all playlist videos
- [ ] Filter out Shorts from channel videos
- [ ] Add option to select specific videos from playlist

## Priority: Low

### Technical Debt
- [ ] Replace minified youtube.js with clean implementation
- [ ] Add unit tests for API functions
- [ ] Add E2E tests with Playwright
- [ ] Migrate from inline styles to CSS classes in popup

### Localization
- [ ] Add more languages (Spanish, German, French, etc.)
- [ ] Add language auto-detection
- [ ] Translate YouTube button text

### Chrome Web Store
- [ ] Create promotional images
- [ ] Write detailed store description
- [ ] Create demo video
- [ ] Set up privacy policy page

## Completed

### v1.0.0
- [x] Basic popup interface
- [x] NotebookLM API integration
- [x] YouTube video import
- [x] YouTube playlist import
- [x] YouTube channel import
- [x] Bulk import page
- [x] Tab import
- [x] Context menu
- [x] Multi-account support
- [x] Settings page
- [x] English localization
- [x] Russian localization
- [x] Red icon design
- [x] Remove analytics/tracking
- [x] Documentation

## Notes

### Known Issues
1. Playlist extraction only gets videos visible in DOM - need to scroll for more
2. Channel extraction limited to first ~50 videos
3. Member-only videos may not be filtered correctly

### API Considerations
- NotebookLM API is not public - may change without notice
- YouTube InnerTube API is internal - may change without notice
- Monitor for breaking changes regularly

### Testing Checklist
Before each release:
1. [ ] Login to NotebookLM works
2. [ ] List notebooks works
3. [ ] Create notebook works
4. [ ] Add single video works
5. [ ] Add playlist works
6. [ ] Add channel videos works
7. [ ] Bulk import works
8. [ ] Tab import works
9. [ ] Context menu works
10. [ ] Settings persist correctly
