// Popup script for Add to NotebookLM

// Initialize theme immediately (before DOMContentLoaded)
(async function initThemeEarly() {
  try {
    const storage = await chrome.storage.sync.get(['theme']);
    const theme = storage.theme || 'light';
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Default to light theme
  }
})();

document.addEventListener('DOMContentLoaded', init);

// DOM elements
let notebookSelect, addBtn, addPdfBtn, newNotebookBtn, bulkBtn, tabsBtn, grabLinksBtn;
let accountSelect, statusDiv, currentUrlDiv, settingsBtn, openNotebookBtn;
let newNotebookModal, newNotebookInput, modalCancel, modalCreate;
let parseCommentsBtn, parseProgress, parseProgressText, cancelParseBtn;

// Current state
let currentTab = null;
let notebooks = [];
let accounts = [];
let youtubePageType = null; // 'video', 'playlist', 'channel', or null
let youtubeVideoUrls = []; // For playlists/channels

async function init() {
  // Initialize localization first
  if (window.I18n) {
    await I18n.init();
  }

  // Get DOM elements
  notebookSelect = document.getElementById('notebook-select');
  addBtn = document.getElementById('add-btn');
  addPdfBtn = document.getElementById('add-pdf-btn');
  newNotebookBtn = document.getElementById('new-notebook-btn');
  bulkBtn = document.getElementById('bulk-btn');
  tabsBtn = document.getElementById('tabs-btn');
  grabLinksBtn = document.getElementById('grab-links-btn');
  accountSelect = document.getElementById('account-select');
  statusDiv = document.getElementById('status');
  currentUrlDiv = document.getElementById('current-url');
  newNotebookModal = document.getElementById('new-notebook-modal');
  newNotebookInput = document.getElementById('new-notebook-name');
  modalCancel = document.getElementById('modal-cancel');
  modalCreate = document.getElementById('modal-create');
  settingsBtn = document.getElementById('settings-btn');
  openNotebookBtn = document.getElementById('open-notebook-btn');
  parseCommentsBtn = document.getElementById('parse-comments-btn');
  parseProgress = document.getElementById('parse-progress');
  parseProgressText = document.getElementById('parse-progress-text');
  cancelParseBtn = document.getElementById('cancel-parse-btn');

  // Set up event listeners
  addBtn.addEventListener('click', handleAddToNotebook);
  addPdfBtn.addEventListener('click', handleAddAsPdf);
  parseCommentsBtn.addEventListener('click', handleParseComments);
  cancelParseBtn.addEventListener('click', handleCancelParse);
  newNotebookBtn.addEventListener('click', showNewNotebookModal);
  bulkBtn.addEventListener('click', openBulkImport);
  tabsBtn.addEventListener('click', openTabsImport);
  grabLinksBtn.addEventListener('click', handleGrabLinks);
  accountSelect.addEventListener('change', handleAccountChange);
  notebookSelect.addEventListener('change', handleNotebookChange);
  modalCancel.addEventListener('click', hideNewNotebookModal);
  modalCreate.addEventListener('click', handleCreateNotebook);
  settingsBtn.addEventListener('click', openSettings);
  openNotebookBtn.addEventListener('click', handleOpenNotebook);

  // Load initial data
  await loadCurrentTab();
  await loadAccounts();
  await loadNotebooks();
  await checkActiveParse();
}

// Get localized string
function t(key, fallback) {
  if (window.I18n) {
    return I18n.get(key) || fallback || key;
  }
  return fallback || key;
}

// Load current tab info
async function loadCurrentTab() {
  try {
    const response = await sendMessage({ cmd: 'get-current-tab' });
    if (response.tab) {
      currentTab = response.tab;
      currentUrlDiv.textContent = currentTab.title || currentTab.url;
      currentUrlDiv.title = currentTab.url;

      // Detect YouTube page type
      detectYouTubePageType(currentTab.url);
    }
  } catch (error) {
    currentUrlDiv.textContent = t('popup_error', 'Unable to get current page');
  }
}

