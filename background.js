// Background Service Worker for Add to NotebookLM
// Handles API calls and message passing between content scripts and popup

importScripts('lib/youtube-comments-api.js', 'lib/comments-to-md.js');

// ============================================
// Utilities
// ============================================

async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// ============================================
// NotebookLM API Client (inline)
// ============================================

const NotebookLMAPI = {
  BASE_URL: 'https://notebook.google.com',
  tokens: null,

  // Get authentication tokens from NotebookLM page
  async getTokens(authuser = 0) {
    try {
      const url = authuser > 0
        ? `${this.BASE_URL}/?authuser=${authuser}&pageId=none`
        : this.BASE_URL;

      const response = await fetchWithTimeout(url, {
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
    const source = [[null, [title, text], null, null, null, null, null, null]];
    const response = await this.rpc('izAoDd', [source, notebookId, [2], null, null], `/notebook/${notebookId}`);
    return response;
  },

  // Register a PDF source in the notebook (step 1 of PDF upload)
  async registerPdfSource(notebookId, filename) {
    const response = await this.rpc('o4cbdc', [[[filename]], notebookId, [2], [1,null,null,null,null,null,null,null,null,null,[1]]], `/notebook/${notebookId}`);
    const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (!uuidMatch) {
      throw new Error('Failed to register PDF source');
    }
    return uuidMatch[0];
  },

  // Get a resumable upload URL from SCOTTY (step 2 of PDF upload)
  async getUploadUrl(notebookId, filename, sourceId, byteLength) {
    const authuser = this.tokens.authuser || 0;
    const url = `https://notebook.google.com/upload/_/?authuser=${authuser}`;
    const body = JSON.stringify({
      PROJECT_ID: notebookId,
      SOURCE_NAME: filename,
      SOURCE_ID: sourceId
    });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-upload-command': 'start',
        'x-goog-upload-header-content-length': byteLength.toString(),
        'x-goog-upload-protocol': 'resumable'
      },
      credentials: 'include',
      body
    });

    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status}`);
    }

    const uploadUrl = response.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('No upload URL in response');
    }
    return uploadUrl;
  },

  // Upload PDF bytes to SCOTTY (step 3 of PDF upload)
  async uploadPdfBytes(uploadUrl, pdfBytes) {
    const response = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: {
        'x-goog-upload-command': 'upload, finalize',
        'x-goog-upload-offset': '0',
        'Content-Type': 'application/pdf'
      },
      credentials: 'include',
      body: pdfBytes
    }, 60000);

    if (!response.ok) {
      throw new Error(`PDF upload failed: ${response.status}`);
    }
    return response;
  },

  // Full PDF upload orchestrator: register → get URL → upload bytes
  async addPdfSource(notebookId, pdfBase64, filename) {
    const binaryStr = atob(pdfBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const sourceId = await this.registerPdfSource(notebookId, filename);
    const uploadUrl = await this.getUploadUrl(notebookId, filename, sourceId, bytes.byteLength);
    await this.uploadPdfBytes(uploadUrl, bytes);
    return { sourceId };
  },

  // Check notebook status (sources loading)
  async getNotebookStatus(notebookId) {
    let response;
    try {
      response = await this.rpc('rLM1Ne', [notebookId, null, [2]], `/notebook/${notebookId}`);
    } catch (e) {
      // Polling only: a failed status call means "not ready yet", not a failed add
      return false;
    }
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

    const response = await fetchWithTimeout(url.toString(), {
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

    const text = await response.text();

    // batchexecute answers HTTP 200 even when the RPC itself failed
    const rpcError = this.findRpcError(rpcId, text);
    if (rpcError) {
      throw new Error(rpcError);
    }

    return text;
  },

  // Inspect a batchexecute response for application-level errors.
  // Returns an error message, or null when the response looks valid.
  // Never throws: an unexpected shape degrades to "no error" rather than a false alarm.
  findRpcError(rpcId, text) {
    try {
      let errorFrame = null;
      let responseFrame = null;

      for (const line of text.split('\n')) {
        if (!line.startsWith('[[')) continue;

        let frames;
        try {
          frames = JSON.parse(line);
        } catch (e) {
          continue;
        }

        const first = frames[0];
        if (!Array.isArray(first)) continue;

        // "er" frames are the batchexecute error marker
        if (typeof first[0] === 'string' && first[0].startsWith('er')) {
          errorFrame = line.trim();
        }

        const match = frames.find(f => Array.isArray(f) && f[0] === 'wrb.fr' && f[1] === rpcId);
        if (match) responseFrame = match;
      }

      // An "er" frame means the call failed, whatever else came back
      if (errorFrame) {
        return `RPC ${rpcId} failed: error frame (${errorFrame})`;
      }

      if (!responseFrame) {
        return `RPC ${rpcId} failed: no response frame`;
      }

      const payload = responseFrame[2];
      if (payload === null || payload === undefined) {
        return `RPC ${rpcId} failed: empty payload`;
      }

      return null;
    } catch (e) {
      return null;
    }
  },

  // Get list of Google accounts (filter out YouTube channels/profiles)
  async listAccounts() {
    try {
      const response = await fetchWithTimeout(
        'https://accounts.google.com/ListAccounts?json=standard&source=ogb&md=1&cc=1&mn=1&mo=1&gpsia=1&fwput=860&listPages=1&origin=https%3A%2F%2Fwww.google.com',
        { credentials: 'include' }
      );

      const text = await response.text();

      // Extract JSON from postMessage call
      const match = text.match(/postMessage\('([^']*)'\s*,\s*'https:/);
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
      // authuser numbering follows the original ListAccounts order, so the index
      // must be captured BEFORE filtering — otherwise emails map to a foreign authuser
      return accounts
        .map((acc, originalIndex) => ({ acc, originalIndex }))
        .filter(({ acc }) => acc[3] && acc[3].includes('@'))
        .map(({ acc, originalIndex }) => ({
          name: acc[2] || null,
          email: acc[3] || null,
          avatar: acc[4] || null,
          isActive: acc[5] || false,
          isDefault: acc[6] || false,
          index: originalIndex
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

      // Structure: innerData[0] = [title, [sources...], notebookId, ...]
      const notebookData = innerData[0];
      const sourcesArray = Array.isArray(notebookData[1]) ? notebookData[1] : [];

      const typeNames = {
        1: 'google_docs',
        2: 'google_other',
        3: 'pdf',
        4: 'pasted_text',
        5: 'web_page',
        8: 'generated_text',
        9: 'youtube',
        11: 'uploaded_file',
        13: 'image',
        14: 'word_doc'
      };

      const sources = sourcesArray
        .filter(source => source && Array.isArray(source[0]) && source[0][0])
        .map(source => {
          // Source structure: [[sourceId], title, [metadata...], [null, 2]]
          const sourceId = source[0][0];
          const title = source[1] || 'Untitled';
          const metadata = Array.isArray(source[2]) ? source[2] : [];
          const sourceType = metadata[4] || 0;
          const driveDocId = Array.isArray(metadata[0]) ? metadata[0][0] : null;
          const url = Array.isArray(metadata[7]) ? metadata[7][0] : null;

          return {
            id: sourceId,
            title: title,
            type: typeNames[sourceType] || 'unknown',
            typeCode: sourceType,
            url: url,
            driveDocId: driveDocId,
            canSync: driveDocId != null && (sourceType === 1 || sourceType === 2)
          };
        });

      return {
        id: notebookData[2] || null,
        title: notebookData[0] || '',
        sources
      };
    } catch (error) {
      console.error('parseNotebookDetails error:', error);
      return { sources: [] };
    }
  },

  // Check if a Drive source is fresh (up-to-date with Google Drive)
  // Returns: true = fresh, false = stale, null = not a Drive source
  async checkSourceFreshness(sourceId, notebookId) {
    try {
      const response = await this.rpc('yR9Yof', [null, [sourceId], [2]], `/notebook/${notebookId}`);
      const lines = response.split('\n');
      const dataLine = lines.find(line => line.includes('wrb.fr'));
      if (!dataLine) return null;
      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);
      if (innerData && Array.isArray(innerData[0]) && innerData[0].length >= 2) {
        return innerData[0][1]; // true = fresh, false = stale
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // Sync a Drive source with latest content from Google Drive
  async syncDriveSource(sourceId, notebookId) {
    const response = await this.rpc('FLmJqe', [null, [sourceId], [2]], `/notebook/${notebookId}`);
    return response;
  },

  // Delete a single source from notebook
  async deleteSource(notebookId, sourceId) {
    // Note: notebook_id is passed via source_path, NOT in params!
    // Payload structure: [[[source_id]]] (triple-nested)
    const response = await this.rpc('tGMBJ', [[[sourceId]]], `/notebook/${notebookId}`);
    return response;
  },

  // Delete multiple sources from notebook (batch operation)
  // API supports max ~20 sources per request, so we chunk into batches
  async deleteSources(notebookId, sourceIds) {
    if (sourceIds.length === 0) {
      return { success: true, deletedCount: 0, failedCount: 0 };
    }

    const BATCH_SIZE = 20;
    let deletedCount = 0;
    let failedCount = 0;

    // Split into chunks of BATCH_SIZE
    // A failing batch must not abort the rest — report a partial result instead
    for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
      const batch = sourceIds.slice(i, i + BATCH_SIZE);

      // Batch delete: payload format is [[[id1], [id2], [id3]...]]
      const batchPayload = [batch.map(id => [id])];
      try {
        await this.rpc('tGMBJ', batchPayload, `/notebook/${notebookId}`);
        deletedCount += batch.length;
      } catch (e) {
        console.error('deleteSources batch failed:', e);
        failedCount += batch.length;
      }
    }

    return { success: failedCount === 0, deletedCount, failedCount };
  }
};

// Generate PDF from a tab using Chrome Debugger API
async function generatePdf(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    const result = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true
    });
    return result.data; // base64 encoded PDF
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  }
}

// Add page as PDF to notebook
async function addAsPdf(notebookId, tabId, title) {
  const filename = (title || 'page').replace(/[^a-zA-Z0-9а-яА-ЯёЁ _\-\.]/g, '').substring(0, 100) + '.pdf';
  const pdfBase64 = await generatePdf(tabId);
  await NotebookLMAPI.addPdfSource(notebookId, pdfBase64, filename);
  return { success: true };
}

// ============================================
// Background Service Worker Logic
// ============================================

// Store for current state
let currentAuthuser = 0;

// YouTube comments parse state
let parseState = {
  active: false,
  videoId: null,
  progress: { fetched: 0, total: null, phase: 'idle' },
  cancelToken: null,
  error: null,
  result: null
};

// Mirror of parseState in storage.session (cancelToken is not serializable).
// Survives a service worker restart, so an interrupted job can be reported
// instead of leaving the UI polling forever.
const PARSE_STATE_KEY = 'parseState';

async function persistParseState() {
  try {
    await chrome.storage.session.set({
      [PARSE_STATE_KEY]: {
        active: parseState.active,
        videoId: parseState.videoId,
        progress: parseState.progress,
        error: parseState.error,
        result: parseState.result
      }
    });
  } catch (e) {
    // storage.session unavailable — keepalive stays the primary protection
  }
}

async function readPersistedParseState() {
  try {
    const stored = await chrome.storage.session.get(PARSE_STATE_KEY);
    return stored[PARSE_STATE_KEY] || null;
  } catch (e) {
    return null;
  }
}

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

  // Clean up old API key setting (no longer needed)
  chrome.storage.local.remove('youtubeApiKey');

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
  const noTokenCommands = ['list-accounts', 'ping', 'get-current-tab', 'get-all-tabs', 'get-parse-status', 'cancel-parse'];

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

    case 'sync-drive-sources':
      return await syncDriveSources(params.notebookId);

    case 'delete-sources':
      return await deleteSources(params.notebookId, params.sourceIds);

    case 'get-parse-status': {
      // Fresh in-memory state + a mirror marked active = the worker died mid-job
      if (!parseState.active && parseState.videoId === null) {
        const stored = await readPersistedParseState();
        if (stored && stored.active) {
          const interrupted = {
            active: false,
            videoId: stored.videoId,
            progress: { ...stored.progress, phase: 'error' },
            error: { code: 'INTERRUPTED', message: 'Parsing was interrupted (service worker restarted)' },
            result: stored.result || null
          };
          // Adopt it in memory too, so later polls in this worker don't re-read
          // the stale mirror even if the write below fails
          parseState = { ...interrupted, cancelToken: null };

          // Overwrite the mirror so the interruption is reported exactly once
          try {
            await chrome.storage.session.set({ [PARSE_STATE_KEY]: interrupted });
          } catch (e) {
            // ignore
          }
          return interrupted;
        }
      }

      return {
        active: parseState.active,
        videoId: parseState.videoId,
        progress: parseState.progress,
        error: parseState.error,
        result: parseState.result
      };
    }

    case 'cancel-parse':
      if (parseState.cancelToken) {
        parseState.cancelToken.cancelled = true;
        parseState.progress.phase = 'cancelled';
        parseState.active = false;
        // Mirror right away: a worker death after cancelling must not look interrupted
        await persistParseState();
      }
      return { success: true };

    case 'add-as-pdf':
      try {
        return await addAsPdf(params.notebookId, params.tabId, params.title);
      } catch (error) {
        return { error: error.message };
      }

    case 'parse-comments':
      if (parseState.active) {
        return { error: 'Parse already in progress' };
      }
      doParseComments(params.notebookId, params.videoId, params.tabId);
      return { started: true };

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
    const response = {
      success: result.success,
      successCount: result.deletedCount,
      failCount: result.failedCount
    };
    // Nothing deleted at all: report as an error, callers only surface `error`
    if (result.failedCount > 0 && result.deletedCount === 0) {
      response.error = `Failed to delete ${result.failedCount} source(s)`;
    }
    return response;
  } catch (error) {
    return { error: error.message };
  }
}

// Sync all Drive sources in a notebook
async function syncDriveSources(notebookId) {
  try {
    const notebook = await NotebookLMAPI.getNotebook(notebookId);
    const sources = notebook.sources || [];
    if (sources.length === 0) return { error: 'No sources found' };

    const results = { synced: 0, fresh: 0, skipped: 0, errors: 0, total: sources.length };

    for (const source of sources) {
      try {
        // Check freshness via RPC — returns null for non-Drive sources
        const isFresh = await NotebookLMAPI.checkSourceFreshness(source.id, notebookId);
        if (isFresh === null) {
          results.skipped++;
        } else if (isFresh === true) {
          results.fresh++;
        } else {
          await NotebookLMAPI.syncDriveSource(source.id, notebookId);
          results.synced++;
        }
      } catch (e) {
        console.error('Sync error for source', source.id, e);
        results.errors++;
      }
    }

    return { success: true, results };
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
      url: `https://notebook.google.com/notebook/${targetNotebookId}${authParam}`
    };
  } catch (error) {
    return { err: error.message };
  }
}

