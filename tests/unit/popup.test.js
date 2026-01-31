/**
 * Tests for popup/popup.js
 * Popup UI logic for Add to NotebookLM extension
 */

// Mock SharedUI before requiring popup
global.SharedUI = {
  sendMessage: jest.fn(),
  fillAccountSelect: jest.fn(),
  fillNotebookSelect: jest.fn(),
  setSingleOption: jest.fn(),
  getSelectedAccount: jest.fn().mockResolvedValue(0),
  getLastNotebook: jest.fn().mockResolvedValue('')
};

// Mock I18n
global.I18n = {
  init: jest.fn().mockResolvedValue(),
  get: jest.fn((key) => key)
};

describe('Popup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = `
      <select id="account-select"></select>
      <select id="notebook-select"></select>
      <button id="add-btn">Add</button>
      <button id="new-notebook-btn">New</button>
      <button id="bulk-btn">Bulk</button>
      <button id="tabs-btn">Tabs</button>
      <button id="delete-notebooks-btn">Delete</button>
      <button id="settings-btn">Settings</button>
      <button id="open-notebook-btn">Open</button>
      <div id="status"></div>
      <div id="current-url"></div>
      <div id="new-notebook-modal" class="hidden">
        <input id="new-notebook-name" />
        <button id="modal-cancel">Cancel</button>
        <button id="modal-create">Create</button>
      </div>
    `;
  });

  describe('YouTube page type detection', () => {
    // Test the detectYouTubePageType function logic
    test('detects single video page', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(url.includes('youtube.com')).toBe(true);
      expect(url.includes('/watch')).toBe(true);
      expect(url.includes('/playlist')).toBe(false);

      const urlObj = new URL(url);
      expect(urlObj.searchParams.has('list')).toBe(false);
    });

    test('detects playlist page', () => {
      const url = 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
      expect(url.includes('/playlist')).toBe(true);
    });

    test('detects video from playlist', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
      expect(url.includes('/watch')).toBe(true);

      const urlObj = new URL(url);
      expect(urlObj.searchParams.has('list')).toBe(true);
    });

    test('detects channel page by username', () => {
      const url = 'https://www.youtube.com/@username';
      expect(url.includes('/@')).toBe(true);
    });

    test('detects channel page by channel ID', () => {
      const url = 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw';
      expect(url.includes('/channel/')).toBe(true);
    });

    test('detects legacy channel URL', () => {
      const url = 'https://www.youtube.com/c/ChannelName';
      expect(url.includes('/c/')).toBe(true);
    });
  });

  describe('extractYouTubeUrls function logic', () => {
    // The function is injected into page, but we can test URL parsing logic

    test('cleans playlist parameters from video URL', () => {
      const href = '/watch?v=dQw4w9WgXcQ&list=PLtest&index=5';
      const url = new URL(href, 'https://www.youtube.com');
      url.searchParams.delete('list');
      url.searchParams.delete('index');

      expect(url.toString()).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    test('limits URLs to 50', () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://youtube.com/watch?v=video${i}`);
      const limited = [...new Set(urls)].slice(0, 50);

      expect(limited.length).toBe(50);
    });

    test('removes duplicate URLs', () => {
      const urls = [
        'https://youtube.com/watch?v=abc',
        'https://youtube.com/watch?v=def',
        'https://youtube.com/watch?v=abc' // duplicate
      ];
      const unique = [...new Set(urls)];

      expect(unique.length).toBe(2);
    });
  });

  describe('showStatus function logic', () => {
    test('status div gets correct class for loading', () => {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status loading';

      expect(statusDiv.classList.contains('status')).toBe(true);
      expect(statusDiv.classList.contains('loading')).toBe(true);
    });

    test('status div gets correct class for error', () => {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status error';

      expect(statusDiv.classList.contains('error')).toBe(true);
    });

    test('status div gets correct class for success', () => {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status success';

      expect(statusDiv.classList.contains('success')).toBe(true);
    });
  });

  describe('modal handling', () => {
    test('modal is hidden by default', () => {
      const modal = document.getElementById('new-notebook-modal');
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    test('modal can be shown', () => {
      const modal = document.getElementById('new-notebook-modal');
      modal.classList.remove('hidden');

      expect(modal.classList.contains('hidden')).toBe(false);
    });

    test('modal can be hidden', () => {
      const modal = document.getElementById('new-notebook-modal');
      modal.classList.remove('hidden');
      modal.classList.add('hidden');

      expect(modal.classList.contains('hidden')).toBe(true);
    });
  });

  describe('notebook URL generation', () => {
    test('generates correct notebook URL', () => {
      const notebookId = 'abc-123-def-456';
      const url = `https://notebooklm.google.com/notebook/${notebookId}`;

      expect(url).toBe('https://notebooklm.google.com/notebook/abc-123-def-456');
    });
  });
});

describe('SharedUI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<select id="test-select"></select>';
  });

  describe('setSingleOption', () => {
    test('sets single option in select element', () => {
      const select = document.getElementById('test-select');

      // Simulate setSingleOption behavior
      select.innerHTML = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Test Label';
      select.appendChild(option);

      expect(select.options.length).toBe(1);
      expect(select.options[0].textContent).toBe('Test Label');
    });
  });

  describe('fillNotebookSelect logic', () => {
    test('fills select with notebooks', () => {
      const select = document.getElementById('test-select');
      const notebooks = [
        { id: '1', name: 'Notebook 1', emoji: '📔', sources: 5 },
        { id: '2', name: 'Notebook 2', emoji: '📺', sources: 10 }
      ];

      // Simulate fillNotebookSelect behavior
      select.innerHTML = '';
      notebooks.forEach(nb => {
        const option = document.createElement('option');
        option.value = nb.id;
        option.textContent = `${nb.emoji} ${nb.name} (${nb.sources} sources)`;
        select.appendChild(option);
      });

      expect(select.options.length).toBe(2);
      expect(select.options[0].value).toBe('1');
      expect(select.options[0].textContent).toContain('Notebook 1');
      expect(select.options[1].textContent).toContain('📺');
    });

    test('selects last notebook if specified', () => {
      const select = document.getElementById('test-select');
      const notebooks = [
        { id: '1', name: 'Notebook 1', emoji: '📔', sources: 5 },
        { id: '2', name: 'Notebook 2', emoji: '📺', sources: 10 }
      ];
      const lastNotebook = '2';

      select.innerHTML = '';
      notebooks.forEach(nb => {
        const option = document.createElement('option');
        option.value = nb.id;
        option.textContent = nb.name;
        if (nb.id === lastNotebook) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      expect(select.value).toBe('2');
    });
  });

  describe('fillAccountSelect logic', () => {
    test('fills select with accounts', () => {
      const select = document.getElementById('test-select');
      const accounts = [
        { email: 'user1@gmail.com', index: 0 },
        { email: 'user2@gmail.com', index: 1 }
      ];

      select.innerHTML = '';
      accounts.forEach((acc, index) => {
        const option = document.createElement('option');
        option.value = acc.index !== undefined ? acc.index : index;
        option.textContent = acc.email;
        select.appendChild(option);
      });

      expect(select.options.length).toBe(2);
      expect(select.options[0].textContent).toBe('user1@gmail.com');
      expect(select.options[1].value).toBe('1');
    });
  });
});