// Detect YouTube page type
function detectYouTubePageType(url) {
  youtubePageType = null;
  youtubeVideoUrls = [];

  // Only www.youtube.com is covered by host_permissions — other subdomains
  // (music, m) would fail on chrome.scripting.executeScript
  if (!url.includes('www.youtube.com')) {
    return;
  }

  // Check for playlist context first (even when watching a video from playlist)
  const urlObj = new URL(url);
  const hasPlaylistParam = urlObj.searchParams.has('list');

  if (url.includes('/playlist')) {
    // Dedicated playlist page
    youtubePageType = 'playlist';
    const playlistText = t('popup_addPlaylist', 'Add Playlist to Notebook');
    addBtn.textContent = '';
    addBtn.append('📋 ', playlistText);
    const playlistLabel = t('popup_playlist', 'Playlist');
    currentUrlDiv.textContent = `📋 ${playlistLabel}: ${currentTab.title.replace(' - YouTube', '')}`;
  } else if (url.includes('/watch') && hasPlaylistParam) {
    // Watching a video from a playlist
    youtubePageType = 'playlist_video';
    const addAllText = t('popup_addAllPlaylist', 'Add All Playlist Videos');
    addBtn.textContent = '';
    addBtn.append('📋 ', addAllText);
    const videoFromPlaylist = t('popup_videoFromPlaylist', 'Video from Playlist');
    const clickToAdd = t('popup_clickToAddAll', 'Click to add all videos');
    currentUrlDiv.textContent = `📋 ${videoFromPlaylist} - ${clickToAdd}`;
  } else if (url.includes('/watch')) {
    // Single video
    youtubePageType = 'video';
    const addVideoText = t('popup_addVideo', 'Add Video to Notebook');
    addBtn.textContent = '';
    addBtn.append('➕ ', addVideoText);
  } else if (url.includes('/@') || url.includes('/channel/') || url.includes('/c/')) {
    youtubePageType = 'channel';
    const addChannelText = t('popup_addChannelVideos', 'Add Channel Videos to Notebook');
    addBtn.textContent = '';
    addBtn.append('📺 ', addChannelText);
    const channelLabel = t('popup_channel', 'Channel');
    currentUrlDiv.textContent = `📺 ${channelLabel}: ${currentTab.title.replace(' - YouTube', '')}`;
  }

  // Show parse comments button for video pages
  if (youtubePageType === 'video' || youtubePageType === 'playlist_video') {
    updateParseButtonState();
  }
}

// Reconcile the saved account index with the current account list.
// Indexes saved before the authuser fix came from a filtered list, so they can
// point at a different account now — the email is the source of truth.
async function resolveSelectedAccount(accountList) {
  const storage = await chrome.storage.sync.get(['selectedAccount', 'selectedAccountEmail']);
  const savedIndex = storage.selectedAccount || 0;
  const savedEmail = storage.selectedAccountEmail;

  if (accountList.length === 0) return savedIndex;

  if (savedEmail) {
    const byEmail = accountList.find(acc => acc.email === savedEmail);
    if (byEmail) {
      if (byEmail.index !== savedIndex) {
        await chrome.storage.sync.set({ selectedAccount: byEmail.index });
      }
      return byEmail.index;
    }
  } else {
    // Legacy value with no email recorded: trust it only if that index exists
    const byIndex = accountList.find(acc => acc.index === savedIndex);
    if (byIndex) {
      await chrome.storage.sync.set({ selectedAccountEmail: byIndex.email });
      return byIndex.index;
    }
  }

  // Saved account is gone (or the index never existed) — fall back to the default one
  const fallback = accountList.find(acc => acc.index === 0) || accountList[0];
  await chrome.storage.sync.set({ selectedAccount: fallback.index, selectedAccountEmail: fallback.email });
  return fallback.index;
}

