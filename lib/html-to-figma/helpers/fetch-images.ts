import { ImagePaintWithUrl, fetchImageBytes } from "./image";
import { LayerNode } from "../types/nodes";

// Access chrome via globalThis so this file compiles in non-extension
// contexts (plugin, browser bundle) where @types/chrome is not available.
const chromeRuntime: typeof chrome | undefined = (globalThis as any).chrome;

/**
 * Fetch a single URL via the Chrome extension background service worker.
 * The background script is not subject to CORS, so it can retrieve
 * cross-origin images that a content script cannot.
 *
 * Falls back to a direct fetch() for data: URIs (SVG/base64) because
 * those don't need the background detour and the chrome runtime may not
 * be available in all execution contexts.
 */
async function fetchImageBytesViaBg(
  url: string
): Promise<Uint8Array | undefined> {
  // data: URIs are local — fetch them directly, no CORS issue
  if (url.startsWith("data:")) {
    return fetchImageBytes(url);
  }

  // If we're not inside a chrome extension content script, fall back
  if (!chromeRuntime?.runtime?.sendMessage) {
    return fetchImageBytes(url);
  }

  return new Promise((resolve) => {
    chromeRuntime.runtime.sendMessage(
      { type: "fetchImage", url },
      (response: any) => {
        if (chromeRuntime.runtime.lastError || !response || response.error) {
          console.warn(
            "[html-to-figma] background fetch failed for",
            url,
            response?.error ?? chromeRuntime.runtime.lastError
          );
          resolve(undefined);
          return;
        }
        resolve(new Uint8Array(response.bytes));
      }
    );
  });
}

/**
 * Recursively walks the layer tree, finds every ImagePaint fill with a
 * pending url, fetches the bytes via the background script (CORS-free),
 * and attaches them as imageData: Uint8Array.
 *
 * If a fetch fails the url field is removed from the fill so the plugin
 * receives a clean ImagePaint without unrecognised keys.
 */
export async function fetchImagesInLayers(
  layers: (LayerNode | FrameNode)[]
): Promise<void> {
  const pending: Array<{ fill: ImagePaintWithUrl; url: string }> = [];

  function collect(layer: any) {
    const fills: any[] = layer.fills ?? [];
    for (const fill of fills) {
      if (fill.type === "IMAGE" && fill.url && !fill.imageData) {
        pending.push({ fill, url: fill.url });
      }
    }
    const children: any[] = layer.children ?? [];
    for (const child of children) {
      collect(child);
    }
  }

  for (const layer of layers) {
    collect(layer);
  }

  if (pending.length === 0) return;

  const urlToBytes = new Map<string, Uint8Array | undefined>();
  const uniqueUrls = [...new Set(pending.map((p) => p.url))];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      const bytes = await fetchImageBytesViaBg(url);
      urlToBytes.set(url, bytes);
    })
  );

  for (const { fill, url } of pending) {
    const bytes = urlToBytes.get(url);
    if (bytes) {
      (fill as any).imageData = bytes;
    } else {
      // fetch failed — remove url so Figma validation doesn't throw on unknown keys
      delete (fill as any).url;
    }
  }
}
