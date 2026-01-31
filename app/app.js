// Bulk Import App for Add to NotebookLM

document.addEventListener('DOMContentLoaded', init);

// DOM elements
let notebookSelect, newNotebookBtn;
let linksPanel, tabsPanel, settingsPanel;
let linksInput, linkCount, importLinksBtn;
let tabsContainer, tabsCount, importTabsBtn, selectAllTabs;
let progressContainer, progressFill, progressText;
let statusDiv;
let settingsAccountSelect, settingsLanguageSelect, autoOpenNotebook, enableBulkDelete;

// State
let notebooks = [];
let allTabs = [];
let selectedTabs = new Set();
let currentTab = 'links';

const {
  sendMessage,
  fillAccountSelect,
  fillNotebookSelect,
  setSingleOption,
  getLastNotebook
} = SharedUI;

async function init() {
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

  // Set up event listeners
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  newNotebookBtn.addEventListener('click', handleNewNotebook);
  linksInput.addEventListener('input', updateLinkCount);
  importLinksBtn.addEventListener('click', handleImportLinks);
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

  // Check URL hash for initial tab
  if (location.hash === '#tabs') {
    switchTab('tabs');
  } else if (location.hash === '#settings') {
    switchTab('settings');
  }

  // Check for pending URL from context menu
  const storage = await chrome.storage.local.get(['pendingUrl', 'pendingTitle']);
  if (storage.pendingUrl) {
    linksInput.value = storage.pendingUrl;
    updateLinkCount();
    chrome.storage.local.remove(['pendingUrl', 'pendingTitle']);
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
      setSingleOption(notebookSelect, loginText);
      showStatus('error', response.error);
      return;
    }

    notebooks = response.notebooks || [];

    const lastNotebook = await getLastNotebook();

    const sourcesText = I18n ? I18n.get('common_sources') : 'sources';
    const noNotebooksText = I18n ? I18n.get('popup_noNotebooks') : 'No notebooks found';
    fillNotebookSelect(notebookSelect, notebooks, {
      lastNotebook,
      sourcesLabel: sourcesText,
      emptyLabel: noNotebooksText
    });

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
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 24px; text-align: center; color: #5f6368;';
    errorDiv.textContent = failedText;
    tabsContainer.appendChild(errorDiv);
  }
}

// Default favicon as data URI (safe constant)
const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>');

// Validate favicon URL - only allow safe protocols
function getSafeFaviconUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_FAVICON;
  try {
    const parsed = new URL(url);
    // Only allow http, https, and data URIs (for chrome:// internal pages)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:') {
      return url;
    }
  } catch {
    // Invalid URL
  }
  return DEFAULT_FAVICON;
}

// Render tabs list (XSS-safe using DOM methods)
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
    item.className = 'tab-item' + (selectedTabs.has(tab.id) ? ' selected' : '');
    item.dataset.id = tab.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTabs.has(tab.id);
    item.appendChild(checkbox);

    const favicon = document.createElement('img');
    favicon.className = 'tab-item-favicon';
    favicon.src = getSafeFaviconUrl(tab.favIconUrl);
    favicon.alt = '';
    favicon.onerror = () => { favicon.src = DEFAULT_FAVICON; };
    item.appendChild(favicon);

    const info = document.createElement('div');
    info.className = 'tab-item-info';

    const title = document.createElement('div');
    title.className = 'tab-item-title';
    title.textContent = SharedUI.cleanYouTubeTitle(tab.title) || 'Untitled';
    info.appendChild(title);

    const url = document.createElement('div');
    url.className = 'tab-item-url';
    url.textContent = tab.url;
    info.appendChild(url);

    item.appendChild(info);

    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        checkbox.checked = !checkbox.checked;
      }
      toggleTab(tab.id);
    });

    tabsContainer.appendChild(item);
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

// Validate URL - only allow http/https protocols
function isValidUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Maximum URLs allowed per import (DoS protection)
const MAX_URLS_PER_IMPORT = 200;

