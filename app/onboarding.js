// Onboarding page for Add to NotebookLM (opened once after install)

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Apply theme first (before any rendering)
  await initTheme();

  if (window.I18n) {
    await I18n.init();
  }
}

// Initialize theme from storage
async function initTheme() {
  try {
    const storage = await chrome.storage.sync.get(['theme']);
    if (storage.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Default to light theme
  }
}
