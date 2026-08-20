// Bulk Import App for Add to NotebookLM

document.addEventListener('DOMContentLoaded', init);

// DOM elements
let notebookSelect, newNotebookBtn;
let linksPanel, tabsPanel, settingsPanel;
let linksInput, linkCount, importLinksBtn;
let rssUrlInput, rssFetchBtn;
let tabsContainer, tabsCount, importTabsBtn, selectAllTabs;
let progressContainer, progressFill, progressText;
let statusDiv;
let settingsAccountSelect, settingsLanguageSelect, autoOpenNotebook, enableBulkDelete;
let commentsModeSelect, commentsLimitSelect, commentsLimitGroup, commentsIncludeReplies;
let themeToggle;

// State
let notebooks = [];
let accounts = [];
let allTabs = [];
let selectedTabs = new Set();
let currentTab = 'links';

async function init() {
  // Initialize theme first (before any rendering)
  await initTheme();

  // Initialize localization first
  if (window.I18n) {
    await I18n.init();
  }

  // Get DOM elements
  notebookSelect = document.getElementById('notebook-select');
  newNotebookBtn = document.getElementById('new-notebook-btn');
  linksPanel = document.getElementById('links-panel');
  tabsPanel = document.getElementById('tabs-panel');
  settingsPanel = document.getElementById('settings-panel');
  linksInput = document.getElementById('links-input');
  linkCount = document.getElementById('link-count');
  importLinksBtn = document.getElementById('import-links-btn');
  rssUrlInput = document.getElementById('rss-url-input');
  rssFetchBtn = document.getElementById('rss-fetch-btn');
  tabsContainer = document.getElementById('tabs-container');
  tabsCount = document.getElementById('tabs-count');
  importTabsBtn = document.getElementById('import-tabs-btn');
  selectAllTabs = document.getElementById('select-all-tabs');
  progressContainer = document.getElementById('progress-container');
  progressFill = document.getElementById('progress-fill');
  progressText = document.getElementById('progress-text');
  statusDiv = document.getElementById('status');
  settingsAccountSelect = document.getElementById('settings-account-select');
  settingsLanguageSelect = document.getElementById('settings-language-select');
  autoOpenNotebook = document.getElementById('auto-open-notebook');
  enableBulkDelete = document.getElementById('enable-bulk-delete');
  commentsModeSelect = document.getElementById('comments-mode');
  commentsLimitSelect = document.getElementById('comments-limit');
  commentsLimitGroup = document.getElementById('comments-limit-group');
  commentsIncludeReplies = document.getElementById('comments-include-replies');
  themeToggle = document.getElementById('theme-toggle');

  // Set up event listeners
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  newNotebookBtn.addEventListener('click', handleNewNotebook);
  linksInput.addEventListener('input', updateLinkCount);
  importLinksBtn.addEventListener('click', handleImportLinks);
  rssFetchBtn.addEventListener('click', handleRssFetch);
  importTabsBtn.addEventListener('click', handleImportTabs);
  selectAllTabs.addEventListener('change', handleSelectAllTabs);
  notebookSelect.addEventListener('change', updateImportButtons);

  // Settings event listeners
  if (settingsAccountSelect) {
    settingsAccountSelect.addEventListener('change', handleSettingsAccountChange);
  }
  if (settingsLanguageSelect) {
    settingsLanguageSelect.addEventListener('change', handleLanguageChange);
  }
  if (autoOpenNotebook) {
    autoOpenNotebook.addEventListener('change', handleAutoOpenChange);
  }
  if (enableBulkDelete) {
    enableBulkDelete.addEventListener('change', handleBulkDeleteChange);
  }
  if (commentsModeSelect) {
    commentsModeSelect.addEventListener('change', handleCommentsModeChange);
  }
  if (commentsLimitSelect) {
    commentsLimitSelect.addEventListener('change', handleCommentsLimitChange);
  }
  if (commentsIncludeReplies) {
    commentsIncludeReplies.addEventListener('change', handleCommentsRepliesChange);
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', handleThemeToggle);
    themeToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleThemeToggle();
      }
    });
  }

  // Check URL hash for initial tab
  if (location.hash === '#tabs') {
    switchTab('tabs');
  } else if (location.hash === '#settings') {
    switchTab('settings');
  }

  // Check for pending URL from context menu
  const storage = await chrome.storage.local.get(['pendingUrl', 'pendingTitle', 'pendingLinks']);
  if (storage.pendingUrl) {
    linksInput.value = storage.pendingUrl;
    updateLinkCount();
    chrome.storage.local.remove(['pendingUrl', 'pendingTitle']);
  }

  // Check for links grabbed from a page via the popup
  if (storage.pendingLinks && storage.pendingLinks.length > 0) {
    const grabbed = storage.pendingLinks.join('\n');
    linksInput.value = linksInput.value ? `${linksInput.value}\n${grabbed}` : grabbed;
    updateLinkCount();
    chrome.storage.local.remove(['pendingLinks']);
  }

  // Load data
  await loadNotebooks();
  await loadTabs();
}

