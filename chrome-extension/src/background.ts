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
            sendResponse({ done: true, args});
          }
        );
      }
    });
  }

  return isResponseAsync;
});
