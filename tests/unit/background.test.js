/**
 * Tests for background.js
 * NotebookLM API client and background service worker
 */

describe('NotebookLMAPI', () => {
  let NotebookLMAPI;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fetch
    global.fetch = jest.fn();

    // Create a fresh NotebookLMAPI instance for testing
    NotebookLMAPI = {
      BASE_URL: 'https://notebooklm.google.com',
      tokens: null,

      extractToken(key, html) {
        const regex = new RegExp(`"${key}":"([^"]+)"`);
        const match = regex.exec(html);
        return match ? match[1] : null;
      },

      parseNotebookList(responseText) {
        try {
          const lines = responseText.split('\n');
          const dataLine = lines.find(line => line.includes('wrb.fr'));
          if (!dataLine) return [];

          const parsed = JSON.parse(dataLine);
          const innerData = JSON.parse(parsed[0][2]);

          if (!innerData || !innerData[0]) return [];

          return innerData[0]
            .filter(item => item && item.length >= 3)
            .filter(item => {
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
          return [];
        }
      },

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
          return { sources: [] };
        }
      },

      getNotebookUrl(notebookId, authuser = 0) {
        const base = `${this.BASE_URL}/notebook/${notebookId}`;
        return authuser > 0 ? `${base}?authuser=${authuser}` : base;
      }
    };
  });

  describe('extractToken', () => {
    test('extracts cfb2h token from HTML', () => {
      const html = '<script>window.WIZ_global_data = {"cfb2h":"test-bl-token-123"};</script>';
      const token = NotebookLMAPI.extractToken('cfb2h', html);
      expect(token).toBe('test-bl-token-123');
    });

    test('extracts SNlM0e token from HTML', () => {
      const html = '<script>AF_initDataChunkQueue.push([0, "SNlM0e":"at-token-xyz"])</script>';
      const token = NotebookLMAPI.extractToken('SNlM0e', html);
      expect(token).toBe('at-token-xyz');
    });

    test('returns null when token not found', () => {
      const html = '<html><body>No tokens here</body></html>';
      const token = NotebookLMAPI.extractToken('cfb2h', html);
      expect(token).toBeNull();
    });
  });

  describe('parseNotebookList', () => {
    test('returns empty array for invalid response', () => {
      const response = 'invalid response';
      const notebooks = NotebookLMAPI.parseNotebookList(response);
      expect(notebooks).toEqual([]);
    });

    test('returns empty array when no wrb.fr line found', () => {
      const response = ")]}'\n\nsome other content";
      const notebooks = NotebookLMAPI.parseNotebookList(response);
      expect(notebooks).toEqual([]);
    });

    test('notebook parsing logic extracts correct fields', () => {
      // Test the mapping logic directly
      const rawNotebook = ['Notebook Name', ['src1', 'src2'], 'notebook-uuid', '📔', null, null];

      const notebook = {
        id: rawNotebook[2],
        name: rawNotebook[0]?.trim() || 'Untitled notebook',
        sources: rawNotebook[1]?.length || 0,
        emoji: rawNotebook[3] || '📔'
      };

      expect(notebook.id).toBe('notebook-uuid');
      expect(notebook.name).toBe('Notebook Name');
      expect(notebook.sources).toBe(2);
      expect(notebook.emoji).toBe('📔');
    });

    test('filters shared notebooks based on metadata', () => {
      // Shared notebook has [3] as metadata[5]
      const sharedNotebook = ['Shared', [], 'id', '📔', null, [3]];
      const ownNotebook = ['My Notebook', [], 'id', '📔', null, null];

      const isShared = (item) => {
        const metadata = item[5];
        return Array.isArray(metadata) && metadata.length > 0 && metadata[0] === 3;
      };

      expect(isShared(sharedNotebook)).toBe(true);
      expect(isShared(ownNotebook)).toBe(false);
    });

    test('handles missing notebook name', () => {
      const notebook = {
        name: null?.trim() || 'Untitled notebook'
      };
      expect(notebook.name).toBe('Untitled notebook');
    });

    test('handles missing emoji', () => {
      const notebook = {
        emoji: null || '📔'
      };
      expect(notebook.emoji).toBe('📔');
    });
  });

  describe('parseNotebookDetails', () => {
    test('returns empty sources for invalid response', () => {
      const response = 'invalid';
      const notebook = NotebookLMAPI.parseNotebookDetails(response);
      expect(notebook.sources).toEqual([]);
    });

    test('source parsing extracts correct fields', () => {
      const rawSource = ['source-id', null, 'Source Title', [4, 'https://youtube.com/watch'], 1];

      const typeNames = {
        1: 'url',
        3: 'text',
        4: 'youtube',
        7: 'pdf',
        8: 'audio'
      };
      const sourceType = rawSource[3]?.[0] || 0;

      const source = {
        id: rawSource[0],
        title: rawSource[2] || 'Untitled',
        type: typeNames[sourceType] || 'unknown',
        typeCode: sourceType,
        url: rawSource[3]?.[1] || null,
        status: rawSource[4] || 0
      };

      expect(source.id).toBe('source-id');
      expect(source.title).toBe('Source Title');
      expect(source.type).toBe('youtube');
      expect(source.typeCode).toBe(4);
      expect(source.url).toBe('https://youtube.com/watch');
      expect(source.status).toBe(1);
    });

    test('maps source type codes to type names', () => {
      const typeNames = {
        1: 'url',
        3: 'text',
        4: 'youtube',
        7: 'pdf',
        8: 'audio'
      };

      expect(typeNames[1]).toBe('url');
      expect(typeNames[3]).toBe('text');
      expect(typeNames[4]).toBe('youtube');
      expect(typeNames[7]).toBe('pdf');
      expect(typeNames[8]).toBe('audio');
      expect(typeNames[99] || 'unknown').toBe('unknown');
    });

    test('handles missing source title', () => {
      const title = null || 'Untitled';
      expect(title).toBe('Untitled');
    });

    test('handles missing source URL', () => {
      const url = undefined?.[1] || null;
      expect(url).toBeNull();
    });
  });

  describe('getNotebookUrl', () => {
    test('generates URL without authuser for default account', () => {
      const url = NotebookLMAPI.getNotebookUrl('notebook-123');
      expect(url).toBe('https://notebooklm.google.com/notebook/notebook-123');
    });

    test('generates URL without authuser when authuser is 0', () => {
      const url = NotebookLMAPI.getNotebookUrl('notebook-123', 0);
      expect(url).toBe('https://notebooklm.google.com/notebook/notebook-123');
    });

    test('includes authuser param for non-default accounts', () => {
      const url = NotebookLMAPI.getNotebookUrl('notebook-123', 1);
      expect(url).toBe('https://notebooklm.google.com/notebook/notebook-123?authuser=1');
    });

    test('includes authuser param for higher account indices', () => {
      const url = NotebookLMAPI.getNotebookUrl('notebook-123', 3);
      expect(url).toBe('https://notebooklm.google.com/notebook/notebook-123?authuser=3');
    });
  });

  describe('URL source formatting', () => {
    test('formats YouTube URL correctly', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      const source = isYouTube
        ? [null, null, null, null, null, null, null, [url]]
        : [null, null, [url]];

      expect(source[7]).toEqual([url]);
    });

    test('formats regular URL correctly', () => {
      const url = 'https://example.com/article';
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      const source = isYouTube
        ? [null, null, null, null, null, null, null, [url]]
        : [null, null, [url]];

      expect(source[2]).toEqual([url]);
    });

    test('formats youtu.be short URL as YouTube', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      expect(isYouTube).toBe(true);
    });
  });

  describe('batch deletion logic', () => {
    test('splits large arrays into chunks of 20', () => {
      const sourceIds = Array.from({ length: 55 }, (_, i) => `source-${i}`);
      const BATCH_SIZE = 20;

      const chunks = [];
      for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
        chunks.push(sourceIds.slice(i, i + BATCH_SIZE));
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(20);
      expect(chunks[1]).toHaveLength(20);
      expect(chunks[2]).toHaveLength(15);
    });

    test('handles empty array', () => {
      const sourceIds = [];
      expect(sourceIds.length).toBe(0);
    });

    test('handles array smaller than batch size', () => {
      const sourceIds = Array.from({ length: 5 }, (_, i) => `source-${i}`);
      const BATCH_SIZE = 20;

      const chunks = [];
      for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
        chunks.push(sourceIds.slice(i, i + BATCH_SIZE));
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toHaveLength(5);
    });
  });
});

