// Background Service Worker for Add to NotebookLM
// Handles API calls and message passing between content scripts and popup

// ============================================
// NotebookLM API Client (inline)
// ============================================

const NotebookLMAPI = {
  BASE_URL: 'https://notebooklm.google.com',
  tokens: null,

  // Get authentication tokens from NotebookLM page
  async getTokens(authuser = 0) {
    try {
      const url = authuser > 0
        ? `${this.BASE_URL}/?authuser=${authuser}&pageId=none`
        : this.BASE_URL;

      const response = await fetch(url, {
        credentials: 'include',
        redirect: 'manual'
      });

      if (!response.ok && response.type !== 'opaqueredirect') {
        throw new Error('Failed to fetch NotebookLM page');
      }

      const html = await response.text();

      // Extract tokens from HTML
      const bl = this.extractToken('cfb2h', html);
      const at = this.extractToken('SNlM0e', html);

      if (!bl || !at) {
        throw new Error('Not authorized. Please login to NotebookLM first.');
      }

      this.tokens = { bl, at, authuser };
      return this.tokens;
    } catch (error) {
      console.error('getTokens error:', error);
      throw new Error('Please login to NotebookLM first');
    }
  },

  // Extract token from HTML using regex
  extractToken(key, html) {
    const regex = new RegExp(`"${key}":"([^"]+)"`);
    const match = regex.exec(html);
    return match ? match[1] : null;
  },

  // List all notebooks
  async listNotebooks() {
    const response = await this.rpc('wXbhsf', [null, 1, null, [2]]);
    return this.parseNotebookList(response);
  },

  // Parse notebook list from RPC response
  parseNotebookList(responseText) {
    try {
      // Response format: )]}'\n\nXX[[["wrb.fr","wXbhsf","[...]",...
      const lines = responseText.split('\n');
      const dataLine = lines.find(line => line.includes('wrb.fr'));
      if (!dataLine) return [];

      // Parse the nested JSON
      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      if (!innerData || !innerData[0]) return [];

      return innerData[0]
        .filter(item => item && item.length >= 3)
        .filter(item => {
          // Filter out shared notebooks (type 3)
          const metadata = item[5];
          return !(Array.isArray(metadata) && metadata.length > 0 && metadata[0] === 3);
        })
        .map(item => ({
          id: item[2],
          name: item[0]?.trim() || 'Untitled notebook',
          sources: item[1]?.length || 0,
          emoji: item[3] || '📔'
        }));
    } catch (error) {
      console.error('parseNotebookList error:', error);
      return [];
    }
  },

  // Create a new notebook
  async createNotebook(title, emoji = '📔') {
    const response = await this.rpc('CCqFvf', [title]);

    // Extract notebook ID from response
    const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (!uuidMatch) {
      throw new Error('Failed to create notebook');
    }

    return { id: uuidMatch[0], name: title, emoji };
  },

  // Add a single source to notebook
  async addSource(notebookId, url) {
    return this.addSources(notebookId, [url]);
  },

  // Add multiple sources to notebook
  async addSources(notebookId, urls) {
    const sources = urls.map(url => {
      // YouTube URLs need special format
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return [null, null, null, null, null, null, null, [url]];
      }
      // Regular URLs
      return [null, null, [url]];
    });

    const response = await this.rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
    return response;
  },

  // Add text content as source
  async addTextSource(notebookId, text, title = 'Imported content') {
    const source = [[text, title]];
    const response = await this.rpc('izAoDd', [source, notebookId], `/notebook/${notebookId}`);
    return response;
  },

  // Check notebook status (sources loading)
  async getNotebookStatus(notebookId) {
    const response = await this.rpc('rLM1Ne', [notebookId, null, [2]], `/notebook/${notebookId}`);
    // Check if notebook ID appears in response (means sources are loaded)
    return !response.includes(`null,\\"${notebookId}`);
  },

  // Wait for sources to be added
  async waitForSources(notebookId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const ready = await this.getNotebookStatus(notebookId);
      if (ready) return true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  },

  // Execute RPC call to NotebookLM
  async rpc(rpcId, params, sourcePath = '/') {
    if (!this.tokens) {
      await this.getTokens();
    }

    const url = new URL(`${this.BASE_URL}/_/LabsTailwindUi/data/batchexecute`);
    const reqId = Math.floor(Math.random() * 900000 + 100000).toString();

    url.searchParams.set('rpcids', rpcId);
    url.searchParams.set('source-path', sourcePath);
    url.searchParams.set('bl', this.tokens.bl);
    url.searchParams.set('_reqid', reqId);
    url.searchParams.set('rt', 'c');

    if (this.tokens.authuser > 0) {
      url.searchParams.set('authuser', this.tokens.authuser);
    }

    const body = new URLSearchParams({
      'f.req': JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]),
      'at': this.tokens.at
    });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'include',
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.status}`);
    }

    return await response.text();
  },

  // Get list of Google accounts
  async listAccounts() {
    try {
      const response = await fetch(
        'https://accounts.google.com/ListAccounts?json=standard&source=ogb&md=1&cc=1&mn=1&mo=1&gpsia=1&fwput=860&listPages=1&origin=https%3A%2F%2Fwww.google.com',
        { credentials: 'include' }
      );

      const text = await response.text();

      // Extract JSON from postMessage call
      const match = text.match(/postMessage\('(.*)'\s*,\s*'https:/);
      if (!match) return [];

      // Decode escaped characters
      const decoded = match[1]
        .replace(/\\x5b/g, '[')
        .replace(/\\x5d/g, ']')
        .replace(/\\x22/g, '"');

      const parsed = JSON.parse(decoded);
      const accounts = parsed[1] || [];

      return accounts.map(acc => ({
        name: acc[2] || null,
        email: acc[3] || null,
        avatar: acc[4] || null,
        isActive: acc[5] || false,
        isDefault: acc[6] || false,
        index: acc[7] || 0
      }));
    } catch (error) {
      console.error('listAccounts error:', error);
      return [];
    }
  },

  // Get notebook URL
  getNotebookUrl(notebookId, authuser = 0) {
    const base = `${this.BASE_URL}/notebook/${notebookId}`;
    return authuser > 0 ? `${base}?authuser=${authuser}` : base;
  }
};

// ============================================
// Background Service Worker Logic
// ============================================

// Store for current state
let currentAuthuser = 0;

// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize storage
    chrome.storage.sync.set({
      selectedAccount: 0,
      lastNotebook: null,
      autoOpenNotebook: false
    });
  }

  // Setup context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'send-to-notebooklm',
      title: '📔 Send to NotebookLM',
      contexts: ['page', 'link']
    });
  });
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    });

  // Return true to indicate async response
  return true;
});

// Main message handler
async function handleMessage(request, sender) {
  const { cmd, ...params } = request;

  // Get selected account from storage
  // Support both storage key formats
  const storage = await chrome.storage.sync.get(['selectedAccount', 'selected_account']);
  currentAuthuser = storage.selectedAccount || storage.selected_account || 0;

  // Commands that don't require tokens
  const noTokenCommands = ['list-accounts', 'ping', 'get-current-tab', 'get-all-tabs'];

  // Ensure we have tokens for API calls
  if (!noTokenCommands.includes(cmd)) {
    try {
      await NotebookLMAPI.getTokens(currentAuthuser);
    } catch (error) {
      return { error: 'Please login to NotebookLM first', err: 'Please authorize NotebookLM to continue' };
    }
  }

  switch (cmd) {
    case 'ping':
      return { ok: true };

    case 'list-accounts':
      return await listAccounts();

    case 'list-notebooks':
      return await listNotebooks();

    // Legacy command support
    case 'list-notebooklm':
      return await listNotebooksLegacy();

    case 'create-notebook':
      return await createNotebook(params.title, params.emoji);

    case 'add-source':
      return await addSource(params.notebookId, params.url);

    case 'add-sources':
      return await addSources(params.notebookId, params.urls);

    case 'add-text-source':
      return await addTextSource(params.notebookId, params.text, params.title);

    case 'get-current-tab':
      return await getCurrentTab();

    case 'get-all-tabs':
      return await getAllTabs();

    case 'save-to-notebook':
      return await saveToNotebook(params);

    case 'save-to-notebooklm':
      return await saveToNotebookLMOriginal(params.title, params.urls, params.currentURL, params.notebookID);

    default:
      console.log('Unknown command:', cmd);
      return { error: `Unknown command: ${cmd}` };
  }
}

// List Google accounts
async function listAccounts() {
  try {
    const accounts = await NotebookLMAPI.listAccounts();
    // Return both formats for compatibility
    return { accounts, list: accounts };
  } catch (error) {
    return { error: error.message, accounts: [], list: [] };
  }
}

// List notebooks
async function listNotebooks() {
  try {
    const notebooks = await NotebookLMAPI.listNotebooks();
    return { notebooks };
  } catch (error) {
    return { error: error.message, notebooks: [] };
  }
}

// List notebooks in legacy format
async function listNotebooksLegacy() {
  try {
    const notebooks = await NotebookLMAPI.listNotebooks();
    return { list: notebooks };
  } catch (error) {
    return { err: error.message, list: [] };
  }
}

// Create new notebook
async function createNotebook(title, emoji = '📔') {
  try {
    const notebook = await NotebookLMAPI.createNotebook(title, emoji);
    return { notebook };
  } catch (error) {
    return { error: error.message };
  }
}

// Add single source
async function addSource(notebookId, url) {
  try {
    await NotebookLMAPI.addSource(notebookId, url);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Add multiple sources
async function addSources(notebookId, urls) {
  try {
    await NotebookLMAPI.addSources(notebookId, urls);

    // Wait for sources to be processed
    await NotebookLMAPI.waitForSources(notebookId);

    return {
      success: true,
      notebookUrl: NotebookLMAPI.getNotebookUrl(notebookId, currentAuthuser)
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Add text content as source
async function addTextSource(notebookId, text, title) {
  try {
    await NotebookLMAPI.addTextSource(notebookId, text, title);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Get current active tab
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Get all open tabs
async function getAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs
        .filter(tab => tab.url && tab.url.startsWith('http'))
        .map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          windowId: tab.windowId
        }))
    };
  } catch (error) {
    return { error: error.message, tabs: [] };
  }
}

// Save URL(s) to notebook (main workflow)
async function saveToNotebook({ title, urls, notebookId, createNew }) {
  try {
    let targetNotebookId = notebookId;

    // Create new notebook if requested
    if (createNew || !notebookId) {
      const emoji = urls.some(url => url.includes('youtube.com')) ? '📺' : '📔';
      const result = await NotebookLMAPI.createNotebook(title || 'Imported content', emoji);
      targetNotebookId = result.id;
    }

    // Add sources
    await NotebookLMAPI.addSources(targetNotebookId, urls);

    // Wait for sources to be processed
    await NotebookLMAPI.waitForSources(targetNotebookId);

    // Get settings
    const settings = await chrome.storage.sync.get(['autoOpenNotebook']);

    // Open notebook if setting enabled
    if (settings.autoOpenNotebook) {
      const notebookUrl = NotebookLMAPI.getNotebookUrl(targetNotebookId, currentAuthuser);
      chrome.tabs.create({ url: notebookUrl });
    }

    return {
      success: true,
      notebookId: targetNotebookId,
      notebookUrl: NotebookLMAPI.getNotebookUrl(targetNotebookId, currentAuthuser)
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Save to NotebookLM (legacy format)
async function saveToNotebookLMOriginal(title, urls, currentURL, notebookID) {
  try {
    // Set progress indicator in local storage
    if (currentURL) {
      await chrome.storage.local.set({ [currentURL]: { label: 'Creating Notebook...' } });
    }

    let targetNotebookId = notebookID;

    // Create new notebook if no ID provided
    if (!notebookID) {
      const result = await NotebookLMAPI.createNotebook(title || 'YouTube Videos', '📺');
      targetNotebookId = result.id;
    }

    // Update progress
    if (currentURL) {
      await chrome.storage.local.set({ [currentURL]: { label: 'Adding sources...' } });
    }

    // Add sources
    await NotebookLMAPI.addSources(targetNotebookId, urls);

    // Wait for sources to be processed
    await NotebookLMAPI.waitForSources(targetNotebookId);

    // Clear progress indicators
    if (currentURL) {
      await chrome.storage.local.remove([currentURL, 'ytLinks']);
    }

    // Build authuser param for URL
    const authParam = currentAuthuser > 0 ? `?authuser=${currentAuthuser}` : '';

    return {
      url: `https://notebooklm.google.com/notebook/${targetNotebookId}${authParam}`
    };
  } catch (error) {
    return { err: error.message };
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'send-to-notebooklm') {
    const url = info.linkUrl || info.pageUrl;

    // Store the URL and open bulk import page
    await chrome.storage.local.set({
      pendingUrl: url,
      pendingTitle: tab.title
    });

    chrome.tabs.create({
      url: chrome.runtime.getURL(`app/app.html?url=${encodeURIComponent(url)}`)
    });
  }
});

console.log('Add to NotebookLM: Background service worker started');
