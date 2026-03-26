chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let isResponseAsync = false;

  if (request.inject) {
    isResponseAsync = true;
    chrome.tabs.query({ currentWindow: true, active: true }, tabs => {
      const activeTab = sender.tab || tabs[0];
      if (activeTab && activeTab.id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: activeTab.id },
            files: ["js/inject.js"]
          },
          (args: chrome.scripting.InjectionResult[]) => {
            sendResponse({ done: true, args });
          }
        );
      }
    });
  }

  /**
   * Fetch an image URL and return the bytes as a plain Array.
   * This runs in the background service worker which is NOT subject to
   * CORS, so it can fetch cross-origin images that content scripts cannot.
   */
  if (request.type === "fetchImage") {
    isResponseAsync = true;
    fetch(request.url)
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ error: `HTTP ${res.status}` });
          return;
        }
        const buffer = await res.arrayBuffer();
        // ArrayBuffer cannot be sent directly via postMessage between
        // extension contexts, so convert to a plain number array.
        sendResponse({ bytes: Array.from(new Uint8Array(buffer)) });
      })
      .catch((err) => {
        sendResponse({ error: String(err) });
      });
  }

  return isResponseAsync;
});