// Fire-and-forget: fetch comments, format, send to NotebookLM
async function doParseComments(notebookId, videoId, tabId) {
  const cancelToken = { cancelled: false };
  parseState = {
    active: true,
    videoId,
    progress: { fetched: 0, total: null, phase: 'fetching' },
    cancelToken,
    error: null,
    result: null
  };
  await persistParseState();

  // Keep the service worker alive for the whole job: extension API calls reset
  // the 30s idle timer, and with the popup closed there is no other traffic
  const keepaliveId = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  let persistedFetched = 0;

  try {
    // Phase 1: Fetch metadata from DOM (no API key needed)
    // Pass videoId as fallback in case DOM extraction fails
    const metadata = await YouTubeCommentsAPI.getVideoMetadataFromDOM(tabId, videoId);
    parseState.progress.total = metadata.commentCount;
    await persistParseState();

    if (cancelToken.cancelled) return;

    // Load comments settings
    const settings = await chrome.storage.local.get(['commentsMode', 'commentsLimit', 'commentsIncludeReplies']);
    const mode = settings.commentsMode || 'top';
    const includeReplies = settings.commentsIncludeReplies !== undefined ? settings.commentsIncludeReplies : (mode === 'top');
    // For 'top' mode: maxComments=0 (YouTube limits naturally to ~1000)
    // For 'newest' mode: use configured limit
    const maxComments = mode === 'top' ? 0 : (settings.commentsLimit ?? 1000);

    // Phase 2: Fetch comments via InnerTube API
    const comments = await YouTubeCommentsAPI.fetchAllComments(videoId, {
      progressCallback: ({ fetched, phase }) => {
        parseState.progress.fetched = fetched;
        if (phase === 'fetching_replies') {
          parseState.progress.phase = 'fetching_replies';
        }
        // Throttled mirror: one write per 100 comments, not per page
        if (fetched - persistedFetched >= 100) {
          persistedFetched = fetched;
          persistParseState();
        }
      },
      cancelToken,
      tabId,
      mode,
      maxComments,
      includeReplies
    });

    if (cancelToken.cancelled) return;

    // Phase 3: Format to MD
    parseState.progress.phase = 'formatting';
    await persistParseState();
    const storage = await chrome.storage.sync.get(['language']);
    const lang = storage.language || 'en';
    const parts = CommentsToMd.format(metadata, comments, { lang });

    if (cancelToken.cancelled) return;

    // Phase 4: Send to NotebookLM
    parseState.progress.phase = 'sending';
    await persistParseState();
    // Refresh tokens before sending (parsing may have taken minutes)
    await NotebookLMAPI.getTokens(currentAuthuser);
    for (let i = 0; i < parts.length; i++) {
      if (cancelToken.cancelled) return;
      await NotebookLMAPI.addTextSource(notebookId, parts[i].text, parts[i].title);
    }

    // Done
    parseState.progress.phase = 'done';
    parseState.result = {
      commentCount: comments.length,
      totalComments: metadata.commentCount,
      partCount: parts.length,
      videoTitle: metadata.title
    };
  } catch (e) {
    console.error('doParseComments error:', e);
    parseState.progress.phase = 'error';
    parseState.error = { code: e.code || 'UNKNOWN', message: e.message };
  } finally {
    clearInterval(keepaliveId);
    parseState.active = false;
    await persistParseState();
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
