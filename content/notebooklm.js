// Content script for NotebookLM - Bulk Delete Sources & Notebook Edit Mode
// Injects a delete button when multiple sources are selected
// Also handles notebook edit mode for bulk notebook deletion from home page

(function() {
  'use strict';

  let deleteButton = null;
  let isEnabled = true;
  let observer = null;

  // === NOTEBOOK EDIT MODE (Home Page) ===
  let notebookEditMode = false;
  let deleteNotebooksButton = null;
  let selectedNotebooks = new Set();
  let editModeStylesInjected = false;
  let editModeObserver = null;

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
      gap: 6px;
      background: transparent;
      color: #c4c7c5;
      border: 1px solid #5f6368;
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      font-family: 'Google Sans', Roboto, sans-serif;
      transition: background 0.2s, border-color 0.2s;
      margin-left: 12px;
      white-space: nowrap;
    `;

    deleteButton.addEventListener('mouseenter', () => {
      deleteButton.style.background = 'rgba(255, 255, 255, 0.1)';
      deleteButton.style.borderColor = '#8e918f';
    });

    deleteButton.addEventListener('mouseleave', () => {
      deleteButton.style.background = 'transparent';
      deleteButton.style.borderColor = '#5f6368';
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
        // Show success
        const successCount = response.successCount || selectedSources.length;
        const successMsg = lang.startsWith('ru')
          ? `✓ Удалено: ${successCount}`
          : `✓ Deleted: ${successCount}`;

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
    deleteButton.style.background = 'transparent';
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
      deleteButton.style.background = 'transparent';
      deleteButton.style.cursor = 'pointer';
    } else {
      deleteButton.style.display = 'none';
    }
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
      if (deleteButton) {
        deleteButton.style.display = 'none';
      }
      return;
    }

    // Skip if already set up for this notebook
    if (notebookId === currentNotebookId && deleteButton) {
      return;
    }

    currentNotebookId = notebookId;

    // Remove old button if exists
    if (deleteButton) {
      deleteButton.remove();
      deleteButton = null;
    }

    createDeleteButton();
    startObserver();
    setTimeout(updateButtonVisibility, 500);
  }

  // === NOTEBOOK EDIT MODE FUNCTIONS ===

  // Get language from document or navigator
  function getLang() {
    return document.documentElement.lang || navigator.language || 'en';
  }

  // Check if on home page
  function isHomePage() {
    const path = window.location.pathname;
    if (path === '/' || path === '' || path === '/home') return true;

    // Handle authuser-prefixed routes like /u/0/ or /u/1/home
    if (path.startsWith('/u/')) {
      const rest = path.replace(/^\/u\/\d+/, '');
      return rest === '' || rest === '/' || rest === '/home';
    }

    return false;
  }

  // Check for notebook edit mode flag from storage
  async function checkNotebookEditMode() {
    if (!isHomePage()) return;

    try {
      const result = await chrome.storage.local.get(['notebookEditMode']);
      if (result.notebookEditMode) {
        // Clear the flag
        await chrome.storage.local.remove(['notebookEditMode']);
        // Wait for page to render
        setTimeout(() => {
          activateNotebookEditMode();
        }, 1000);
      }
    } catch (e) {
      console.error('Error checking notebook edit mode:', e);
    }
  }

  // Inject edit mode styles
  function injectEditModeStyles() {
    if (editModeStylesInjected) return;

    const style = document.createElement('style');
    style.id = 'nlm-edit-mode-styles';
    style.textContent = `
      .nlm-notebook-checkbox {
        position: absolute !important;
        top: 12px !important;
        left: 12px !important;
        width: 20px !important;
        height: 20px !important;
        cursor: pointer !important;
        z-index: 100 !important;
        accent-color: #1a73e8 !important;
      }

      .nlm-notebook-card-wrapper {
        position: relative !important;
      }

      .nlm-notebook-card-wrapper.nlm-selected {
        outline: 2px solid #1a73e8 !important;
        outline-offset: -2px !important;
        border-radius: 12px !important;
      }

      .nlm-delete-notebooks-btn {
        display: none;
        position: fixed !important;
        bottom: 24px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 10000 !important;
        align-items: center !important;
        gap: 6px !important;
        background: #c5221f !important;
        color: white !important;
        border: none !important;
        border-radius: 20px !important;
        padding: 12px 24px !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        font-family: 'Google Sans', Roboto, sans-serif !important;
        transition: background 0.2s !important;
        white-space: nowrap !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      }

      .nlm-delete-notebooks-btn:hover:not(:disabled) {
        background: #a31c1a !important;
      }

      .nlm-delete-notebooks-btn:disabled {
        opacity: 0.6 !important;
        cursor: wait !important;
      }
    `;
    document.head.appendChild(style);
    editModeStylesInjected = true;
  }

  // Activate notebook edit mode
  function activateNotebookEditMode() {
    console.log('[NLM Content] activateNotebookEditMode called, current state:', notebookEditMode);
    if (notebookEditMode) return;

    notebookEditMode = true;
    console.log('[NLM Content] Injecting edit mode styles and checkboxes...');
    injectEditModeStyles();

    // Try to inject checkboxes with retry
    let attempts = 0;
    const tryInject = () => {
      const injected = injectCheckboxesToNotebooks();
      if (!injected && attempts < 10) {
        attempts++;
        setTimeout(tryInject, 500);
      } else if (injected) {
        showEditModeUI();
      }
      return injected;
    };
    const injectedNow = tryInject();

    if (!injectedNow) {
      if (editModeObserver) {
        editModeObserver.disconnect();
      }
      editModeObserver = new MutationObserver(() => {
        if (injectCheckboxesToNotebooks()) {
          showEditModeUI();
          editModeObserver.disconnect();
          editModeObserver = null;
        }
      });
      editModeObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Inject checkboxes into notebook cards
  function injectCheckboxesToNotebooks() {
    let injectedCount = 0;

    // ВАЖНО: Искать карточки ТОЛЬКО в контейнере пользовательских блокнотов
    // .my-projects-container = "Недавние блокноты" (можно удалять)
    // .featured-projects-container = "Рекомендуемые блокноты" (нельзя удалять)
    const myProjectsContainer = document.querySelector('.my-projects-container');
    console.log('[NLM] myProjectsContainer found:', !!myProjectsContainer);
    if (!myProjectsContainer) return false;

    const cards = myProjectsContainer.querySelectorAll('mat-card.project-button-card');
    console.log('[NLM] Found cards:', cards.length);

    cards.forEach(card => {
      if (card.querySelector('.nlm-notebook-checkbox')) return;

      // UUID находится внутри button.primary-action-button
      // (карточка "Создать блокнот" не имеет этой кнопки - пропускаем)
      const actionButton = card.querySelector('button.primary-action-button');

      let notebookId = null;

      if (actionButton) {
        // Паттерн 1: project-UUID в aria-labelledby
        const ariaLabel = actionButton.getAttribute('aria-labelledby') || '';
        const uuidMatch1 = ariaLabel.match(/project-([a-f0-9-]{36})/i);
        if (uuidMatch1) {
          notebookId = uuidMatch1[1];
        }

        // Паттерн 2: UUID напрямую в aria-labelledby
        if (!notebookId) {
          const uuidMatch2 = ariaLabel.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          if (uuidMatch2) notebookId = uuidMatch2[1];
        }

        // Паттерн 3: UUID в ID кнопки или data-атрибутах
        if (!notebookId) {
          const buttonId = actionButton.id || '';
          const combined = buttonId + ' ' + (actionButton.dataset.projectId || '') + ' ' + (actionButton.dataset.notebookId || '');
          const uuidMatch3 = combined.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          if (uuidMatch3) notebookId = uuidMatch3[1];
        }
      }

      // Паттерн 4: Поиск ссылки на блокнот
      if (!notebookId) {
        const link = card.querySelector('a[href*="/notebook/"]');
        if (link) {
          const hrefMatch = link.href.match(/\/notebook\/([a-f0-9-]{36})/i);
          if (hrefMatch) notebookId = hrefMatch[1];
        }
      }

      // Паттерн 5: Поиск UUID в HTML карточки (fallback)
      if (!notebookId) {
        const htmlMatch = card.outerHTML.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (htmlMatch) notebookId = htmlMatch[1];
      }

      if (!notebookId) {
        console.log('[NLM] Could not extract UUID for card');
        return;
      }

      console.log('[NLM] Card UUID:', notebookId);

      // Mark container
      card.classList.add('nlm-notebook-card-wrapper');

      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'nlm-notebook-checkbox';
      checkbox.dataset.notebookId = notebookId;

      checkbox.addEventListener('change', handleNotebookCheckboxChange);
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        // Do NOT call e.preventDefault() - it blocks checkbox state change!
      });

      // Make container relative for positioning
      const computedStyle = getComputedStyle(card);
      if (computedStyle.position === 'static') {
        card.style.position = 'relative';
      }

      // Insert checkbox
      card.insertBefore(checkbox, card.firstChild);
      injectedCount++;
    });

    console.log('[NLM Content] Injected checkboxes:', injectedCount);
    return injectedCount > 0;
  }

  // Handle checkbox change
  function handleNotebookCheckboxChange(e) {
    const notebookId = e.target.dataset.notebookId;
    const cardContainer = e.target.closest('.nlm-notebook-card-wrapper');

    console.log('[NLM] Checkbox change:', { notebookId, checked: e.target.checked });

    if (e.target.checked) {
      selectedNotebooks.add(notebookId);
      cardContainer?.classList.add('nlm-selected');
    } else {
      selectedNotebooks.delete(notebookId);
      cardContainer?.classList.remove('nlm-selected');
    }

    console.log('[NLM] Selected count:', selectedNotebooks.size);
    updateDeleteNotebooksButton();
  }

  // Show edit mode UI (Delete button only - "Done" is now in popup)
  function showEditModeUI() {
    if (deleteNotebooksButton) return;

    // Create "Delete" button (hidden initially, shows when notebooks selected)
    deleteNotebooksButton = document.createElement('button');
    deleteNotebooksButton.id = 'nlm-delete-notebooks-btn';
    deleteNotebooksButton.className = 'nlm-delete-notebooks-btn';
    deleteNotebooksButton.addEventListener('click', handleDeleteNotebooksClick);

    // Append to body (it's now fixed positioned)
    document.body.appendChild(deleteNotebooksButton);
  }


  // Update delete notebooks button text
  function updateDeleteNotebooksButton() {
    if (!deleteNotebooksButton) return;

    const count = selectedNotebooks.size;
    const lang = getLang();
    const isRu = lang.startsWith('ru');

    if (count > 0) {
      const text = isRu
        ? `🗑️ Удалить (${count})`
        : `🗑️ Delete (${count})`;
      deleteNotebooksButton.innerHTML = text;
      deleteNotebooksButton.style.display = 'flex';
    } else {
      deleteNotebooksButton.style.display = 'none';
    }
  }

  // Handle delete notebooks click
  async function handleDeleteNotebooksClick() {
    const notebookIds = Array.from(selectedNotebooks);
    console.log('[NLM] Delete clicked, selected:', notebookIds);
    if (notebookIds.length === 0) return;

    const lang = getLang();
    const isRu = lang.startsWith('ru');

    const confirmMsg = isRu
      ? `Удалить ${notebookIds.length} ноутбук(ов)? Это действие нельзя отменить.`
      : `Delete ${notebookIds.length} notebook(s)? This cannot be undone.`;

    if (!confirm(confirmMsg)) return;

    // Show loading
    deleteNotebooksButton.disabled = true;
    deleteNotebooksButton.innerHTML = isRu ? '⏳ Удаление...' : '⏳ Deleting...';

    try {
      // Check if extension context is valid
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        const reloadMsg = isRu
          ? 'Расширение было обновлено. Перезагрузите страницу (F5).'
          : 'Extension was updated. Please reload the page (F5).';
        alert(reloadMsg);
        resetDeleteNotebooksButton();
        return;
      }

      const response = await chrome.runtime.sendMessage({
        cmd: 'delete-notebooks',
        notebookIds: notebookIds
      });

      if (response && response.error) {
        alert('Error: ' + response.error);
        resetDeleteNotebooksButton();
      } else if (!response) {
        const reloadMsg = isRu
          ? 'Нет ответа от расширения. Перезагрузите страницу (F5).'
          : 'No response from extension. Please reload the page (F5).';
        alert(reloadMsg);
        resetDeleteNotebooksButton();
      } else {
        // Success - show message and reload page to refresh the list
        const successCount = response.deletedCount || notebookIds.length;
        const successMsg = isRu
          ? `✓ Удалено: ${successCount}`
          : `✓ Deleted: ${successCount}`;

        deleteNotebooksButton.innerHTML = successMsg;

        // Reload page after short delay (like source deletion does)
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('Delete notebooks error:', error);
      if (error.message && (error.message.includes('sendMessage') || error.message.includes('Extension context'))) {
        const reloadMsg = isRu
          ? 'Расширение было обновлено. Перезагрузите страницу (F5).'
          : 'Extension was updated. Please reload the page (F5).';
        alert(reloadMsg);
      } else {
        alert('Error: ' + error.message);
      }
      resetDeleteNotebooksButton();
    }
  }

  // Reset delete notebooks button
  function resetDeleteNotebooksButton() {
    if (!deleteNotebooksButton) return;
    deleteNotebooksButton.disabled = false;
    updateDeleteNotebooksButton();
  }

  // Deactivate notebook edit mode
  function deactivateNotebookEditMode() {
    notebookEditMode = false;
    selectedNotebooks.clear();

    if (editModeObserver) {
      editModeObserver.disconnect();
      editModeObserver = null;
    }

    // Remove checkboxes
    document.querySelectorAll('.nlm-notebook-checkbox').forEach(cb => cb.remove());

    // Remove selection styling
    document.querySelectorAll('.nlm-notebook-card-wrapper').forEach(el => {
      el.classList.remove('nlm-notebook-card-wrapper', 'nlm-selected');
    });

    // Remove delete button
    deleteNotebooksButton?.remove();
    deleteNotebooksButton = null;

    // Remove styles
    document.getElementById('nlm-edit-mode-styles')?.remove();
    editModeStylesInjected = false;
  }

  // === END NOTEBOOK EDIT MODE FUNCTIONS ===

  // Initialize
  async function init() {
    const enabled = await checkEnabled();
    if (!enabled) {
      // Still check for notebook edit mode even if bulk delete is disabled
      await checkNotebookEditMode();
      return;
    }

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
        // Also check for notebook edit mode if navigated to home
        setTimeout(checkNotebookEditMode, 600);
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
      if (namespace === 'sync' && changes.enableBulkDelete) {
        isEnabled = changes.enableBulkDelete.newValue !== false;
        updateButtonVisibility();
      }
    });

    // Also update on clicks (for checkbox interactions)
    document.addEventListener('click', () => {
      setTimeout(updateButtonVisibility, 100);
    });

    // Check for notebook edit mode on home page
    await checkNotebookEditMode();

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[NLM Content] Message received:', request.cmd);
      if (request.cmd === 'activate-notebook-edit-mode') {
        if (isHomePage()) {
          activateNotebookEditMode();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Not on home page' });
        }
      } else if (request.cmd === 'deactivate-notebook-edit-mode') {
        deactivateNotebookEditMode();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  init();

  // Export for testing (only in test environment)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isHomePage,
      getNotebookId,
      getSelectedSources,
      injectCheckboxesToNotebooks,
      activateNotebookEditMode,
      deactivateNotebookEditMode,
      getLang
    };
  }
})();