// Switch between tabs
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update panels
  linksPanel.classList.toggle('hidden', tabName !== 'links');
  tabsPanel.classList.toggle('hidden', tabName !== 'tabs');
  if (settingsPanel) {
    settingsPanel.classList.toggle('hidden', tabName !== 'settings');
  }

  // Update URL hash
  if (tabName === 'tabs') {
    history.replaceState(null, '', '#tabs');
  } else if (tabName === 'settings') {
    history.replaceState(null, '', '#settings');
  } else {
    history.replaceState(null, '', '#');
  }

  // Load settings data when switching to settings tab
  if (tabName === 'settings') {
    loadSettings();
  }
}

// Load notebooks
async function loadNotebooks() {
  try {
    const response = await sendMessage({ cmd: 'list-notebooks' });

    if (response.error) {
      const loginText = I18n ? I18n.get('popup_loginRequired') : 'Login to NotebookLM first';
      notebookSelect.textContent = '';
      const loginOption = document.createElement('option');
      loginOption.value = '';
      loginOption.textContent = loginText;
      notebookSelect.appendChild(loginOption);
      showStatus('error', response.error);
      return;
    }

    notebooks = response.notebooks || [];

    // Get last used notebook
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    const lastNotebook = storage.lastNotebook;

    // Populate select
    notebookSelect.textContent = '';
    if (notebooks.length === 0) {
      const noNotebooksText = I18n ? I18n.get('popup_noNotebooks') : 'No notebooks found';
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = noNotebooksText;
      notebookSelect.appendChild(emptyOption);
    } else {
      const sourcesText = I18n ? I18n.get('common_sources') : 'sources';
      notebooks.forEach(nb => {
        const option = document.createElement('option');
        option.value = nb.id;
        option.textContent = `${nb.emoji} ${nb.name} (${nb.sources} ${sourcesText})`;
        if (nb.id === lastNotebook) option.selected = true;
        notebookSelect.appendChild(option);
      });
    }

    updateImportButtons();

  } catch (error) {
    const errorText = I18n ? I18n.get('popup_error') : 'Failed to load notebooks';
    showStatus('error', errorText);
  }
}

// Load browser tabs
async function loadTabs() {
  try {
    const response = await sendMessage({ cmd: 'get-all-tabs' });
    allTabs = response.tabs || [];

    renderTabs();

  } catch (error) {
    const failedText = I18n ? I18n.get('bulk_failedToLoad') : 'Failed to load tabs';
    tabsContainer.textContent = '';
    const failedDiv = document.createElement('div');
    failedDiv.style.cssText = 'padding: 24px; text-align: center; color: #5f6368;';
    failedDiv.textContent = failedText;
    tabsContainer.appendChild(failedDiv);
  }
}

// Render tabs list
function renderTabs() {
  tabsContainer.textContent = '';

  if (allTabs.length === 0) {
    const noTabsText = I18n ? I18n.get('bulk_noTabs') : 'No tabs found';
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 24px; text-align: center; color: #5f6368;';
    emptyDiv.textContent = noTabsText;
    tabsContainer.appendChild(emptyDiv);
    return;
  }

  allTabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = `tab-item ${selectedTabs.has(tab.id) ? 'selected' : ''}`;
    item.dataset.id = tab.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTabs.has(tab.id);

    const favicon = document.createElement('img');
    favicon.className = 'tab-item-favicon';
    favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>';
    favicon.alt = '';

    const info = document.createElement('div');
    info.className = 'tab-item-info';

    const title = document.createElement('div');
    title.className = 'tab-item-title';
    title.textContent = tab.title || 'Untitled';

    const url = document.createElement('div');
    url.className = 'tab-item-url';
    url.textContent = tab.url;

    info.appendChild(title);
    info.appendChild(url);
    item.appendChild(checkbox);
    item.appendChild(favicon);
    item.appendChild(info);
    tabsContainer.appendChild(item);
  });

  // Add click listeners
  tabsContainer.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
      }
      toggleTab(parseInt(item.dataset.id));
    });
  });

  updateTabsCount();
}

