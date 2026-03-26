import { ImagePaintWithUrl, fetchImageBytes } from "./image";
import { LayerNode } from "../types/nodes";

// Access chrome runtime via globalThis typed as any so this file compiles
// in non-extension contexts (plugin, browser bundle) where @types/chrome
// is not available. At runtime this is undefined outside a chrome extension.
const chromeRuntime: any = (globalThis as any).chrome;

async function fetchImageBytesViaBg(
  url: string
): Promise<Uint8Array | undefined> {
  if (url.startsWith("data:")) {
    return fetchImageBytes(url);
  }

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
      delete (fill as any).url;
    }
  }
}
