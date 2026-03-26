chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let isResponseAsync = false;

  if (request.inject) {
    isResponseAsync = true;
    chrome.tabs.query({ currentWindow: true, active: true }, async (tabs) => {
      const activeTab = sender.tab || tabs[0];
      if (!activeTab?.id) {
        sendResponse({ done: false, error: "No active tab" });
        return;
      }

      // Step 1: run inject.js in the tab, get back layers JSON
      let results: chrome.scripting.InjectionResult[];
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ["js/inject.js"],
        });
      } catch (e) {
        sendResponse({ done: false, error: String(e) });
        return;
      }

      const raw = results?.[0]?.result as string | undefined;
      if (!raw) {
        sendResponse({ done: true }); // nothing to do
        return;
      }

      let parsed: { layers: any[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendResponse({ done: false, error: "JSON parse failed" });
        return;
      }

      // Step 2: collect all unique image URLs from the layer tree
      const urlSet = new Set<string>();
      function collectUrls(layer: any) {
        for (const fill of layer.fills ?? []) {
          if (fill.type === "IMAGE" && fill.url && !fill.imageData) {
            if (!fill.url.startsWith("data:")) urlSet.add(fill.url);
          }
        }
        for (const child of layer.children ?? []) collectUrls(child);
      }
      for (const layer of parsed.layers) collectUrls(layer);

      // Step 3: fetch each URL here in the background (no CORS, host_permissions)
      const urlToBytes = new Map<string, number[]>();
      await Promise.all(
        Array.from(urlSet).map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return;
            const buf = await res.arrayBuffer();
            urlToBytes.set(url, Array.from(new Uint8Array(buf)));
          } catch {
            // skip
          }
        })
      );

      // Step 4: embed bytes into fills
      function embedBytes(layer: any) {
        for (const fill of layer.fills ?? []) {
          if (fill.type === "IMAGE" && fill.url) {
            const bytes = urlToBytes.get(fill.url);
            if (bytes) fill.imageData = bytes;
          }
        }
        for (const child of layer.children ?? []) embedBytes(child);
      }
      for (const layer of parsed.layers) embedBytes(layer);

      // Step 5: trigger download in the tab
      const json = JSON.stringify(parsed);
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (jsonStr: string) => {
          const blob = new Blob([jsonStr], { type: "application/json" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "page.figma.json";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        },
        args: [json],
      });

      sendResponse({ done: true });
    });
  }

  return isResponseAsync;
});