// Toggle tab selection
function toggleTab(tabId) {
  if (selectedTabs.has(tabId)) {
    selectedTabs.delete(tabId);
  } else {
    selectedTabs.add(tabId);
  }

  const item = tabsContainer.querySelector(`[data-id="${tabId}"]`);
  if (item) {
    item.classList.toggle('selected', selectedTabs.has(tabId));
  }

  updateTabsCount();
  updateSelectAllState();
}

// Handle select all tabs
function handleSelectAllTabs() {
  if (selectAllTabs.checked) {
    allTabs.forEach(tab => selectedTabs.add(tab.id));
  } else {
    selectedTabs.clear();
  }
  renderTabs();
}

// Update select all checkbox state
function updateSelectAllState() {
  selectAllTabs.checked = selectedTabs.size === allTabs.length && allTabs.length > 0;
  selectAllTabs.indeterminate = selectedTabs.size > 0 && selectedTabs.size < allTabs.length;
}

// Update tabs count
function updateTabsCount() {
  const tabsText = I18n ? I18n.get('common_tabs') : 'tabs';
  tabsCount.textContent = `${selectedTabs.size} ${tabsText}`;
  updateImportButtons();
}

// Update link count
function updateLinkCount() {
  const links = parseLinks(linksInput.value);
  const linksText = I18n ? I18n.get('common_links') : 'links';
  linkCount.textContent = `${links.length} ${linksText}`;
  updateImportButtons();
}

// Parse links from text
function parseLinks(text) {
  const lines = text.split('\n');
  const links = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
      try {
        new URL(trimmed); // Validate URL
        links.push(trimmed);
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }

  return [...new Set(links)]; // Remove duplicates
}

// Load links from an RSS/Atom feed into the links textarea
async function handleRssFetch() {
  const feedUrl = rssUrlInput.value.trim();
  const invalidUrlText = I18n ? I18n.get('bulk_rssInvalidUrl') : 'Enter a URL starting with http:// or https://';

  if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
    showStatus('error', invalidUrlText);
    return;
  }

  let host;
  try {
    host = new URL(feedUrl).hostname;
  } catch (e) {
    showStatus('error', invalidUrlText);
    return;
  }

  // Ask only for the feed's own host, but for both schemes — feeds routinely
  // redirect http -> https, and the redirect needs its own permission
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [`http://${host}/*`, `https://${host}/*`] });
  } catch (e) {
    showStatus('error', I18n ? I18n.get('bulk_rssLoadError') : 'Could not load the feed');
    return;
  }
  if (!granted) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    rssFetchBtn.disabled = true;

    const response = await fetch(feedUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const links = parseFeedLinks(await response.text(), feedUrl);

    if (links.length === 0) {
      const noLinksText = I18n ? I18n.get('bulk_rssNoLinks') : 'No links found in the feed';
      showStatus('error', noLinksText);
      return;
    }

    const feedLinks = links.join('\n');
    linksInput.value = linksInput.value ? `${linksInput.value}\n${feedLinks}` : feedLinks;
    updateLinkCount();
    rssUrlInput.value = '';

    const addedText = I18n ? I18n.get('bulk_rssLinksAdded', { count: links.length }) : `Links added: ${links.length}`;
    showStatus('success', `✓ ${addedText}`);

  } catch (error) {
    const errorText = I18n ? I18n.get('bulk_rssLoadError') : 'Could not load the feed';
    showStatus('error', errorText);
  } finally {
    clearTimeout(timeoutId);
    rssFetchBtn.disabled = false;
  }
}

