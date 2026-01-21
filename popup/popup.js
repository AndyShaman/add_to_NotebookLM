// Popup script for Add to NotebookLM

document.addEventListener('DOMContentLoaded', init);

// DOM elements
let notebookSelect, addBtn, newNotebookBtn, bulkBtn, tabsBtn;
let accountSelect, statusDiv, currentUrlDiv, settingsBtn, openNotebookBtn;
let newNotebookModal, newNotebookInput, modalCancel, modalCreate;

// Current state
let currentTab = null;
let notebooks = [];
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
  newNotebookBtn = document.getElementById('new-notebook-btn');
  bulkBtn = document.getElementById('bulk-btn');
  tabsBtn = document.getElementById('tabs-btn');
  accountSelect = document.getElementById('account-select');
  statusDiv = document.getElementById('status');
  currentUrlDiv = document.getElementById('current-url');
  newNotebookModal = document.getElementById('new-notebook-modal');
  newNotebookInput = document.getElementById('new-notebook-name');
  modalCancel = document.getElementById('modal-cancel');
  modalCreate = document.getElementById('modal-create');
  settingsBtn = document.getElementById('settings-btn');
  openNotebookBtn = document.getElementById('open-notebook-btn');

  // Set up event listeners
  addBtn.addEventListener('click', handleAddToNotebook);
  newNotebookBtn.addEventListener('click', showNewNotebookModal);
  bulkBtn.addEventListener('click', openBulkImport);
  tabsBtn.addEventListener('click', openTabsImport);
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

  if (!url.includes('youtube.com')) {
    return;
  }

  // Check for playlist context first (even when watching a video from playlist)
  const urlObj = new URL(url);
  const hasPlaylistParam = urlObj.searchParams.has('list');

  if (url.includes('/playlist')) {
    // Dedicated playlist page
    youtubePageType = 'playlist';
    const playlistText = t('popup_addPlaylist', 'Add Playlist to Notebook');
    addBtn.innerHTML = `<span>📋</span> ${playlistText}`;
    const playlistLabel = t('popup_playlist', 'Playlist');
    currentUrlDiv.innerHTML = `📋 <strong>${playlistLabel}:</strong> ${currentTab.title.replace(' - YouTube', '')}`;
  } else if (url.includes('/watch') && hasPlaylistParam) {
    // Watching a video from a playlist
    youtubePageType = 'playlist_video';
    const addAllText = t('popup_addAllPlaylist', 'Add All Playlist Videos');
    addBtn.innerHTML = `<span>📋</span> ${addAllText}`;
    const videoFromPlaylist = t('popup_videoFromPlaylist', 'Video from Playlist');
    const clickToAdd = t('popup_clickToAddAll', 'Click to add all videos');
    currentUrlDiv.innerHTML = `📋 <strong>${videoFromPlaylist}</strong> - ${clickToAdd}`;
  } else if (url.includes('/watch')) {
    // Single video
    youtubePageType = 'video';
    const addVideoText = t('popup_addVideo', 'Add Video to Notebook');
    addBtn.innerHTML = `<span>➕</span> ${addVideoText}`;
  } else if (url.includes('/@') || url.includes('/channel/') || url.includes('/c/')) {
    youtubePageType = 'channel';
    const addChannelText = t('popup_addChannelVideos', 'Add Channel Videos to Notebook');
    addBtn.innerHTML = `<span>📺</span> ${addChannelText}`;
    const channelLabel = t('popup_channel', 'Channel');
    currentUrlDiv.innerHTML = `📺 <strong>${channelLabel}:</strong> ${currentTab.title.replace(' - YouTube', '')}`;
  }
}

// Load Google accounts
async function loadAccounts() {
  try {
    const response = await sendMessage({ cmd: 'list-accounts' });
    const accounts = response.accounts || [];

    // Get saved account
    const storage = await chrome.storage.sync.get(['selectedAccount']);
    const selectedAccount = storage.selectedAccount || 0;

    // Populate account selector
    accountSelect.innerHTML = '';

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
      notebookSelect.innerHTML = `<option value="">${loginText}</option>`;
      addBtn.disabled = true;
      return;
    }

    notebooks = response.notebooks || [];
    hideStatus();

    // Get last used notebook
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    const lastNotebook = storage.lastNotebook;

    // Populate notebook selector
    notebookSelect.innerHTML = '';

    if (notebooks.length === 0) {
      const noNotebooksText = t('popup_noNotebooks', 'No notebooks found');
      notebookSelect.innerHTML = `<option value="">${noNotebooksText}</option>`;
      addBtn.disabled = true;
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
    }
  } catch (error) {
    console.error('Error loading notebooks:', error);
    const errorText = t('popup_error', 'Failed to load notebooks');
    showStatus('error', errorText);
    addBtn.disabled = true;
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
    // Get videos from channel page
    const videos = document.querySelectorAll('ytd-rich-grid-media a#video-title-link, ytd-grid-video-renderer a#video-title');
    videos.forEach(video => {
      const href = video.getAttribute('href');
      if (href && href.includes('/watch')) {
        urls.push(`https://www.youtube.com${href.split('&')[0]}`);
      }
    });
  }

  // Remove duplicates and limit to 50
  return [...new Set(urls)].slice(0, 50);
}

// Show success message with action buttons
function showSuccessWithActions(notebook, videoCount = null) {
  const notebookUrl = `https://notebooklm.google.com/notebook/${notebook.id}`;
  const countText = videoCount ? `${videoCount} ${t('common_videos', 'videos')}` : t('common_item', 'page');
  const addedToText = t('popup_addedTo', 'Added to');
  const openNotebookText = t('popup_openNotebook', 'Open Notebook');

  statusDiv.className = 'status success';
  statusDiv.innerHTML = `
    <div>✓ ${addedToText} "${notebook.emoji} ${notebook.name}"</div>
    <div class="success-actions">
      <button class="btn btn-secondary" id="open-notebook-btn">
        ${openNotebookText}
      </button>
    </div>
  `;

  // Add click listener (CSP doesn't allow inline onclick)
  document.getElementById('open-notebook-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: notebookUrl });
  });
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
    const isYouTube = currentTab?.url?.includes('youtube.com');
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
    if (currentTab?.url) {
      await sendMessage({
        cmd: 'add-source',
        notebookId: notebook.id,
        url: currentTab.url
      });
    }

    // Save as last notebook
    await chrome.storage.sync.set({ lastNotebook: notebook.id });

    hideNewNotebookModal();
    const successText = t('popup_success', 'Created and added!');
    showStatus('success', `✓ ${successText}`);

    // Reload notebooks
    await loadNotebooks();

    // Select new notebook
    notebookSelect.value = notebook.id;

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
  await chrome.storage.sync.set({ selectedAccount: account });

  // Reload notebooks with new account
  await loadNotebooks();
}

// Handle notebook selection change
async function handleNotebookChange() {
  const notebookId = notebookSelect.value;
  if (notebookId) {
    await chrome.storage.sync.set({ lastNotebook: notebookId });
    addBtn.disabled = false;
  } else {
    addBtn.disabled = true;
  }
}

// Open selected notebook in new tab
function handleOpenNotebook() {
  const notebookId = notebookSelect.value;
  if (notebookId) {
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
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

// Show status message
function showStatus(type, message) {
  statusDiv.className = `status ${type}`;

  if (type === 'loading') {
    statusDiv.innerHTML = `<div class="spinner"></div>${message}`;
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
