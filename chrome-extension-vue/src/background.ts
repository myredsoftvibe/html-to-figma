chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.inject) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ done: false, error: 'No active tab' })
        return
      }
      const tabId = tab.id

      // Step 1: inject inject.js to put __htmlToFigmaSync on window
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['inject.js'],
      })

      // Step 2: call __htmlToFigmaSync() via func variant — returns serialized JSON string
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window as any).__htmlToFigmaSync(),
      })
      const jsonStr: string = results[0]?.result
      if (!jsonStr) {
        sendResponse({ done: false, error: 'No JSON from page' })
        return
      }
      const data = JSON.parse(jsonStr) as { layers: any[] }

      // Step 3: collect all fills with url across all layers
      const urlFills: Array<{ fill: any }> = []
      function collectUrlFills(layers: any[]) {
        for (const layer of layers) {
          if (Array.isArray(layer.fills)) {
            for (const fill of layer.fills) {
              if (fill?.url) {
                urlFills.push({ fill })
              }
            }
          }
          if (Array.isArray(layer.children)) {
            collectUrlFills(layer.children)
          }
        }
      }
      collectUrlFills(data.layers)

      // Step 4: fetch bytes for each url in background (no CORS restrictions)
      await Promise.all(
        urlFills.map(async ({ fill }) => {
          try {
            const resp = await fetch(fill.url)
            const buffer = await resp.arrayBuffer()
            fill.imageData = Array.from(new Uint8Array(buffer))
          } catch (e) {
            console.warn('[html-to-figma] Could not fetch image', fill.url, e)
          }
        })
      )

      // Step 5: download the final JSON with embedded imageData via executeScript(func)
      const finalJson = JSON.stringify(data)
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (json: string) => {
          const blob = new Blob([json], { type: 'application/json' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = 'page.figma.json'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        },
        args: [finalJson],
      })

      sendResponse({ done: true })
    })
    return true // keep message channel open for async response
  }
})
