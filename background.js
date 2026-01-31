// Background Service Worker for Add to NotebookLM
// Handles API calls and message passing between content scripts and popup

// ============================================
// Security Utilities
// ============================================

// UUID validation regex (matches standard UUID v4 format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate UUID format
function isValidUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
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

// Escape special regex characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fetch with timeout using AbortController
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Rate limiter for API calls
const RateLimiter = {
  tokens: 10,
  maxTokens: 10,
  refillRate: 10, // tokens per second
  lastRefill: Date.now(),

  async acquire() {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens < 1) {
      // Wait for token to become available
      const waitTime = (1 - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = 1;
    }

    this.tokens -= 1;
    return true;
  }
};

// Maximum URLs allowed in a single request
const MAX_URLS_PER_REQUEST = 200;

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

  // Extract token from HTML using regex (with escaped key)
  extractToken(key, html) {
    const escapedKey = escapeRegex(key);
    const regex = new RegExp(`"${escapedKey}":"([^"]+)"`);
    const match = regex.exec(html);
    // Validate token format (should be alphanumeric with some special chars)
    const token = match ? match[1] : null;
    if (token && !/^[\w\-:.]+$/.test(token)) {
      console.warn('Suspicious token format detected');
      return null;
    }
    return token;
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
    // Validate notebookId
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }

    // Validate and filter URLs
    const validUrls = urls.filter(url => isValidUrl(url));
    if (validUrls.length === 0) {
      throw new Error('No valid URLs provided');
    }

    // Limit number of URLs per request
    if (validUrls.length > MAX_URLS_PER_REQUEST) {
      throw new Error(`Too many URLs. Maximum ${MAX_URLS_PER_REQUEST} allowed per request.`);
    }

    const sources = validUrls.map(url => {
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
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Text content is required');
    }
    const source = [[text, title]];
    const response = await this.rpc('izAoDd', [source, notebookId], `/notebook/${notebookId}`);
    return response;
  },

  // Check notebook status (sources loading)
  async getNotebookStatus(notebookId) {
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }
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
    // Apply rate limiting
    await RateLimiter.acquire();

    if (!this.tokens) {
      await this.getTokens();
    }

    const url = new URL(`${this.BASE_URL}/_/LabsTailwindUi/data/batchexecute`);
    // Use crypto.randomUUID() for cryptographically secure request ID
    const reqId = crypto.randomUUID().replace(/-/g, '').substring(0, 6);

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

    const response = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'include',
      body: body.toString()
    }, 30000); // 30 second timeout

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.status}`);
    }

    return await response.text();
  },

  // Get list of Google accounts (filter out YouTube channels/profiles)
  async listAccounts() {
    try {
      const response = await fetch(
        'https://accounts.google.com/ListAccounts?json=standard&source=ogb&md=1&cc=1&mn=1&mo=1&gpsia=1&fwput=860&listPages=1&origin=https%3A%2F%2Fwww.google.com',
        { credentials: 'include' }
      );

      const text = await response.text();

      // Limit text length to prevent ReDoS attacks
      const safeText = text.length > 100000 ? text.substring(0, 100000) : text;

      // Extract JSON from postMessage call (using non-greedy match to prevent ReDoS)
      const match = safeText.match(/postMessage\('([^']*)'\s*,\s*'https:/);
      if (!match) return [];

      // Decode escaped characters
      const decoded = match[1]
        .replace(/\\x5b/g, '[')
        .replace(/\\x5d/g, ']')
        .replace(/\\x22/g, '"');

      const parsed = JSON.parse(decoded);
      const accounts = parsed[1] || [];

      // Filter: only keep entries with valid email addresses (real Google accounts)
      // YouTube channels/profiles don't have email in acc[3]
      return accounts
        .filter(acc => acc[3] && acc[3].includes('@'))
        .map((acc, idx) => ({
          name: acc[2] || null,
          email: acc[3] || null,
          avatar: acc[4] || null,
          isActive: acc[5] || false,
          isDefault: acc[6] || false,
          index: idx  // Use filtered index for authuser param
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
  },

  // Get notebook details with sources list
  async getNotebook(notebookId) {
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }
    const response = await this.rpc('rLM1Ne', [notebookId, null, [2], null, 0], `/notebook/${notebookId}`);
    return this.parseNotebookDetails(response);
  },

  // Parse notebook details from RPC response
  parseNotebookDetails(responseText) {
    try {
      const lines = responseText.split('\n');
      const dataLine = lines.find(line => line.includes('wrb.fr'));
      if (!dataLine) return { sources: [] };

      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      if (!innerData || !innerData[0]) return { sources: [] };

      const notebookData = innerData[0];
      const sourcesArray = notebookData[3] || [];

      const sources = sourcesArray
        .filter(source => source && source[0])
        .map(source => {
          const sourceType = source[3]?.[0] || 0;
          const typeNames = {
            1: 'url',
            3: 'text',
            4: 'youtube',
            7: 'pdf',
            8: 'audio'
          };

          return {
            id: source[0],
            title: source[2] || 'Untitled',
            type: typeNames[sourceType] || 'unknown',
            typeCode: sourceType,
            url: source[3]?.[1] || null,
            status: source[4] || 0
          };
        });

      return {
        id: notebookData[0],
        title: notebookData[1],
        sources
      };
    } catch (error) {
      console.error('parseNotebookDetails error:', error);
      return { sources: [] };
    }
  },

  // Delete a single source from notebook
  async deleteSource(notebookId, sourceId) {
    // Validate UUIDs to prevent path traversal
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }
    if (!isValidUUID(sourceId)) {
      throw new Error('Invalid source ID format');
    }

    // Note: notebook_id is passed via source_path, NOT in params!
    // Payload structure: [[[source_id]]] (triple-nested)
    const response = await this.rpc('tGMBJ', [[[sourceId]]], `/notebook/${notebookId}`);
    return response;
  },

  // Delete multiple sources from notebook (batch operation)
  // API supports max ~20 sources per request, so we chunk into batches
  async deleteSources(notebookId, sourceIds) {
    // Validate notebook ID
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }

    if (sourceIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    // Validate all source IDs
    const validSourceIds = sourceIds.filter(id => isValidUUID(id));
    if (validSourceIds.length !== sourceIds.length) {
      console.warn(`Filtered out ${sourceIds.length - validSourceIds.length} invalid source IDs`);
    }
    if (validSourceIds.length === 0) {
      throw new Error('No valid source IDs provided');
    }

    const BATCH_SIZE = 20;
    let deletedCount = 0;

    // Split into chunks of BATCH_SIZE
    for (let i = 0; i < validSourceIds.length; i += BATCH_SIZE) {
      const batch = validSourceIds.slice(i, i + BATCH_SIZE);

      // Batch delete: payload format is [[[id1], [id2], [id3]...]]
      const batchPayload = [batch.map(id => [id])];
      await this.rpc('tGMBJ', batchPayload, `/notebook/${notebookId}`);

      deletedCount += batch.length;
    }

    return { success: true, deletedCount };
  },

  // Delete a notebook
  async deleteNotebook(notebookId) {
    // Validate notebook ID
    if (!isValidUUID(notebookId)) {
      throw new Error('Invalid notebook ID format');
    }

    console.log('[NLM API] deleteNotebook called:', notebookId);
    try {
      // Format: [[notebookId], [2]] - where [2] is the confirmation flag
      const response = await this.rpc('WWINqb', [[notebookId], [2]]);
      console.log('[NLM API] deleteNotebook response:', response);
      return response;
    } catch (error) {
      console.error('[NLM API] deleteNotebook error:', error);
      throw error;
    }
  },

  // Delete multiple notebooks
  async deleteNotebooks(notebookIds) {
    // Validate all notebook IDs first
    const validIds = notebookIds.filter(id => isValidUUID(id));
    if (validIds.length !== notebookIds.length) {
      console.warn(`Filtered out ${notebookIds.length - validIds.length} invalid notebook IDs`);
    }

    if (validIds.length === 0) {
      return { success: false, deletedCount: 0, errors: [{ error: 'No valid notebook IDs provided' }] };
    }

    const results = [];
    const errors = [];

    for (const id of validIds) {
      try {
        await this.deleteNotebook(id);
        results.push(id);
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }

    // Return success only if all deletions succeeded
    return {
      success: errors.length === 0,
      deletedCount: results.length,
      errors: errors.length > 0 ? errors : undefined
    };
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
  const noTokenCommands = ['list-accounts', 'ping', 'get-current-tab', 'get-all-tabs', 'activate-notebook-edit-mode', 'deactivate-notebook-edit-mode'];

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

    case 'get-notebook':
      return await getNotebook(params.notebookId);

    case 'get-sources':
      return await getSources(params.notebookId);

    case 'delete-source':
      return await deleteSource(params.notebookId, params.sourceId);

    case 'delete-sources':
      return await deleteSources(params.notebookId, params.sourceIds);

    case 'delete-notebook':
      return await deleteNotebook(params.notebookId);

    case 'delete-notebooks':
      return await deleteNotebooks(params.notebookIds);

    case 'activate-notebook-edit-mode':
      return await activateNotebookEditMode(params.tabId);

    case 'deactivate-notebook-edit-mode':
      return await deactivateNotebookEditMode(params.tabId);

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

// Get notebook details with sources
async function getNotebook(notebookId) {
  try {
    const notebook = await NotebookLMAPI.getNotebook(notebookId);
    return { notebook };
  } catch (error) {
    return { error: error.message };
  }
}

// Get sources list for a notebook
async function getSources(notebookId) {
  try {
    const notebook = await NotebookLMAPI.getNotebook(notebookId);
    return { sources: notebook.sources || [] };
  } catch (error) {
    return { error: error.message, sources: [] };
  }
}

// Delete single source
async function deleteSource(notebookId, sourceId) {
  try {
    await NotebookLMAPI.deleteSource(notebookId, sourceId);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Delete multiple sources (batch)
async function deleteSources(notebookId, sourceIds) {
  try {
    const result = await NotebookLMAPI.deleteSources(notebookId, sourceIds);
    return {
      success: true,
      successCount: result.deletedCount || sourceIds.length,
      failCount: 0
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Delete single notebook
async function deleteNotebook(notebookId) {
  try {
    await NotebookLMAPI.deleteNotebook(notebookId);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Delete multiple notebooks
async function deleteNotebooks(notebookIds) {
  console.log('[NLM] deleteNotebooks wrapper called:', notebookIds);
  try {
    const result = await NotebookLMAPI.deleteNotebooks(notebookIds);
    console.log('[NLM] deleteNotebooks result:', result);
    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error('[NLM] deleteNotebooks error:', error);
    return { error: error.message };
  }
}

// Activate notebook edit mode on NotebookLM tab
async function activateNotebookEditMode(tabId) {
  console.log('[Background] activateNotebookEditMode called for tab:', tabId);
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      cmd: 'activate-notebook-edit-mode'
    });
    console.log('[Background] Response from content script:', response);
    return response || { success: true };
  } catch (error) {
    console.error('[Background] Error sending message to content script:', error);
    return { error: error.message };
  }
}

// Deactivate notebook edit mode on NotebookLM tab
async function deactivateNotebookEditMode(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      cmd: 'deactivate-notebook-edit-mode'
    });
    return response || { success: true };
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
    const emoji = urls.some(url => url.includes('youtube.com')) ? '📺' : '📔';
    const targetNotebookId = await saveToNotebookCore({
      title: title || 'Imported content',
      urls,
      notebookId,
      createNew,
      emoji
    });

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

// Shared logic for saving sources to a notebook (used by main + legacy flows)
async function saveToNotebookCore({ title, urls, notebookId, createNew, emoji, onBeforeAdd }) {
  let targetNotebookId = notebookId;
  const willCreate = createNew || !notebookId;

  // Create new notebook if requested
  if (willCreate) {
    const result = await NotebookLMAPI.createNotebook(title, emoji);
    targetNotebookId = result.id;
  }

  if (onBeforeAdd) {
    await onBeforeAdd({ notebookId: targetNotebookId, created: willCreate });
  }

  // Add sources
  await NotebookLMAPI.addSources(targetNotebookId, urls);

  // Wait for sources to be processed
  await NotebookLMAPI.waitForSources(targetNotebookId);

  return targetNotebookId;
}

// Save to NotebookLM (legacy format)
async function saveToNotebookLMOriginal(title, urls, currentURL, notebookID) {
  try {
    // Set progress indicator in local storage
    if (currentURL) {
      await chrome.storage.local.set({ [currentURL]: { label: 'Creating Notebook...' } });
    }

    const targetNotebookId = await saveToNotebookCore({
      title: title || 'YouTube Videos',
      urls,
      notebookId: notebookID,
      createNew: !notebookID,
      emoji: '📺',
      onBeforeAdd: async () => {
        if (currentURL) {
          await chrome.storage.local.set({ [currentURL]: { label: 'Adding sources...' } });
        }
      }
    });

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