// Extract entry links from an RSS 2.0 or Atom feed
function parseFeedLinks(xmlText, feedUrl) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.documentElement.nodeName === 'parsererror') return [];

  const found = [];

  // RSS 2.0: <item><link>https://...</link></item>
  doc.querySelectorAll('item > link').forEach(link => found.push(link.textContent));

  // Atom: <entry><link href="https://..."/></entry>, several links per entry are possible
  doc.querySelectorAll('entry').forEach(entry => {
    const candidates = [...entry.querySelectorAll('link[href]')];
    const chosen = candidates.find(link => {
      const rel = link.getAttribute('rel');
      return !rel || rel === 'alternate';
    }) || candidates[0];
    if (chosen) found.push(chosen.getAttribute('href'));
  });

  // Feeds may use relative hrefs, so resolve everything against the feed URL first
  const links = [];
  for (const href of found) {
    const trimmed = (href || '').trim();
    if (!trimmed) continue;

    let resolved;
    try {
      resolved = new URL(trimmed, feedUrl).href;
    } catch (e) {
      continue;
    }

    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      links.push(resolved);
    }
  }

  return [...new Set(links)];
}

// Update import buttons state
function updateImportButtons() {
  const hasNotebook = notebookSelect.value !== '';
  const links = parseLinks(linksInput.value);

  const importLinksText = I18n ? I18n.get('bulk_importLinks') : 'Import Links';
  const importTabsText = I18n ? I18n.get('bulk_importTabs') : 'Import Selected Tabs';

  importLinksBtn.disabled = !hasNotebook || links.length === 0;
  importLinksBtn.textContent = `📦 ${importLinksText} (${links.length})`;

  importTabsBtn.disabled = !hasNotebook || selectedTabs.size === 0;
  importTabsBtn.textContent = `📦 ${importTabsText} (${selectedTabs.size})`;
}

// Handle new notebook creation
async function handleNewNotebook() {
  const promptText = I18n ? I18n.get('popup_notebookName') : 'Notebook name';
  const name = prompt(promptText + ':');
  if (!name) return;

  try {
    newNotebookBtn.disabled = true;
    const creatingText = I18n ? I18n.get('popup_loading') : 'Creating...';
    newNotebookBtn.textContent = `⏳ ${creatingText}`;

    const response = await sendMessage({
      cmd: 'create-notebook',
      title: name,
      emoji: '📔'
    });

    if (response.error) {
      showStatus('error', response.error);
    } else {
      showStatus('success', `✓ ${name}`);
      await loadNotebooks();
      notebookSelect.value = response.notebook.id;
      updateImportButtons();
    }

  } catch (error) {
    const errorText = I18n ? I18n.get('popup_error') : 'Failed to create notebook';
    showStatus('error', errorText);
  } finally {
    newNotebookBtn.disabled = false;
    const createText = I18n ? I18n.get('bulk_createNewNotebook') : 'Create New Notebook';
    newNotebookBtn.textContent = `➕ ${createText}`;
  }
}

// Handle import links
async function handleImportLinks() {
  const notebookId = notebookSelect.value;
  const links = parseLinks(linksInput.value);

  if (!notebookId || links.length === 0) return;

  await importUrls(notebookId, links);
}

// Handle import tabs
async function handleImportTabs() {
  const notebookId = notebookSelect.value;
  const urls = allTabs
    .filter(tab => selectedTabs.has(tab.id))
    .map(tab => tab.url);

  if (!notebookId || urls.length === 0) return;

  await importUrls(notebookId, urls);
}

