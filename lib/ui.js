// Shared UI helpers for popup and app pages

const SharedUI = (() => {
  // Clean YouTube title by removing notification count and suffix
  // e.g., "(455) Video Title - YouTube" -> "Video Title"
  function cleanYouTubeTitle(title) {
    if (!title) return title;
    return title
      .replace(/^\(\d+\)\s*/, '')      // Remove (N) notification count at start
      .replace(/\s*-\s*YouTube$/, ''); // Remove " - YouTube" suffix
  }

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

  async function getSelectedAccount() {
    const storage = await chrome.storage.sync.get(['selectedAccount']);
    return storage.selectedAccount || 0;
  }

  async function getLastNotebook() {
    const storage = await chrome.storage.sync.get(['lastNotebook']);
    return storage.lastNotebook || '';
  }

  function setSingleOption(selectEl, label, value = '') {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
  }

  function fillAccountSelect(selectEl, accounts, options = {}) {
    if (!selectEl) return false;

    const selectedAccount = options.selectedAccount ?? 0;
    const defaultLabel = options.defaultLabel || 'Default';

    selectEl.innerHTML = '';

    if (accounts && accounts.length > 0) {
      accounts.forEach((acc, index) => {
        const option = document.createElement('option');
        const value = acc.index !== undefined ? acc.index : index;
        option.value = value;
        option.textContent = acc.email || acc.name || `Account ${index + 1}`;
        if (value === selectedAccount) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });
      return true;
    }

    setSingleOption(selectEl, defaultLabel);
    return false;
  }

  function fillNotebookSelect(selectEl, notebooks, options = {}) {
    if (!selectEl) return false;

    const lastNotebook = options.lastNotebook || '';
    const sourcesLabel = options.sourcesLabel || 'sources';
    const emptyLabel = options.emptyLabel || 'No notebooks found';

    selectEl.innerHTML = '';

    if (!notebooks || notebooks.length === 0) {
      setSingleOption(selectEl, emptyLabel);
      return false;
    }

    notebooks.forEach(nb => {
      const option = document.createElement('option');
      option.value = nb.id;
      const name = nb.name || 'Untitled notebook';
      const emoji = nb.emoji || '';
      const sources = nb.sources ?? 0;
      option.textContent = `${emoji} ${name} (${sources} ${sourcesLabel})`.trim();
      if (nb.id === lastNotebook) {
        option.selected = true;
      }
      selectEl.appendChild(option);
    });

    return true;
  }

  return {
    cleanYouTubeTitle,
    sendMessage,
    getSelectedAccount,
    getLastNotebook,
    setSingleOption,
    fillAccountSelect,
    fillNotebookSelect
  };
})();

if (typeof window !== 'undefined') {
  window.SharedUI = SharedUI;
}