// Load Google accounts
async function loadAccounts() {
  try {
    const response = await sendMessage({ cmd: 'list-accounts' });
    accounts = response.accounts || [];

    // Get saved account
    const selectedAccount = await resolveSelectedAccount(accounts);

    // Populate account selector
    accountSelect.textContent = '';

    if (accounts.length > 0) {
      accounts.forEach((acc, index) => {
        const option = document.createElement('option');
        option.value = acc.index !== undefined ? acc.index : index;
        option.textContent = acc.email || acc.name || `Account ${index + 1}`;
        if ((acc.index !== undefined ? acc.index : index) === selectedAccount) {
          option.selected = true;
        }
        accountSelect.appendChild(option);
      });
    } else {
      // No accounts found - show single default option
      const option = document.createElement('option');
      option.value = 0;
      option.textContent = 'Default';
      accountSelect.appendChild(option);
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
}

// Load notebooks list
async function loadNotebooks() {
  try {
    const loadingText = t('popup_loadingNotebooks', 'Loading notebooks...');
    showStatus('loading', loadingText);

    const response = await sendMessage({ cmd: 'list-notebooks' });

    if (response.error) {
      showStatus('error', response.error);
      const loginText = t('popup_loginRequired', 'Login to NotebookLM first');
      notebookSelect.textContent = '';
      const loginOption = document.createElement('option');
      loginOption.value = '';
      loginOption.textContent = loginText;
      notebookSelect.appendChild(loginOption);
      addBtn.disabled = true;
      addPdfBtn.disabled = true;
      return;
    }

    notebooks = response.notebooks || [];
    hideStatus();

    // Get last used notebook
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    const lastNotebook = storage.lastNotebook;

    // Populate notebook selector
    notebookSelect.textContent = '';

    if (notebooks.length === 0) {
      const noNotebooksText = t('popup_noNotebooks', 'No notebooks found');
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = noNotebooksText;
      notebookSelect.appendChild(emptyOption);
      addBtn.disabled = true;
      addPdfBtn.disabled = true;
    } else {
      const sourcesText = t('common_sources', 'sources');
      notebooks.forEach(nb => {
        const option = document.createElement('option');
        option.value = nb.id;
        option.textContent = `${nb.emoji} ${nb.name} (${nb.sources} ${sourcesText})`;
        if (nb.id === lastNotebook) {
          option.selected = true;
        }
        notebookSelect.appendChild(option);
      });
      addBtn.disabled = false;
      addPdfBtn.disabled = false;
    }

    // Hide PDF button for restricted pages
    if (currentTab && currentTab.url) {
      const url = currentTab.url;
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.includes('www.youtube.com') || url.includes('youtu.be')) {
        addPdfBtn.classList.add('hidden');
      }
    }

    // Update parse button after notebooks are loaded
    if (youtubePageType === 'video' || youtubePageType === 'playlist_video') {
      updateParseButtonState();
    }
  } catch (error) {
    console.error('Error loading notebooks:', error);
    const errorText = t('popup_error', 'Failed to load notebooks');
    showStatus('error', errorText);
    addBtn.disabled = true;
    addPdfBtn.disabled = true;
  }
}

// Handle add to notebook
async function handleAddToNotebook() {
  const notebookId = notebookSelect.value;
  if (!notebookId || !currentTab) return;

  try {
    addBtn.disabled = true;

    // For YouTube playlists/channels, we need to get video URLs from content script
    if (youtubePageType === 'playlist' || youtubePageType === 'playlist_video' || youtubePageType === 'channel') {
      const typeLabel = youtubePageType === 'channel' ? t('popup_channel', 'channel') : t('popup_playlist', 'playlist');
      const extractingText = t('popup_extractingVideos', 'Extracting videos from');
      showStatus('loading', `${extractingText} ${typeLabel}...`);

      // Request video URLs from content script
      const videoUrls = await getYouTubeVideoUrls();

      if (!videoUrls || videoUrls.length === 0) {
        const noVideosText = t('popup_noVideosFound', 'No videos found. Try scrolling down to load more videos, then try again.');
        showStatus('error', noVideosText);
        addBtn.disabled = false;
        return;
      }

      const addingText = t('popup_addingVideos', 'Adding videos to notebook...');
      showStatus('loading', `${addingText} (${videoUrls.length})`);

      // Add all videos to notebook
      const response = await sendMessage({
        cmd: 'add-sources',
        notebookId: notebookId,
        urls: videoUrls
      });

      if (response.error) {
        showStatus('error', response.error);
      } else {
        await chrome.storage.sync.set({ lastNotebook: notebookId });
        const videosAddedText = t('popup_videosAdded', 'videos added!');
        showStatus('success', `✓ ${videoUrls.length} ${videosAddedText}`);

        setTimeout(() => {
          const notebook = notebooks.find(n => n.id === notebookId);
          showSuccessWithActions(notebook, videoUrls.length);
        }, 500);
      }
    } else {
      // Single URL (video or regular page)
      const loadingText = t('popup_loading', 'Adding to notebook...');
      showStatus('loading', loadingText);

      const response = await sendMessage({
        cmd: 'add-source',
        notebookId: notebookId,
        url: currentTab.url
      });

      if (response.error) {
        showStatus('error', response.error);
      } else {
        await chrome.storage.sync.set({ lastNotebook: notebookId });
        const successText = t('popup_success', 'Added successfully!');
        showStatus('success', `✓ ${successText}`);

        setTimeout(() => {
          const notebook = notebooks.find(n => n.id === notebookId);
          showSuccessWithActions(notebook);
        }, 500);
      }
    }
  } catch (error) {
    const errorText = t('popup_error', 'Failed to add to notebook');
    showStatus('error', errorText);
  } finally {
    addBtn.disabled = false;
  }
}

// Handle add as PDF
async function handleAddAsPdf() {
  const notebookId = notebookSelect.value;
  if (!notebookId || !currentTab) return;

  try {
    addPdfBtn.disabled = true;
    addBtn.disabled = true;
    showStatus('loading', t('popup_capturingPdf', 'Capturing page as PDF...'));

    const response = await sendMessage({
      cmd: 'add-as-pdf',
      notebookId: notebookId,
      tabId: currentTab.id,
      title: currentTab.title || 'page'
    });

    if (response.error) {
      showStatus('error', t('popup_pdfError', 'Cannot capture this page as PDF'));
    } else {
      await chrome.storage.sync.set({ lastNotebook: notebookId });
      showStatus('success', `✓ ${t('popup_pdfSuccess', 'Page added as PDF!')}`);

      setTimeout(() => {
        const notebook = notebooks.find(n => n.id === notebookId);
        if (notebook) showSuccessWithActions(notebook);
      }, 500);
    }
  } catch (error) {
    showStatus('error', t('popup_pdfError', 'Cannot capture this page as PDF'));
  } finally {
    addPdfBtn.disabled = false;
    addBtn.disabled = false;
  }
}

// Get YouTube video URLs from content script
async function getYouTubeVideoUrls() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Use scripting API to extract URLs directly from the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractYouTubeUrls,
      args: [youtubePageType]
    });

    return results[0]?.result || [];
  } catch (error) {
    console.error('Error getting video URLs:', error);
    return [];
  }
}

