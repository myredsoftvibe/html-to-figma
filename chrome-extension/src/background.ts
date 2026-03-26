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

      const tabId = activeTab.id;

      // Step 1: inject the html-to-figma lib as a file (no return value needed)
      // then run a second script as func to collect layers and return JSON.
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["js/inject.js"],
        });
      } catch (e) {
        sendResponse({ done: false, error: String(e) });
        return;
      }

      // Step 2: call the already-injected htmlToFigmaSync via func and get result
      let results: chrome.scripting.InjectionResult[];
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            // @ts-ignore — htmlToFigmaSync was injected by inject.js
            const layers = (window as any).__htmlToFigmaSync(
              "body",
              location.hash.includes("useFrames=true")
            );
            return JSON.stringify({ layers });
          },
        });
      } catch (e) {
        sendResponse({ done: false, error: String(e) });
        return;
      }

      const raw = results?.[0]?.result as string | undefined;
      if (!raw) {
        sendResponse({ done: true });
        return;
      }

      let parsed: { layers: any[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendResponse({ done: false, error: "JSON parse failed" });
        return;
      }

      // Step 3: collect all unique external image URLs
      const urlSet = new Set<string>();
      function collectUrls(layer: any) {
        for (const fill of layer.fills ?? []) {
          if (fill.type === "IMAGE" && fill.url && !fill.url.startsWith("data:")) {
            urlSet.add(fill.url);
          }
        }
        for (const child of layer.children ?? []) collectUrls(child);
      }
      for (const layer of parsed.layers) collectUrls(layer);

      // Step 4: fetch bytes in background (no CORS, host_permissions = <all_urls>)
      const urlToBytes = new Map<string, number[]>();
      await Promise.all(
        Array.from(urlSet).map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return;
            urlToBytes.set(url, Array.from(new Uint8Array(await res.arrayBuffer())));
          } catch {
            // skip failed images
          }
        })
      );

      // Step 5: embed bytes into fills
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

      // Step 6: trigger download in tab
      const json = JSON.stringify(parsed);
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (jsonStr: string) => {
          const blob = new Blob([jsonStr], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "page.figma.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        },
        args: [json],
      });

      sendResponse({ done: true });
    });
  }

  return isResponseAsync;
});
