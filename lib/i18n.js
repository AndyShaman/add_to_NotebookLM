// Localization system for Add to NotebookLM
// Supports English and Russian languages

const I18n = {
  // Current language
  currentLang: 'en',

  // Available languages
  languages: {
    en: 'English',
    ru: 'Русский'
  },

  // Translations cache
  translations: {},

  // Initialize localization
  async init() {
    // Load saved language preference
    const storage = await chrome.storage.sync.get(['language']);
    this.currentLang = storage.language || this.detectBrowserLanguage();

    // Load translations
    await this.loadTranslations();

    // Apply to page
    this.applyTranslations();

    return this.currentLang;
  },

  // Detect browser language
  detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('ru')) {
      return 'ru';
    }
    return 'en';
  },

  // Load translations from messages.json
  async loadTranslations() {
    try {
      const url = chrome.runtime.getURL(`_locales/${this.currentLang}/messages.json`);
      const response = await fetch(url);
      const messages = await response.json();

      // Convert to simple key-value format
      this.translations = {};
      for (const [key, value] of Object.entries(messages)) {
        this.translations[key] = value.message;
      }
    } catch (error) {
      console.error('Failed to load translations:', error);
      // Fallback to English
      if (this.currentLang !== 'en') {
        this.currentLang = 'en';
        await this.loadTranslations();
      }
    }
  },

  // Get translated string
  get(key, substitutions = {}) {
    let text = this.translations[key] || key;

    // Replace placeholders like $COUNT$, $CURRENT$, $TOTAL$
    for (const [placeholder, value] of Object.entries(substitutions)) {
      text = text.replace(new RegExp(`\\$${placeholder.toUpperCase()}\\$`, 'g'), value);
    }

    return text;
  },

  // Apply translations to elements with data-i18n attribute
  applyTranslations() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.get(key);
      }
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = this.get(key);
      }
    });

    // Titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.title = this.get(key);
      }
    });
  },

  // Set language and reload translations
  async setLanguage(lang) {
    if (this.languages[lang]) {
      this.currentLang = lang;
      await chrome.storage.sync.set({ language: lang });
      await this.loadTranslations();
      this.applyTranslations();
      return true;
    }
    return false;
  },

  // Get current language
  getLanguage() {
    return this.currentLang;
  },

  // Get all available languages
  getAvailableLanguages() {
    return this.languages;
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.I18n = I18n;
}