// Function to be injected into YouTube page to extract video URLs
function extractYouTubeUrls(pageType) {
  const urls = [];

  if (pageType === 'playlist') {
    // Dedicated playlist page - videos are in the main content
    const videos = document.querySelectorAll('ytd-playlist-video-renderer a#video-title');
    videos.forEach(video => {
      const href = video.getAttribute('href');
      if (href) {
        const url = new URL(href, 'https://www.youtube.com');
        url.searchParams.delete('list');
        url.searchParams.delete('index');
        urls.push(url.toString());
      }
    });
  } else if (pageType === 'playlist_video') {
    // Watching a video from playlist - playlist is in the sidebar panel
    // Try multiple selectors for different YouTube layouts
    const selectors = [
      // New YouTube layout - playlist panel
      'ytd-playlist-panel-renderer ytd-playlist-panel-video-renderer a#wc-endpoint',
      'ytd-playlist-panel-renderer a#video-title',
      // Alternative selectors
      '#playlist-items ytd-playlist-panel-video-renderer a',
      'ytd-watch-flexy ytd-playlist-panel-video-renderer a#wc-endpoint'
    ];

    for (const selector of selectors) {
      const videos = document.querySelectorAll(selector);
      if (videos.length > 0) {
        videos.forEach(video => {
          const href = video.getAttribute('href');
          if (href && href.includes('/watch')) {
            const url = new URL(href, 'https://www.youtube.com');
            url.searchParams.delete('list');
            url.searchParams.delete('index');
            url.searchParams.delete('pp');
            urls.push(url.toString());
          }
        });
        break; // Found videos, stop trying other selectors
      }
    }

    // If no videos found in sidebar, try the mini-playlist
    if (urls.length === 0) {
      const miniPlaylist = document.querySelectorAll('#items ytd-playlist-panel-video-renderer a');
      miniPlaylist.forEach(video => {
        const href = video.getAttribute('href');
        if (href && href.includes('/watch')) {
          const url = new URL(href, 'https://www.youtube.com');
          url.searchParams.delete('list');
          url.searchParams.delete('index');
          urls.push(url.toString());
        }
      });
    }
  } else if (pageType === 'channel') {
    // Get videos from channel page. YouTube DOM evolves — try new layout first,
    // fall back to legacy selectors if present.
    const videos = document.querySelectorAll(
      'ytd-rich-item-renderer h3 a[href*="/watch"], ' +
      'ytd-rich-grid-media a#video-title-link, ' +
      'ytd-grid-video-renderer a#video-title'
    );
    videos.forEach(video => {
      const href = video.getAttribute('href');
      if (href && href.includes('/watch')) {
        const url = new URL(href, 'https://www.youtube.com');
        const videoId = url.searchParams.get('v');
        if (videoId) {
          urls.push(`https://www.youtube.com/watch?v=${videoId}`);
        }
      }
    });
  }

  // Remove duplicates and limit to 50
  return [...new Set(urls)].slice(0, 50);
}

