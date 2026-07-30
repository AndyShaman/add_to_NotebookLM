// Compatibility bootstrap for Google's NotebookLM / Gemini Notebook domain migration.
// The existing service worker still builds URLs with notebooklm.google.com.
// Rewrite those requests to the account's current host before loading it.
(() => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const supportedHosts = new Set([
    'notebook.google.com',
    'notebook.cloud.google.com',
    'notebooklm.google.com'
  ]);
  let activeOrigin = 'https://notebook.google.com';

  function getRequestUrl(input) {
    if (typeof input === 'string' || input instanceof URL) {
      return new URL(input.toString());
    }
    if (input && typeof input.url === 'string') {
      return new URL(input.url);
    }
    return null;
  }

  function rewriteOrigin(url, origin) {
    const rewritten = new URL(url.toString());
    const target = new URL(origin);
    rewritten.protocol = target.protocol;
    rewritten.host = target.host;
    return rewritten;
  }

  globalThis.fetch = async function notebookDomainCompatibleFetch(input, init = {}) {
    const requestUrl = getRequestUrl(input);
    if (!requestUrl || !supportedHosts.has(requestUrl.hostname)) {
      return originalFetch(input, init);
    }

    const rewrittenUrl = rewriteOrigin(requestUrl, activeOrigin);
    const requestInit = { ...init, redirect: 'follow' };
    const response = await originalFetch(rewrittenUrl.toString(), requestInit);

    try {
      const finalUrl = new URL(response.url || rewrittenUrl.toString());
      if (supportedHosts.has(finalUrl.hostname)) {
        activeOrigin = finalUrl.origin;
      }
    } catch (error) {
      // Keep the last known origin if the response URL is unavailable.
    }

    return response;
  };
})();

importScripts('background.js');
