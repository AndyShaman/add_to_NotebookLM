// Mock Chrome API for testing
global.chrome = {
  runtime: {
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    lastError: null,
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  },
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    },
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    reload: jest.fn().mockResolvedValue(),
    sendMessage: jest.fn().mockResolvedValue({})
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue([{ result: null }])
  },
  i18n: {
    getMessage: jest.fn((key) => key),
    getUILanguage: jest.fn(() => 'en')
  }
};

// Mock window.location for tests
const mockLocation = {
  pathname: '/',
  href: 'https://notebooklm.google.com/',
  hostname: 'notebooklm.google.com',
  search: '',
  hash: ''
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true
});

// Helper to set location pathname for tests
global.setLocationPathname = (pathname) => {
  window.location.pathname = pathname;
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  window.location.pathname = '/';
});