// Show success message with action buttons
function showSuccessWithActions(notebook, videoCount = null, commentCount = null, videoTitle = null, totalComments = 0) {
  const notebookUrl = `https://notebook.google.com/notebook/${notebook.id}`;
  const addedToText = t('popup_addedTo', 'Added to');
  const openNotebookText = t('popup_openNotebook', 'Open Notebook');

  statusDiv.className = 'status success';
  statusDiv.textContent = '';

  const messageDiv = document.createElement('div');
  if (commentCount) {
    messageDiv.textContent = `✓ ${commentCount} ${t('comments_commentsParsed', 'comments added to')} "${notebook.emoji} ${notebook.name}"`;
  } else {
    messageDiv.textContent = `✓ ${addedToText} "${notebook.emoji} ${notebook.name}"`;
  }

  statusDiv.appendChild(messageDiv);


  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'success-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'btn btn-secondary';
  openBtn.textContent = openNotebookText;
  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: notebookUrl });
  });

  actionsDiv.appendChild(openBtn);
  statusDiv.appendChild(actionsDiv);
}

// Show new notebook modal
function showNewNotebookModal() {
  newNotebookModal.classList.remove('hidden');
  newNotebookInput.value = currentTab?.title || '';
  newNotebookInput.focus();
  newNotebookInput.select();
}

// Hide new notebook modal
function hideNewNotebookModal() {
  newNotebookModal.classList.add('hidden');
  newNotebookInput.value = '';
}

// Handle create notebook
async function handleCreateNotebook() {
  const name = newNotebookInput.value.trim();
  if (!name) {
    newNotebookInput.focus();
    return;
  }

  try {
    modalCreate.disabled = true;
    const creatingText = t('popup_loading', 'Creating...');
    modalCreate.textContent = creatingText;

    // Determine emoji based on URL
    const isYouTube = currentTab?.url?.includes('www.youtube.com');
    const emoji = isYouTube ? '📺' : '📔';

    // Create notebook
    const createResponse = await sendMessage({
      cmd: 'create-notebook',
      title: name,
      emoji: emoji
    });

    if (createResponse.error) {
      showStatus('error', createResponse.error);
      return;
    }

    const notebook = createResponse.notebook;

    // Add current page to new notebook
    let addFailed = false;
    if (currentTab?.url) {
      const addResponse = await sendMessage({
        cmd: 'add-source',
        notebookId: notebook.id,
        url: currentTab.url
      });
      addFailed = !!addResponse?.error;
    }

    // Save as last notebook
    await chrome.storage.sync.set({ lastNotebook: notebook.id });

    hideNewNotebookModal();

    // Reload notebooks
    await loadNotebooks();

    // Select new notebook
    notebookSelect.value = notebook.id;

    // Status last: loadNotebooks() starts with its own 'loading' status
    if (addFailed) {
      // The notebook exists, only the source failed — report the partial result
      showStatus('error', t('popup_createdAddFailed', 'Notebook created, but adding the page failed'));
    } else {
      const successText = t('popup_success', 'Created and added!');
      showStatus('success', `✓ ${successText}`);
    }

  } catch (error) {
    const errorText = t('popup_error', 'Failed to create notebook');
    showStatus('error', errorText);
  } finally {
    modalCreate.disabled = false;
    const createAndAddText = t('popup_createAndAdd', 'Create & Add');
    modalCreate.textContent = createAndAddText;
  }
}