// Import URLs to notebook
async function importUrls(notebookId, urls) {
  try {
    // Disable buttons
    importLinksBtn.disabled = true;
    importTabsBtn.disabled = true;

    // Show progress
    showProgress(0, urls.length);
    hideStatus();

    // Import in batches of 10
    const batchSize = 10;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);

      try {
        const response = await sendMessage({
          cmd: 'add-sources',
          notebookId: notebookId,
          urls: batch
        });

        if (response.error) {
          failed += batch.length;
        } else {
          imported += batch.length;
        }
      } catch (error) {
        failed += batch.length;
      }

      showProgress(Math.min(i + batchSize, urls.length), urls.length);
    }

    // Save last notebook
    await chrome.storage.sync.set({ lastNotebook: notebookId });

    // Show result
    hideProgress();

    const notebook = notebooks.find(n => n.id === notebookId);
    const notebookUrl = `https://notebook.google.com/notebook/${notebookId}`;
    const openText = I18n ? I18n.get('bulk_openNotebook') : 'Open notebook';

    if (failed === 0) {
      const successText = I18n ? I18n.get('popup_success') : 'Successfully imported!';
      showStatus('success', `
        ✓ ${successText} (${imported})
        <br><a href="${notebookUrl}" target="_blank">${openText} →</a>
      `);

      // Clear inputs
      if (currentTab === 'links') {
        linksInput.value = '';
        updateLinkCount();
      } else {
        selectedTabs.clear();
        renderTabs();
      }
    } else if (imported > 0) {
      showStatus('info', `
        ${imported} OK, ${failed} failed.
        <br><a href="${notebookUrl}" target="_blank">${openText} →</a>
      `);
    } else {
      const errorText = I18n ? I18n.get('popup_error') : 'Failed to import items. Please try again.';
      showStatus('error', errorText);
    }

    // Reload notebooks to update source counts
    await loadNotebooks();

  } catch (error) {
    hideProgress();
    const errorText = I18n ? I18n.get('popup_error') : 'Import failed';
    showStatus('error', errorText + ': ' + error.message);
  } finally {
    updateImportButtons();
  }
}

