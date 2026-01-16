// Bulk Import App for Add to NotebookLM

document.addEventListener('DOMContentLoaded', init);

// DOM elements
let notebookSelect, newNotebookBtn;
let linksPanel, tabsPanel, settingsPanel;
let linksInput, linkCount, importLinksBtn;
let tabsContainer, tabsCount, importTabsBtn, selectAllTabs;
let progressContainer, progressFill, progressText;
let statusDiv;
let settingsAccountSelect, autoOpenNotebook;

// State
let notebooks = [];
let allTabs = [];
let selectedTabs = new Set();
let currentTab = 'links';

async function init() {
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
  autoOpenNotebook = document.getElementById('auto-open-notebook');

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
  if (autoOpenNotebook) {
    autoOpenNotebook.addEventListener('change', handleAutoOpenChange);
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
      notebookSelect.innerHTML = '<option value="">Login to NotebookLM first</option>';
      showStatus('error', response.error);
      return;
    }

    notebooks = response.notebooks || [];

    // Get last used notebook
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    const lastNotebook = storage.lastNotebook;

    // Populate select
    if (notebooks.length === 0) {
      notebookSelect.innerHTML = '<option value="">No notebooks found</option>';
    } else {
      notebookSelect.innerHTML = notebooks.map(nb => `
        <option value="${nb.id}" ${nb.id === lastNotebook ? 'selected' : ''}>
          ${nb.emoji} ${nb.name} (${nb.sources} sources)
        </option>
      `).join('');
    }

    updateImportButtons();

  } catch (error) {
    showStatus('error', 'Failed to load notebooks');
  }
}

// Load browser tabs
async function loadTabs() {
  try {
    const response = await sendMessage({ cmd: 'get-all-tabs' });
    allTabs = response.tabs || [];

    renderTabs();

  } catch (error) {
    tabsContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: #5f6368;">Failed to load tabs</div>';
  }
}

// Render tabs list
function renderTabs() {
  if (allTabs.length === 0) {
    tabsContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: #5f6368;">No tabs found</div>';
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
  tabsCount.textContent = `${selectedTabs.size} tab${selectedTabs.size !== 1 ? 's' : ''} selected`;
  updateImportButtons();
}

// Update link count
function updateLinkCount() {
  const links = parseLinks(linksInput.value);
  linkCount.textContent = `${links.length} link${links.length !== 1 ? 's' : ''} detected`;
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

  importLinksBtn.disabled = !hasNotebook || links.length === 0;
  importLinksBtn.textContent = `📦 Import ${links.length} Link${links.length !== 1 ? 's' : ''}`;

  importTabsBtn.disabled = !hasNotebook || selectedTabs.size === 0;
  importTabsBtn.textContent = `📦 Import ${selectedTabs.size} Tab${selectedTabs.size !== 1 ? 's' : ''}`;
}

// Handle new notebook creation
async function handleNewNotebook() {
  const name = prompt('Enter notebook name:');
  if (!name) return;

  try {
    newNotebookBtn.disabled = true;
    newNotebookBtn.textContent = 'Creating...';

    const response = await sendMessage({
      cmd: 'create-notebook',
      title: name,
      emoji: '📔'
    });

    if (response.error) {
      showStatus('error', response.error);
    } else {
      showStatus('success', `Created notebook "${name}"`);
      await loadNotebooks();
      notebookSelect.value = response.notebook.id;
      updateImportButtons();
    }

  } catch (error) {
    showStatus('error', 'Failed to create notebook');
  } finally {
    newNotebookBtn.disabled = false;
    newNotebookBtn.textContent = '➕ Create New Notebook';
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
      showStatus('success', `
        ✓ Successfully imported ${imported} item${imported !== 1 ? 's' : ''} to "${notebook?.name || 'notebook'}"!
        <br><a href="${notebookUrl}" target="_blank">Open notebook →</a>
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
        Imported ${imported} item${imported !== 1 ? 's' : ''}, ${failed} failed.
        <br><a href="${notebookUrl}" target="_blank">Open notebook →</a>
      `);
    } else {
      showStatus('error', 'Failed to import items. Please try again.');
    }

    // Reload notebooks to update source counts
    await loadNotebooks();

  } catch (error) {
    hideProgress();
    showStatus('error', 'Import failed: ' + error.message);
  } finally {
    updateImportButtons();
  }
}

// Show progress bar
function showProgress(current, total) {
  progressContainer.classList.add('visible');
  const percent = Math.round((current / total) * 100);
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `Importing ${current} of ${total}...`;
}

// Hide progress bar
function hideProgress() {
  progressContainer.classList.remove('visible');
  progressFill.style.width = '0%';
}

// Show status message
function showStatus(type, message) {
  statusDiv.className = `status visible ${type}`;
  statusDiv.innerHTML = message;
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
    const storage = await chrome.storage.sync.get(['selectedAccount', 'autoOpenNotebook']);

    // Load accounts
    const response = await sendMessage({ cmd: 'list-accounts' });
    const accounts = response.accounts || [];

    // Populate account selector
    if (settingsAccountSelect) {
      settingsAccountSelect.innerHTML = '';

      if (accounts.length > 0) {
        accounts.forEach((acc, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = acc.email || `Account ${index + 1}`;
          if (index === (storage.selectedAccount || 0)) {
            option.selected = true;
          }
          settingsAccountSelect.appendChild(option);
        });
      } else {
        // Default options if no accounts found
        for (let i = 0; i < 5; i++) {
          const option = document.createElement('option');
          option.value = i;
          option.textContent = `Account ${i + 1}`;
          if (i === (storage.selectedAccount || 0)) {
            option.selected = true;
          }
          settingsAccountSelect.appendChild(option);
        }
      }
    }

    // Set auto-open checkbox
    if (autoOpenNotebook) {
      autoOpenNotebook.checked = storage.autoOpenNotebook || false;
    }

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Handle settings account change
async function handleSettingsAccountChange() {
  const account = parseInt(settingsAccountSelect.value);
  await chrome.storage.sync.set({ selectedAccount: account });

  // Reload notebooks with new account
  await loadNotebooks();

  showStatus('success', 'Account changed. Notebooks reloaded.');
}

// Handle auto-open checkbox change
async function handleAutoOpenChange() {
  await chrome.storage.sync.set({ autoOpenNotebook: autoOpenNotebook.checked });
}
