import { ImagePaintWithUrl, fetchImageBytes } from "./image";
import { LayerNode } from "../types/nodes";

/**
 * Recursively walks the layer tree, finds every `ImagePaint` fill that
 * still has a pending `url` (i.e. not yet resolved), fetches the image
 * bytes in parallel, and attaches them as `imageData: Uint8Array`.
 *
 * If a fetch fails (CORS, 404, network error) the `url` field is removed
 * from the fill so the plugin receives a clean ImagePaint without unknown
 * keys (which would cause Figma validation to throw).
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
      const bytes = await fetchImageBytes(url);
      urlToBytes.set(url, bytes);
    })
  );

  for (const { fill, url } of pending) {
    const bytes = urlToBytes.get(url);
    if (bytes) {
      (fill as any).imageData = bytes;
      // keep url only if we have bytes (plugin will clean it up after createImage)
    } else {
      // fetch failed (CORS, 404, etc.) — remove url so Figma validation doesn't throw
      delete (fill as any).url;
    }
  }
}