// Show progress bar
function showProgress(current, total) {
  progressContainer.classList.add('visible');
  const percent = Math.round((current / total) * 100);
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${current} / ${total}...`;
}

// Hide progress bar
function hideProgress() {
  progressContainer.classList.remove('visible');
  progressFill.style.width = '0%';
}

// Show status message
let statusTimeout = null;
function showStatus(type, message) {
  // Clear any existing timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  statusDiv.className = `status visible ${type}`;
  statusDiv.textContent = '';
  // For messages with HTML links, parse safely
  if (message.includes('<a ')) {
    const temp = document.createElement('template');
    temp.innerHTML = message;
    // Only allow text nodes and <a>/<br> elements
    for (const node of temp.content.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        statusDiv.appendChild(document.createTextNode(node.textContent));
      } else if (node.nodeName === 'A') {
        const a = document.createElement('a');
        a.href = node.getAttribute('href');
        a.target = '_blank';
        a.textContent = node.textContent;
        statusDiv.appendChild(a);
      } else if (node.nodeName === 'BR') {
        statusDiv.appendChild(document.createElement('br'));
      }
    }
  } else {
    statusDiv.textContent = message;
  }

  // Auto-hide after 5 seconds for success/info messages
  if (type === 'success' || type === 'info') {
    statusTimeout = setTimeout(() => {
      hideStatus();
    }, 5000);
  }
}

// Hide status message
function hideStatus() {
  statusDiv.className = 'status';
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

// Load settings
async function loadSettings() {
  try {
    // Add click handler for Open NotebookLM button
    const openBtn = document.getElementById('open-notebooklm-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://notebook.google.com' });
      });
    }

    // Show extension version in the About section
    const versionEl = document.getElementById('about-version');
    if (versionEl) {
      versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
    }

    // Load saved settings
    const storage = await chrome.storage.sync.get(['autoOpenNotebook', 'enableBulkDelete', 'language', 'theme']);

    // Initialize theme toggle state
    if (themeToggle) {
      const isDark = storage.theme === 'dark';
      themeToggle.classList.toggle('active', isDark);
      themeToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
    }

    // Set current language in selector
    if (settingsLanguageSelect && I18n) {
      settingsLanguageSelect.value = I18n.getLanguage();
    }

    // Load accounts
    const response = await sendMessage({ cmd: 'list-accounts' });
    accounts = response.accounts || [];
    const selectedAccount = await resolveSelectedAccount(accounts);

    // Populate account selector
    if (settingsAccountSelect) {
      settingsAccountSelect.textContent = '';

      if (accounts.length > 0) {
        accounts.forEach((acc, index) => {
          const option = document.createElement('option');
          option.value = acc.index !== undefined ? acc.index : index;
          option.textContent = acc.email || acc.name || `Account ${index + 1}`;
          if ((acc.index !== undefined ? acc.index : index) === selectedAccount) {
            option.selected = true;
          }
          settingsAccountSelect.appendChild(option);
        });
      } else {
        // No accounts found - show single default option
        const option = document.createElement('option');
        option.value = 0;
        option.textContent = 'Default';
        settingsAccountSelect.appendChild(option);
      }
    }

    // Set auto-open checkbox
    if (autoOpenNotebook) {
      autoOpenNotebook.checked = storage.autoOpenNotebook || false;
    }

    // Set bulk delete checkbox (default to true)
    if (enableBulkDelete) {
      enableBulkDelete.checked = storage.enableBulkDelete !== false;
    }

    // Load comments settings
    const localSettings = await chrome.storage.local.get(['commentsMode', 'commentsLimit', 'commentsIncludeReplies']);
    if (commentsModeSelect) {
      commentsModeSelect.value = localSettings.commentsMode || 'top';
    }
    if (commentsLimitSelect) {
      commentsLimitSelect.value = String(localSettings.commentsLimit ?? 1000);
    }
    // Show/hide limit group based on mode
    if (commentsLimitGroup) {
      commentsLimitGroup.style.display = (localSettings.commentsMode === 'newest') ? 'block' : 'none';
    }
    if (commentsIncludeReplies) {
      const mode = localSettings.commentsMode || 'top';
      commentsIncludeReplies.checked = localSettings.commentsIncludeReplies !== undefined
        ? localSettings.commentsIncludeReplies
        : (mode === 'top');
    }

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Handle language change
async function handleLanguageChange() {
  const lang = settingsLanguageSelect.value;
  if (I18n) {
    await I18n.setLanguage(lang);
    // Update dynamic content that wasn't set via data-i18n
    updateLinkCount();
    updateTabsCount();
    updateImportButtons();
    await loadNotebooks();

    const successText = I18n.get('settings_accountChanged').replace('Account changed', 'Language changed');
    showStatus('success', '✓ ' + (lang === 'ru' ? 'Язык изменён' : 'Language changed'));
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

// Handle settings account change
async function handleSettingsAccountChange() {
  const account = parseInt(settingsAccountSelect.value);
  // Store the email alongside the index so a shifted index can be repaired later
  const selected = accounts.find(acc => acc.index === account);
  await chrome.storage.sync.set({
    selectedAccount: account,
    selectedAccountEmail: selected ? selected.email : null
  });

  // Reload notebooks with new account
  await loadNotebooks();

  const successText = I18n ? I18n.get('settings_accountChanged') : 'Account changed. Notebooks reloaded.';
  showStatus('success', successText);
}

// Handle auto-open checkbox change
async function handleAutoOpenChange() {
  await chrome.storage.sync.set({ autoOpenNotebook: autoOpenNotebook.checked });
}

// Handle bulk delete checkbox change
async function handleBulkDeleteChange() {
  await chrome.storage.sync.set({ enableBulkDelete: enableBulkDelete.checked });
}

// Handle comments mode change
async function handleCommentsModeChange() {
  const mode = commentsModeSelect.value;
  await chrome.storage.local.set({ commentsMode: mode });

  // Show/hide limit group
  if (commentsLimitGroup) {
    commentsLimitGroup.style.display = (mode === 'newest') ? 'block' : 'none';
  }

  // Set default replies based on mode
  const defaultReplies = mode === 'top';
  commentsIncludeReplies.checked = defaultReplies;
  await chrome.storage.local.set({ commentsIncludeReplies: defaultReplies });
}

// Handle comments limit change
async function handleCommentsLimitChange() {
  const limit = parseInt(commentsLimitSelect.value, 10);
  await chrome.storage.local.set({ commentsLimit: limit });
}

// Handle comments replies toggle change
async function handleCommentsRepliesChange() {
  await chrome.storage.local.set({ commentsIncludeReplies: commentsIncludeReplies.checked });
}

// ===== Theme Management =====

// Initialize theme from storage
async function initTheme() {
  try {
    const storage = await chrome.storage.sync.get(['theme']);
    const theme = storage.theme || 'light';
    applyTheme(theme);
  } catch (e) {
    // Default to light theme
    applyTheme('light');
  }
}

// Apply theme to document
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update toggle state if it exists
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    const isDark = theme === 'dark';
    toggle.classList.toggle('active', isDark);
    toggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
  }
}

// Handle theme toggle click
async function handleThemeToggle() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';

  applyTheme(newTheme);
  await chrome.storage.sync.set({ theme: newTheme });
}

// Listen for theme changes from other contexts (popup, other tabs)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.theme) {
    applyTheme(changes.theme.newValue || 'light');
  }
});
