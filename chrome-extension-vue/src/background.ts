chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.inject) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ['inject.js'],
          },
          () => {
            sendResponse({ done: true })
          }
        )
      }
    })
    return true // async response
  }
})
