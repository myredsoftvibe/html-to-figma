chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let isResponseAsync = false;

  if (request.inject) {
    isResponseAsync = true;

    // Do NOT use currentWindow:true — when DevTools is open the service worker
    // is in a different window context and the query returns empty.
    chrome.tabs.query({ active: true }, async (tabs) => {
      // sender.tab is set only when message comes from a content script,
      // not from popup. Find the first non-chrome tab.
      const activeTab =
        sender.tab ??
        tabs.find((t) => t.url && !t.url.startsWith("chrome"));

      console.log("[bg] activeTab:", activeTab?.id, activeTab?.url);

      if (!activeTab?.id) {
        console.error("[bg] no active tab found");
        sendResponse({ done: false, error: "No active tab" });
        return;
      }

      const tabId = activeTab.id;

      // Step 1: inject inject.js which exposes window.__htmlToFigmaSync
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["js/inject.js"],
        });
        console.log("[bg] inject.js loaded");
      } catch (e) {
        console.error("[bg] inject.js failed:", e);
        sendResponse({ done: false, error: String(e) });
        return;
      }

      // Step 2: call __htmlToFigmaSync and return JSON
      let results: chrome.scripting.InjectionResult[];
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const fn = (window as any).__htmlToFigmaSync;
            if (!fn) return null;
            const layers = fn("body", location.hash.includes("useFrames=true"));
            return JSON.stringify({ layers });
          },
        });
        console.log("[bg] layers collected, raw length:", results?.[0]?.result?.length);
      } catch (e) {
        console.error("[bg] collect layers failed:", e);
        sendResponse({ done: false, error: String(e) });
        return;
      }

      const raw = results?.[0]?.result as string | null | undefined;
      if (!raw) {
        console.error("[bg] no layers returned from inject");
        sendResponse({ done: false, error: "no layers" });
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
      console.log("[bg] image URLs to fetch:", urlSet.size, Array.from(urlSet));

      // Step 4: fetch bytes in background (host_permissions = <all_urls>)
      const urlToBytes = new Map<string, number[]>();
      await Promise.all(
        Array.from(urlSet).map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) {
              console.warn("[bg] fetch failed:", url, res.status);
              return;
            }
            urlToBytes.set(url, Array.from(new Uint8Array(await res.arrayBuffer())));
            console.log("[bg] fetched:", url, "bytes:", urlToBytes.get(url)!.length);
          } catch (e) {
            console.warn("[bg] fetch error:", url, e);
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
      console.log("[bg] triggering download, JSON size:", json.length);
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
