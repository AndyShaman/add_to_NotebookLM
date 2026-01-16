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
      notebookSelect.innerHTML = `<option value="">${loginText}</option>`;
      showStatus('error', response.error);
      return;
    }

    notebooks = response.notebooks || [];

    // Get last used notebook
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    const lastNotebook = storage.lastNotebook;

    // Populate select
    if (notebooks.length === 0) {
      const noNotebooksText = I18n ? I18n.get('popup_noNotebooks') : 'No notebooks found';
      notebookSelect.innerHTML = `<option value="">${noNotebooksText}</option>`;
    } else {
      const sourcesText = I18n ? I18n.get('common_sources') : 'sources';
      notebookSelect.innerHTML = notebooks.map(nb => `
        <option value="${nb.id}" ${nb.id === lastNotebook ? 'selected' : ''}>
          ${nb.emoji} ${nb.name} (${nb.sources} ${sourcesText})
        </option>
      `).join('');
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
    tabsContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: #5f6368;">${failedText}</div>`;
  }
}

// Render tabs list
function renderTabs() {
  if (allTabs.length === 0) {
    const noTabsText = I18n ? I18n.get('bulk_noTabs') : 'No tabs found';
    tabsContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: #5f6368;">${noTabsText}</div>`;
    return;
  }

  tabsContainer.innerHTML = allTabs.map(tab => `
    <div class="tab-item ${selectedTabs.has(tab.id) ? 'selected' : ''}" data-id="${tab.id}">
      <input type="checkbox" ${selectedTabs.has(tab.id) ? 'checked' : ''}>
      <img class="tab-item-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'}" alt="">
      <div class="tab-item-info">
        <div class="tab-item-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="tab-item-url">${escapeHtml(tab.url)}</div>
      </div>
    </div>
  `).join('');

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
  statusDiv.innerHTML = message;

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

    // Populate account selector
    if (settingsAccountSelect) {
      settingsAccountSelect.innerHTML = '';

      if (accounts.length > 0) {
        accounts.forEach((acc, index) => {
          const option = document.createElement('option');
          option.value = acc.index !== undefined ? acc.index : index;
          option.textContent = acc.email || acc.name || `Account ${index + 1}`;
          if ((acc.index !== undefined ? acc.index : index) === (storage.selectedAccount || 0)) {
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
