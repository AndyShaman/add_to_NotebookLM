// Content script for NotebookLM - Bulk Delete Sources + Drive Sync
// Injects a delete button when multiple sources are selected
// Injects a sync button to refresh Google Drive sources

(function() {
  'use strict';

  let deleteButton = null;
  let isEnabled = true;
  let observer = null;

  // Sync button state
  let syncButton = null;
  let isSyncEnabled = true;
  let isSyncing = false;

  // Check if feature is enabled in settings
  async function checkEnabled() {
    try {
      const result = await chrome.storage.sync.get(['enableBulkDelete']);
      isEnabled = result.enableBulkDelete !== false; // Default to true
      return isEnabled;
    } catch (e) {
      return true;
    }
  }

  // Get selected source IDs from the page
  function getSelectedSources() {
    const selected = [];
    const containers = document.querySelectorAll('.single-source-container');

    containers.forEach(container => {
      // Check if this source is selected (checkbox is checked)
      const checkbox = container.querySelector('mat-checkbox');
      const isChecked = checkbox?.classList?.contains('mat-mdc-checkbox-checked') ||
                        container.querySelector('input[type="checkbox"]:checked') !== null;

      if (isChecked) {
        // Extract source ID from the menu button ID: source-item-more-button-{UUID}
        const menuButton = container.querySelector('[id^="source-item-more-button-"]');
        if (menuButton) {
          const buttonId = menuButton.getAttribute('id');
          const sourceId = buttonId.replace('source-item-more-button-', '');
          if (sourceId && sourceId.match(/^[a-f0-9-]{36}$/i)) {
            selected.push(sourceId);
          }
        }

        // Alternative: look for UUID in the container HTML
        if (selected.length === 0 || !selected[selected.length - 1]) {
          const html = container.outerHTML;
          const uuidMatch = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
          if (uuidMatch && !selected.includes(uuidMatch[0])) {
            selected.push(uuidMatch[0]);
          }
        }
      }
    });

    return [...new Set(selected)]; // Remove duplicates
  }

  // Get notebook ID from URL
  function getNotebookId() {
    const match = window.location.pathname.match(/\/notebook\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  // Create the delete button
  function createDeleteButton() {
    if (deleteButton) return deleteButton;

    deleteButton = document.createElement('button');
    deleteButton.id = 'nlm-bulk-delete-btn';
    deleteButton.innerHTML = '🗑️ Delete Selected';
    deleteButton.style.cssText = `
      display: none;
      align-items: center;
      gap: 8px;
      background: rgba(255, 59, 48, 0.15);
      color: #FF3B30;
      border: 1px solid rgba(255, 59, 48, 0.3);
      border-radius: 96px;
      height: 32px;
      padding: 0 16px;
      box-sizing: border-box;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: 'Google Sans Text', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Google Sans', Roboto, sans-serif;
      transition: all 0.2s ease;
      margin-left: 12px;
      white-space: nowrap;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 4px 16px rgba(255, 59, 48, 0.2);
    `;

    deleteButton.addEventListener('mouseenter', () => {
      deleteButton.style.background = 'rgba(255, 59, 48, 0.25)';
      deleteButton.style.borderColor = 'rgba(255, 59, 48, 0.5)';
      deleteButton.style.transform = 'translateY(-2px)';
      deleteButton.style.boxShadow = '0 6px 20px rgba(255, 59, 48, 0.3)';
    });

    deleteButton.addEventListener('mouseleave', () => {
      deleteButton.style.background = 'rgba(255, 59, 48, 0.15)';
      deleteButton.style.borderColor = 'rgba(255, 59, 48, 0.3)';
      deleteButton.style.transform = 'translateY(0)';
      deleteButton.style.boxShadow = '0 4px 16px rgba(255, 59, 48, 0.2)';
    });

    deleteButton.addEventListener('click', handleDeleteClick);

    // Insert button into the header bar next to notebook title
    insertButtonIntoHeader();

    return deleteButton;
  }

  // Insert button into the header area
  function insertButtonIntoHeader() {
    if (!deleteButton) return;

    // Try to find the header area with notebook title
    const headerSelectors = [
      '.notebook-title-container',
      '[class*="notebook-name"]',
      'header',
      '.mat-toolbar',
      '[class*="header"]'
    ];

    // Find the container with the notebook title (left side of header)
    const notebookTitle = document.querySelector('h1, [class*="title"]');
    let targetContainer = null;

    if (notebookTitle) {
      // Look for a flex container parent
      let parent = notebookTitle.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (parent.style.display === 'flex' ||
            getComputedStyle(parent).display === 'flex' ||
            parent.className?.includes('header') ||
            parent.className?.includes('toolbar')) {
          targetContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }

    if (targetContainer && !targetContainer.contains(deleteButton)) {
      // Insert after the title element
      if (notebookTitle.nextSibling) {
        targetContainer.insertBefore(deleteButton, notebookTitle.nextSibling);
      } else {
        targetContainer.appendChild(deleteButton);
      }
    } else {
      // Fallback: append to body with fixed positioning near header
      deleteButton.style.position = 'fixed';
      deleteButton.style.top = '130px';
      deleteButton.style.left = '180px';
      deleteButton.style.zIndex = '10000';
      document.body.appendChild(deleteButton);
    }
  }

  // Handle delete button click
  async function handleDeleteClick() {
    const selectedSources = getSelectedSources();
    const notebookId = getNotebookId();

    if (selectedSources.length === 0 || !notebookId) {
      console.log('No sources selected or notebook ID not found');
      return;
    }

    // Confirm deletion
    const lang = document.documentElement.lang || 'en';
    const confirmMsg = lang.startsWith('ru')
      ? `Удалить ${selectedSources.length} источник(ов)? Это действие нельзя отменить.`
      : `Delete ${selectedSources.length} source(s)? This cannot be undone.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    // Show loading state
    deleteButton.disabled = true;
    const deletingText = lang.startsWith('ru') ? 'Удаление...' : 'Deleting...';
    deleteButton.innerHTML = '⏳ ' + deletingText;
    deleteButton.style.opacity = '0.6';
    deleteButton.style.cursor = 'wait';

    try {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        const reloadMsg = lang.startsWith('ru')
          ? 'Расширение было обновлено. Пожалуйста, перезагрузите страницу (F5).'
          : 'Extension was updated. Please reload the page (F5).';
        alert(reloadMsg);
        resetButton();
        return;
      }

      // Send delete request to background script
      const response = await chrome.runtime.sendMessage({
        cmd: 'delete-sources',
        notebookId: notebookId,
        sourceIds: selectedSources
      });

      if (response && response.error) {
        alert('Error: ' + response.error);
        resetButton();
      } else if (!response) {
        const reloadMsg = lang.startsWith('ru')
          ? 'Нет ответа от расширения. Перезагрузите страницу (F5).'
          : 'No response from extension. Please reload the page (F5).';
        alert(reloadMsg);
        resetButton();
      } else {
        // Show result — some batches may have failed while others went through
        const successCount = response.successCount ?? 0;
        const failCount = response.failCount || 0;
        const successMsg = failCount > 0
          ? (lang.startsWith('ru')
            ? `✓ Удалено: ${successCount}, не удалось: ${failCount}`
            : `✓ Deleted: ${successCount}, failed: ${failCount}`)
          : (lang.startsWith('ru')
            ? `✓ Удалено: ${successCount}`
            : `✓ Deleted: ${successCount}`);

        deleteButton.innerHTML = successMsg;

        // Reload page after short delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('Delete error:', error);
      const lang = document.documentElement.lang || 'en';

      // Check if it's an extension context invalidation error
      if (error.message && (error.message.includes('sendMessage') || error.message.includes('Extension context'))) {
        const reloadMsg = lang.startsWith('ru')
          ? 'Расширение было обновлено. Перезагрузите страницу (F5).'
          : 'Extension was updated. Please reload the page (F5).';
        alert(reloadMsg);
      } else {
        alert('Error: ' + error.message);
      }
      resetButton();
    }
  }

  // Reset button to default state
  function resetButton() {
    if (!deleteButton) return;
    deleteButton.disabled = false;
    deleteButton.style.opacity = '1';
    deleteButton.style.cursor = 'pointer';
    deleteButton.style.background = 'rgba(255, 59, 48, 0.15)';
    deleteButton.style.transform = 'translateY(0)';
    deleteButton.style.boxShadow = '0 4px 16px rgba(255, 59, 48, 0.2)';
    updateButtonVisibility();
  }

  // Update button visibility based on selection
  function updateButtonVisibility() {
    if (!isEnabled) {
      if (deleteButton) deleteButton.style.display = 'none';
      return;
    }

    const selectedSources = getSelectedSources();

    if (!deleteButton) {
      createDeleteButton();
    }

    if (selectedSources.length > 0) {
      const lang = document.documentElement.lang || 'en';
      const text = lang.startsWith('ru')
        ? `🗑️ Удалить (${selectedSources.length})`
        : `🗑️ Delete (${selectedSources.length})`;

      deleteButton.innerHTML = text;
      deleteButton.style.display = 'flex';
      deleteButton.disabled = false;
      deleteButton.style.opacity = '1';
      deleteButton.style.background = 'rgba(255, 59, 48, 0.15)';
      deleteButton.style.cursor = 'pointer';
      deleteButton.style.transform = 'translateY(0)';
      deleteButton.style.boxShadow = '0 4px 16px rgba(255, 59, 48, 0.2)';
    } else {
      deleteButton.style.display = 'none';
    }
  }

  // ============================================
  // Sync Button — refresh Google Drive sources
  // ============================================

  const SYNC_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 11.5a10 10 0 0 1 18.4-4.3L21.5 8"/><path d="M21.5 12.5a10 10 0 0 1-18.4 4.3L2.5 16"/></svg>`;

  function createSyncButton() {
    if (syncButton) return syncButton;

    syncButton = document.createElement('button');
    syncButton.id = 'nlm-sync-drive-btn';
    syncButton.innerHTML = SYNC_ICON_SVG;
    syncButton.title = getLang() === 'ru' ? 'Синхронизировать Google Drive источники' : 'Sync Google Drive sources';
    syncButton.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      color: #9aa0a6;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      padding: 0;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin-left: auto;
    `;

    syncButton.addEventListener('mouseenter', () => {
      if (!isSyncing) {
        syncButton.style.background = 'rgba(138, 180, 248, 0.12)';
        syncButton.style.color = '#8ab4f8';
      }
    });

    syncButton.addEventListener('mouseleave', () => {
      if (!isSyncing) {
        syncButton.style.background = 'transparent';
        syncButton.style.color = '#9aa0a6';
      }
    });

    syncButton.addEventListener('click', handleSyncClick);
    return syncButton;
  }

  function getLang() {
    return (document.documentElement.lang || navigator.language || 'en').substring(0, 2);
  }

  function insertSyncButton() {
    if (!syncButton) return;
    if (syncButton.parentElement && document.contains(syncButton)) return; // Already inserted

    // Find the "Источники" / "Sources" heading
    const headings = document.querySelectorAll('h2, h3, [class*="heading"], [class*="title"]');
    let sourcesHeading = null;
    for (const h of headings) {
      const text = (h.textContent || '').trim().toLowerCase();
      if (text === 'источники' || text === 'sources') {
        sourcesHeading = h;
        break;
      }
    }

    if (!sourcesHeading) return;

    // Walk up to the nearest flex ancestor (the panel header row with heading + collapse icon)
    let container = null;
    let node = sourcesHeading.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      if (getComputedStyle(node).display === 'flex') {
        container = node;
        break;
      }
      node = node.parentElement;
    }

    if (container) {
      // Insert before the last direct child (collapse icon DIV) so the button sits in the same row
      const lastChild = container.lastElementChild;
      if (lastChild && lastChild !== syncButton && !lastChild.contains(sourcesHeading)) {
        container.insertBefore(syncButton, lastChild);
      } else {
        container.appendChild(syncButton);
      }
      return;
    }

    // Fallback: the heading itself is a flex row
    sourcesHeading.appendChild(syncButton);
  }

  async function handleSyncClick() {
    if (isSyncing) return;
    const notebookId = getNotebookId();
    if (!notebookId) return;

    const lang = getLang();
    isSyncing = true;

    // Show spinning animation
    syncButton.style.color = '#8ab4f8';
    syncButton.style.animation = 'nlm-spin 1s linear infinite';
    syncButton.disabled = true;
    syncButton.style.cursor = 'wait';
    syncButton.title = lang === 'ru' ? 'Синхронизация...' : 'Syncing...';

    // Add keyframe animation if not present
    if (!document.getElementById('nlm-sync-styles')) {
      const style = document.createElement('style');
      style.id = 'nlm-sync-styles';
      style.textContent = `@keyframes nlm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }

    try {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        showSyncToast(lang === 'ru' ? 'Перезагрузите страницу (F5)' : 'Reload the page (F5)', 'error');
        resetSyncButton();
        return;
      }

      const response = await chrome.runtime.sendMessage({
        cmd: 'sync-drive-sources',
        notebookId: notebookId
      });

      if (response && response.error) {
        showSyncToast('Error: ' + response.error, 'error');
      } else if (response && response.success) {
        const r = response.results;
        const driveTotal = r.synced + r.fresh + r.errors;

        if (driveTotal === 0) {
          showSyncToast(
            lang === 'ru' ? 'Нет источников Google Drive' : 'No Google Drive sources found',
            'info'
          );
        } else if (r.synced > 0) {
          showSyncToast(
            lang === 'ru'
              ? `Синхронизировано: ${r.synced}, актуальны: ${r.fresh}`
              : `Synced: ${r.synced}, up-to-date: ${r.fresh}`,
            'success'
          );
          // Reload after a delay to reflect changes
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showSyncToast(
            lang === 'ru'
              ? `Все ${r.fresh} Drive-источник(ов) актуальны`
              : `All ${r.fresh} Drive source(s) up-to-date`,
            'success'
          );
        }
      } else {
        showSyncToast(lang === 'ru' ? 'Нет ответа' : 'No response', 'error');
      }
    } catch (error) {
      if (error.message && (error.message.includes('sendMessage') || error.message.includes('Extension context'))) {
        showSyncToast(getLang() === 'ru' ? 'Перезагрузите страницу (F5)' : 'Reload the page (F5)', 'error');
      } else {
        showSyncToast('Error: ' + error.message, 'error');
      }
    } finally {
      resetSyncButton();
    }
  }

  function resetSyncButton() {
    isSyncing = false;
    if (!syncButton) return;
    syncButton.disabled = false;
    syncButton.style.cursor = 'pointer';
    syncButton.style.animation = 'none';
    syncButton.style.color = '#9aa0a6';
    syncButton.style.background = 'transparent';
    const lang = getLang();
    syncButton.title = lang === 'ru' ? 'Синхронизировать Google Drive источники' : 'Sync Google Drive sources';
  }

  function showSyncToast(message, type) {
    // Remove existing toast
    const existing = document.getElementById('nlm-sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nlm-sync-toast';

    const colors = {
      success: { bg: 'rgba(52, 168, 83, 0.9)', border: 'rgba(52, 168, 83, 0.5)' },
      error: { bg: 'rgba(234, 67, 53, 0.9)', border: 'rgba(234, 67, 53, 0.5)' },
      info: { bg: 'rgba(66, 133, 244, 0.9)', border: 'rgba(66, 133, 244, 0.5)' }
    };
    const c = colors[type] || colors.info;

    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${c.bg};
      color: #fff;
      border: 1px solid ${c.border};
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 13px;
      font-family: 'Google Sans', Roboto, sans-serif;
      z-index: 99999;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function setupSyncButton() {
    if (!isSyncEnabled) return;
    const notebookId = getNotebookId();
    if (!notebookId) {
      if (syncButton) syncButton.style.display = 'none';
      return;
    }

    if (!syncButton) {
      createSyncButton();
    }

    syncButton.style.display = 'flex';
    insertSyncButton();
  }

  // Watch for DOM changes (source selection changes)
  function startObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      // Debounce updates
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(updateButtonVisibility, 150);
    });

    // Observe the sources panel for changes
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-checked']
    };

    // Find source panel to observe
    const sourcePanel = document.querySelector('.source-panel') || document.body;
    observer.observe(sourcePanel, config);
  }

  // Setup function - can be called multiple times for SPA navigation
  let currentNotebookId = null;

  function setup() {
    const notebookId = getNotebookId();

    // Skip if not on a notebook page
    if (!notebookId) {
      if (deleteButton) deleteButton.style.display = 'none';
      if (syncButton) syncButton.style.display = 'none';
      return;
    }

    // Skip if already set up for this notebook
    if (notebookId === currentNotebookId && deleteButton) {
      return;
    }

    currentNotebookId = notebookId;

    // Remove old buttons if exists
    if (deleteButton) {
      deleteButton.remove();
      deleteButton = null;
    }
    if (syncButton) {
      syncButton.remove();
      syncButton = null;
    }

    createDeleteButton();
    startObserver();
    setTimeout(updateButtonVisibility, 500);

    // Setup sync button (with delay for DOM to be ready)
    setTimeout(() => {
      document.documentElement.setAttribute('data-nlm-sync-setup', 'fired');
      setupSyncButton();
      document.documentElement.setAttribute('data-nlm-sync-result', syncButton ? 'created-' + (syncButton.parentElement?.tagName || 'orphan') : 'null');
    }, 800);
  }

  // Initialize
  async function init() {
    // DOM marker for debugging — can be checked from page context
    document.documentElement.setAttribute('data-nlm-ext', 'v3-sync');

    // Check sync button setting
    try {
      const syncResult = await chrome.storage.sync.get(['enableSyncDrive']);
      isSyncEnabled = syncResult.enableSyncDrive !== false; // Default to true
    } catch (e) { /* default true */ }

    document.documentElement.setAttribute('data-nlm-sync-enabled', String(isSyncEnabled));

    await checkEnabled();
    // Even if bulk delete is disabled, we still init for sync button

    // Initial setup
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }

    // Watch for SPA navigation (URL changes without page reload)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Delay to let Angular render the new page
        setTimeout(setup, 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Also watch for History API navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(setup, 500);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      setTimeout(setup, 500);
    };

    window.addEventListener('popstate', () => {
      setTimeout(setup, 500);
    });

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        if (changes.enableBulkDelete) {
          isEnabled = changes.enableBulkDelete.newValue !== false;
          updateButtonVisibility();
        }
        if (changes.enableSyncDrive) {
          isSyncEnabled = changes.enableSyncDrive.newValue !== false;
          if (syncButton) {
            syncButton.style.display = isSyncEnabled ? 'flex' : 'none';
          }
        }
      }
    });

    // Also update on clicks (for checkbox interactions)
    document.addEventListener('click', () => {
      setTimeout(updateButtonVisibility, 100);
    });
  }

  init();
})();
