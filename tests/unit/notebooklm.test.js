/**
 * Tests for content/notebooklm.js
 * NotebookLM content script - Bulk Delete Sources & Notebook Edit Mode
 */

describe('NotebookLM Content Script', () => {
  let notebooklm;

  beforeEach(() => {
    // Reset DOM and mocks
    document.body.innerHTML = '';
    jest.clearAllMocks();
    window.location.pathname = '/';
    window.location.href = 'https://notebooklm.google.com/';

    // Re-require module to get fresh state
    jest.resetModules();
    notebooklm = require('../../content/notebooklm.js');
  });

  describe('isHomePage', () => {
    test('returns true for root path /', () => {
      window.location.pathname = '/';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns true for empty path', () => {
      window.location.pathname = '';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns true for /home path', () => {
      window.location.pathname = '/home';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns true for /u/0/', () => {
      window.location.pathname = '/u/0/';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns true for /u/0', () => {
      window.location.pathname = '/u/0';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns true for /u/1/home', () => {
      window.location.pathname = '/u/1/home';
      expect(notebooklm.isHomePage()).toBe(true);
    });

    test('returns false for notebook path', () => {
      window.location.pathname = '/notebook/abc-123-def-456';
      expect(notebooklm.isHomePage()).toBe(false);
    });

    test('returns false for /u/0/notebook/id path', () => {
      window.location.pathname = '/u/0/notebook/abc-123';
      expect(notebooklm.isHomePage()).toBe(false);
    });
  });

  describe('getNotebookId', () => {
    test('extracts notebook ID from URL', () => {
      window.location.pathname = '/notebook/abc12345-1234-5678-9abc-def012345678';
      expect(notebooklm.getNotebookId()).toBe('abc12345-1234-5678-9abc-def012345678');
    });

    test('returns null for home page', () => {
      window.location.pathname = '/';
      expect(notebooklm.getNotebookId()).toBeNull();
    });

    test('returns null for invalid path', () => {
      window.location.pathname = '/settings';
      expect(notebooklm.getNotebookId()).toBeNull();
    });
  });

  describe('getSelectedSources', () => {
    test('returns empty array when no sources exist', () => {
      document.body.innerHTML = '<div>Empty page</div>';
      expect(notebooklm.getSelectedSources()).toEqual([]);
    });

    test('returns empty array when no sources are selected', () => {
      document.body.innerHTML = `
        <div class="single-source-container">
          <mat-checkbox></mat-checkbox>
          <button id="source-item-more-button-12345678-1234-5678-9abc-def012345678"></button>
        </div>
      `;
      expect(notebooklm.getSelectedSources()).toEqual([]);
    });

    test('returns selected source IDs', () => {
      document.body.innerHTML = `
        <div class="single-source-container">
          <mat-checkbox class="mat-mdc-checkbox-checked"></mat-checkbox>
          <button id="source-item-more-button-12345678-1234-5678-9abc-def012345678"></button>
        </div>
        <div class="single-source-container">
          <mat-checkbox></mat-checkbox>
          <button id="source-item-more-button-87654321-4321-8765-cba9-876543210fed"></button>
        </div>
      `;
      const selected = notebooklm.getSelectedSources();
      expect(selected).toHaveLength(1);
      expect(selected[0]).toBe('12345678-1234-5678-9abc-def012345678');
    });

    test('returns multiple selected source IDs', () => {
      document.body.innerHTML = `
        <div class="single-source-container">
          <mat-checkbox class="mat-mdc-checkbox-checked"></mat-checkbox>
          <button id="source-item-more-button-12345678-1234-5678-9abc-def012345678"></button>
        </div>
        <div class="single-source-container">
          <mat-checkbox class="mat-mdc-checkbox-checked"></mat-checkbox>
          <button id="source-item-more-button-87654321-4321-8765-cba9-876543210fed"></button>
        </div>
      `;
      const selected = notebooklm.getSelectedSources();
      expect(selected).toHaveLength(2);
      expect(selected).toContain('12345678-1234-5678-9abc-def012345678');
      expect(selected).toContain('87654321-4321-8765-cba9-876543210fed');
    });

    test('detects selection via checked input checkbox', () => {
      document.body.innerHTML = `
        <div class="single-source-container">
          <input type="checkbox" checked>
          <button id="source-item-more-button-12345678-1234-5678-9abc-def012345678"></button>
        </div>
      `;
      const selected = notebooklm.getSelectedSources();
      expect(selected).toHaveLength(1);
      expect(selected[0]).toBe('12345678-1234-5678-9abc-def012345678');
    });
  });

  describe('getLang', () => {
    test('returns document lang if set', () => {
      document.documentElement.lang = 'ru';
      expect(notebooklm.getLang()).toBe('ru');
    });

    test('returns en as fallback', () => {
      document.documentElement.lang = '';
      // navigator.language is mocked to 'en' in setup
      expect(notebooklm.getLang()).toBeTruthy();
    });
  });

  describe('injectCheckboxesToNotebooks', () => {
    // Helper to create realistic NotebookLM DOM structure
    function createNotebookCard(notebookId) {
      return `
        <mat-card class="project-button-card">
          <button class="primary-action-button" aria-labelledby="project-${notebookId}">
            Open
          </button>
          <a href="/notebook/${notebookId}">Notebook</a>
        </mat-card>
      `;
    }

    test('returns false when no notebook links exist', () => {
      document.body.innerHTML = '<div>Empty page</div>';
      expect(notebooklm.injectCheckboxesToNotebooks()).toBe(false);
    });

    test('returns false when no my-projects-container exists', () => {
      document.body.innerHTML = `
        <div class="featured-projects-container">
          ${createNotebookCard('abc12345-1234-5678-9abc-def012345678')}
        </div>
      `;
      expect(notebooklm.injectCheckboxesToNotebooks()).toBe(false);
    });

    test('injects checkboxes when notebook cards exist in my-projects-container', () => {
      document.body.innerHTML = `
        <div class="my-projects-container">
          ${createNotebookCard('abc12345-1234-5678-9abc-def012345678')}
          ${createNotebookCard('87654321-4321-8765-cba9-876543210fed')}
        </div>
      `;

      const result = notebooklm.injectCheckboxesToNotebooks();

      expect(result).toBe(true);
      const checkboxes = document.querySelectorAll('.nlm-notebook-checkbox');
      expect(checkboxes.length).toBe(2);
    });

    test('adds correct notebook ID as data attribute', () => {
      const notebookId = 'abc12345-1234-5678-9abc-def012345678';
      document.body.innerHTML = `
        <div class="my-projects-container">
          ${createNotebookCard(notebookId)}
        </div>
      `;

      notebooklm.injectCheckboxesToNotebooks();

      const checkbox = document.querySelector('.nlm-notebook-checkbox');
      expect(checkbox.dataset.notebookId).toBe(notebookId);
    });

    test('does not inject duplicate checkboxes', () => {
      document.body.innerHTML = `
        <div class="my-projects-container">
          ${createNotebookCard('abc12345-1234-5678-9abc-def012345678')}
        </div>
      `;

      notebooklm.injectCheckboxesToNotebooks();
      notebooklm.injectCheckboxesToNotebooks();

      const checkboxes = document.querySelectorAll('.nlm-notebook-checkbox');
      expect(checkboxes.length).toBe(1);
    });

    test('adds wrapper class to card container', () => {
      document.body.innerHTML = `
        <div class="my-projects-container">
          ${createNotebookCard('abc12345-1234-5678-9abc-def012345678')}
        </div>
      `;

      notebooklm.injectCheckboxesToNotebooks();

      const wrapper = document.querySelector('.nlm-notebook-card-wrapper');
      expect(wrapper).not.toBeNull();
      expect(wrapper.classList.contains('project-button-card')).toBe(true);
    });
  });

  describe('activateNotebookEditMode', () => {
    beforeEach(() => {
      window.location.pathname = '/';
      document.body.innerHTML = `
        <div class="my-projects-container">
          <mat-card class="project-button-card">
            <button class="primary-action-button" aria-labelledby="project-abc12345-1234-5678-9abc-def012345678">
              Open
            </button>
            <a href="/notebook/abc12345-1234-5678-9abc-def012345678">Notebook</a>
          </mat-card>
        </div>
      `;
    });

    test('injects edit mode styles', () => {
      notebooklm.activateNotebookEditMode();

      const styles = document.getElementById('nlm-edit-mode-styles');
      expect(styles).not.toBeNull();
    });

    test('injects checkboxes', () => {
      notebooklm.activateNotebookEditMode();

      const checkboxes = document.querySelectorAll('.nlm-notebook-checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  describe('deactivateNotebookEditMode', () => {
    beforeEach(() => {
      window.location.pathname = '/';
      document.body.innerHTML = `
        <div class="my-projects-container">
          <mat-card class="project-button-card">
            <button class="primary-action-button" aria-labelledby="project-abc12345-1234-5678-9abc-def012345678">
              Open
            </button>
            <a href="/notebook/abc12345-1234-5678-9abc-def012345678">Notebook</a>
          </mat-card>
        </div>
      `;
      // First activate edit mode
      notebooklm.activateNotebookEditMode();
    });

    afterEach(() => {
      // Clean up styles that are injected into head
      const styles = document.getElementById('nlm-edit-mode-styles');
      if (styles) styles.remove();
    });

    test('removes checkboxes', () => {
      notebooklm.deactivateNotebookEditMode();

      const checkboxes = document.querySelectorAll('.nlm-notebook-checkbox');
      expect(checkboxes.length).toBe(0);
    });

    test('removes wrapper classes', () => {
      notebooklm.deactivateNotebookEditMode();

      const wrappers = document.querySelectorAll('.nlm-notebook-card-wrapper');
      expect(wrappers.length).toBe(0);
    });

    test('removes edit mode styles', () => {
      // Verify styles exist before deactivation
      expect(document.getElementById('nlm-edit-mode-styles')).not.toBeNull();

      notebooklm.deactivateNotebookEditMode();

      const styles = document.getElementById('nlm-edit-mode-styles');
      expect(styles).toBeNull();
    });
  });
});
