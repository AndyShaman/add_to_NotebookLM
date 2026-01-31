module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  moduleFileExtensions: ['js'],
  collectCoverageFrom: [
    'background.js',
    'popup/popup.js',
    'content/notebooklm.js',
    'lib/*.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/'
  ]
};