// Handle account change
async function handleAccountChange() {
  const account = parseInt(accountSelect.value);
  // Store the email alongside the index so a shifted index can be repaired later
  const selected = accounts.find(acc => acc.index === account);
  await chrome.storage.sync.set({
    selectedAccount: account,
    selectedAccountEmail: selected ? selected.email : null
  });

  // Reload notebooks with new account
  await loadNotebooks();
}

// Handle notebook selection change
async function handleNotebookChange() {
  const notebookId = notebookSelect.value;
  if (notebookId) {
    await chrome.storage.sync.set({ lastNotebook: notebookId });
    addBtn.disabled = false;
    addPdfBtn.disabled = false;
  } else {
    addBtn.disabled = true;
    addPdfBtn.disabled = true;
  }
  // Update parse button state if visible
  if (!parseCommentsBtn.classList.contains('hidden') || (youtubePageType === 'video' || youtubePageType === 'playlist_video')) {
    updateParseButtonState();
  }
}

// Open selected notebook in new tab
function handleOpenNotebook() {
  const notebookId = notebookSelect.value;
  if (notebookId) {
    const notebookUrl = `https://notebook.google.com/notebook/${notebookId}`;
    chrome.tabs.create({ url: notebookUrl });
  }
}

// Open bulk import page
function openBulkImport() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('app/app.html')
  });
}

// Open tabs import page
function openTabsImport() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('app/app.html#tabs')
  });
}

// Grab every link from the active page and hand them to the bulk import page
async function handleGrabLinks() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showStatus('error', t('popup_pageNotSupported', 'This page is not supported'));
    return;
  }

  // Ask only for this site, not for every host
  const origin = new URL(url).origin;
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch (e) {
    showStatus('error', t('popup_pageNotSupported', 'This page is not supported'));
    return;
  }
  if (!granted) return;

  try {
    grabLinksBtn.disabled = true;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageLinks
    });
    const links = results[0]?.result || [];

    if (links.length === 0) {
      showStatus('error', t('popup_noLinksFound', 'No links found on this page'));
      return;
    }

    await chrome.storage.local.set({ pendingLinks: links });
    chrome.tabs.create({
      url: chrome.runtime.getURL('app/app.html')
    });
  } catch (error) {
    showStatus('error', t('popup_pageNotSupported', 'This page is not supported'));
  } finally {
    grabLinksBtn.disabled = false;
  }
}

// Function to be injected into the page to collect its links
function extractPageLinks() {
  const pageUrl = location.href.split('#')[0];
  const links = new Set();

  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (!href.startsWith('http://') && !href.startsWith('https://')) return;
    // Skip anchors pointing back at this same page
    if (href.split('#')[0] === pageUrl) return;
    links.add(href);
  });

  return [...links];
}

// Show status message
function showStatus(type, message) {
  statusDiv.className = `status ${type}`;

  statusDiv.textContent = '';
  if (type === 'loading') {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    statusDiv.appendChild(spinner);
    statusDiv.appendChild(document.createTextNode(message));
  } else {
    statusDiv.textContent = message;
  }
}

// Hide status message
function hideStatus() {
  statusDiv.className = 'status';
  statusDiv.textContent = '';
}

// Open settings page
function openSettings() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('app/app.html#settings')
  });
}

// Update parse comments button state
async function updateParseButtonState() {
  parseCommentsBtn.classList.remove('hidden');
  parseCommentsBtn.disabled = !notebookSelect.value;
  parseCommentsBtn.title = '';
}

// Extract video ID from URL
function extractVideoIdFromUrl(url) {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Handle parse comments button click
async function handleParseComments() {
  const notebookId = notebookSelect.value;
  if (!notebookId || !currentTab) return;

  const videoId = extractVideoIdFromUrl(currentTab.url);
  if (!videoId) {
    showStatus('error', t('comments_notYoutubePage', 'Cannot detect video ID'));
    return;
  }

  // Start parse
  parseCommentsBtn.classList.add('hidden');
  parseProgress.classList.remove('hidden');
  parseProgressText.textContent = t('comments_loadingComments', 'Loading comments...');

  const response = await sendMessage({
    cmd: 'parse-comments',
    notebookId,
    videoId,
    tabId: currentTab.id
  });

  if (response.error) {
    parseProgress.classList.add('hidden');
    parseCommentsBtn.classList.remove('hidden');
    showStatus('error', response.error);
    return;
  }

  startProgressPolling();
}

// Poll get-parse-status every 500ms
let pollInterval = null;
function startProgressPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const status = await sendMessage({ cmd: 'get-parse-status' });
    updateParseUI(status);
  }, 500);
}

function stopProgressPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Update parse UI based on status
function updateParseUI(status) {
  const phase = status.progress?.phase;

  if (phase === 'fetching') {
    const fetched = status.progress.fetched || 0;
    const total = status.progress.total;
    const totalStr = total ? ` / ~${total}` : '';
    parseProgressText.textContent = `${t('comments_loadingComments', 'Loading comments...')} (${fetched}${totalStr})`;
  } else if (phase === 'fetching_replies') {
    const fetched = status.progress.fetched || 0;
    parseProgressText.textContent = `${t('comments_loadingReplies', 'Loading replies...')} (${fetched} ${t('comments_commentsLoaded', 'comments')})`;
  } else if (phase === 'formatting') {
    parseProgressText.textContent = t('comments_formatting', 'Formatting...');
  } else if (phase === 'sending') {
    parseProgressText.textContent = t('comments_sending', 'Sending to NotebookLM...');
  } else if (phase === 'done') {
    stopProgressPolling();
    parseProgress.classList.add('hidden');
    parseCommentsBtn.classList.remove('hidden');
    const count = status.result?.commentCount || 0;
    const totalComments = status.result?.totalComments || 0;
    const videoTitle = status.result?.videoTitle || '';
    const notebookId = notebookSelect.value;
    const notebook = notebooks.find(n => n.id === notebookId);
    if (notebook) {
      showSuccessWithActions(notebook, null, count, videoTitle, totalComments);
    } else {
      showStatus('success', `✓ ${count} comments parsed`);
    }
  } else if (phase === 'error') {
    stopProgressPolling();
    parseProgress.classList.add('hidden');
    parseCommentsBtn.classList.remove('hidden');
    showStatus('error', mapParseError(status.error?.code, status.error?.message));
  } else if (phase === 'cancelled') {
    stopProgressPolling();
    parseProgress.classList.add('hidden');
    parseCommentsBtn.classList.remove('hidden');
    showStatus('error', t('comments_cancelled', 'Parsing cancelled'));
  }
}

// Map error codes to user-friendly messages
function mapParseError(code, message) {
  const map = {
    COMMENTS_DISABLED: t('comments_commentsDisabled', 'Comments are disabled for this video'),
    VIDEO_NOT_FOUND: t('comments_videoNotFound', 'Video not found'),
    INVALID_REQUEST: t('comments_invalidRequest', 'Invalid request'),
    NETWORK_ERROR: t('comments_networkError', 'Network error. Check your connection.'),
    INTERRUPTED: t('comments_interrupted', 'Parsing was interrupted. Please try again.')
  };
  return map[code] || message || t('popup_error', 'Error');
}

// Handle cancel parse
async function handleCancelParse() {
  await sendMessage({ cmd: 'cancel-parse' });
  stopProgressPolling();
  parseProgress.classList.add('hidden');
  parseCommentsBtn.classList.remove('hidden');
  showStatus('error', t('comments_cancelled', 'Parsing cancelled'));
}

// Check if parse is active (e.g., popup reopened)
async function checkActiveParse() {
  try {
    const status = await sendMessage({ cmd: 'get-parse-status' });
    if (status.active || (status.progress?.phase && !['idle', 'done', 'error', 'cancelled'].includes(status.progress.phase))) {
      parseCommentsBtn.classList.add('hidden');
      parseProgress.classList.remove('hidden');
      startProgressPolling();
      updateParseUI(status);
    } else if (status.error?.code === 'INTERRUPTED') {
      // Job died with the service worker while the popup was closed
      updateParseUI(status);
    }
  } catch (e) {
    // Ignore
  }
}

// Send message to background script
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response || {});
      }
    });
  });
}

// Listen for theme changes from settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.theme) {
    const theme = changes.theme.newValue || 'light';
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
});