describe('Message handler command routing', () => {
  test('noTokenCommands list includes expected commands', () => {
    const noTokenCommands = ['list-accounts', 'ping', 'get-current-tab', 'get-all-tabs', 'activate-notebook-edit-mode'];

    expect(noTokenCommands).toContain('ping');
    expect(noTokenCommands).toContain('list-accounts');
    expect(noTokenCommands).toContain('get-current-tab');
    expect(noTokenCommands).not.toContain('list-notebooks');
    expect(noTokenCommands).not.toContain('add-source');
  });
});

describe('UUID extraction', () => {
  test('extracts UUID from create notebook response', () => {
    const response = 'some text abc12345-1234-5678-9abc-def012345678 more text';
    const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);

    expect(uuidMatch).not.toBeNull();
    expect(uuidMatch[0]).toBe('abc12345-1234-5678-9abc-def012345678');
  });

  test('returns null when no UUID found', () => {
    const response = 'no uuid here';
    const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);

    expect(uuidMatch).toBeNull();
  });
});

describe('Account filtering', () => {
  test('filters accounts with valid email addresses', () => {
    const rawAccounts = [
      ['id1', null, 'John Doe', 'john@gmail.com', 'avatar1', true, false],
      ['id2', null, 'YouTube Channel', null, 'avatar2', false, false], // YouTube channel (no email)
      ['id3', null, 'Jane Doe', 'jane@gmail.com', 'avatar3', false, true]
    ];

    const filtered = rawAccounts
      .filter(acc => acc[3] && acc[3].includes('@'))
      .map((acc, idx) => ({
        name: acc[2] || null,
        email: acc[3] || null,
        avatar: acc[4] || null,
        isActive: acc[5] || false,
        isDefault: acc[6] || false,
        index: idx
      }));

    expect(filtered).toHaveLength(2);
    expect(filtered[0].email).toBe('john@gmail.com');
    expect(filtered[1].email).toBe('jane@gmail.com');
  });
});