// Parse links from text (with security validation)
function parseLinks(text) {
  const lines = text.split('\n');
  const links = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Only allow http/https URLs
    if (trimmed && isValidUrl(trimmed)) {
      links.push(trimmed);
    }
  }

  // Remove duplicates and limit to max allowed
  const uniqueLinks = [...new Set(links)];
  if (uniqueLinks.length > MAX_URLS_PER_IMPORT) {
    console.warn(`Too many URLs (${uniqueLinks.length}), limiting to ${MAX_URLS_PER_IMPORT}`);
    return uniqueLinks.slice(0, MAX_URLS_PER_IMPORT);
  }

  return uniqueLinks;
}

// Update import buttons state
function updateImportButtons() {
  const hasNotebook = notebookSelect.value !== '';
  const links = parseLinks(linksInput.value);

  const importLinksText = I18n ? I18n.get('bulk_importLinks') : 'Import Links';
  const importTabsText = I18n ? I18n.get('bulk_importTabs') : 'Import Selected Tabs';

  importLinksBtn.disabled = !hasNotebook || links.length === 0;
  importLinksBtn.innerHTML = `📦 ${importLinksText} (${links.length})`;

  importTabsBtn.disabled = !hasNotebook || selectedTabs.size === 0;
  importTabsBtn.innerHTML = `📦 ${importTabsText} (${selectedTabs.size})`;
}

// Handle new notebook creation
async function handleNewNotebook() {
  const promptText = I18n ? I18n.get('popup_notebookName') : 'Notebook name';
  const name = prompt(promptText + ':');
  if (!name) return;

  try {
    newNotebookBtn.disabled = true;
    const creatingText = I18n ? I18n.get('popup_loading') : 'Creating...';
    newNotebookBtn.innerHTML = `⏳ ${creatingText}`;

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
    newNotebookBtn.innerHTML = `➕ ${createText}`;
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
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;

    if (failed === 0) {
      const successText = I18n ? I18n.get('popup_success') : 'Successfully imported!';
      showStatus('success', `✓ ${successText} (${imported})`, notebookUrl);

      // Clear inputs
      if (currentTab === 'links') {
        linksInput.value = '';
        updateLinkCount();
      } else {
        selectedTabs.clear();
        renderTabs();
      }
    } else if (imported > 0) {
      showStatus('info', `${imported} OK, ${failed} failed.`, notebookUrl);
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

// Show status message (XSS-safe)
let statusTimeout = null;
function showStatus(type, message, notebookUrl = null) {
  // Clear any existing timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  statusDiv.className = `status visible ${type}`;
  statusDiv.textContent = '';

  // Create message content
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  statusDiv.appendChild(messageSpan);

  // Add notebook link if provided
  if (notebookUrl) {
    statusDiv.appendChild(document.createElement('br'));
    const openText = I18n ? I18n.get('bulk_openNotebook') : 'Open notebook';
    const link = document.createElement('a');
    link.href = notebookUrl;
    link.target = '_blank';
    link.textContent = openText + ' →';
    statusDiv.appendChild(link);
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

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load settings
async function loadSettings() {
  try {
    // Add click handler for Open NotebookLM button
    const openBtn = document.getElementById('open-notebooklm-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://notebooklm.google.com' });
      });
    }

    // Load saved settings
    const storage = await chrome.storage.sync.get(['selectedAccount', 'autoOpenNotebook', 'enableBulkDelete', 'language']);

    // Set current language in selector
    if (settingsLanguageSelect && I18n) {
      settingsLanguageSelect.value = I18n.getLanguage();
    }

    // Load accounts
    const response = await sendMessage({ cmd: 'list-accounts' });
    const accounts = response.accounts || [];

    if (settingsAccountSelect) {
      fillAccountSelect(settingsAccountSelect, accounts, {
        selectedAccount: storage.selectedAccount || 0
      });
    }

    // Set auto-open checkbox
    if (autoOpenNotebook) {
      autoOpenNotebook.checked = storage.autoOpenNotebook || false;
    }

    // Set bulk delete checkbox (default to true)
    if (enableBulkDelete) {
      enableBulkDelete.checked = storage.enableBulkDelete !== false;
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

// Handle settings account change
async function handleSettingsAccountChange() {
  const account = parseInt(settingsAccountSelect.value);
  await chrome.storage.sync.set({ selectedAccount: account });

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
