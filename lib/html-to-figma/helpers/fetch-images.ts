import { ImagePaintWithUrl, fetchImageBytes } from "./image";
import { LayerNode } from "../types/nodes";

/**
 * Recursively walks the layer tree, finds every `ImagePaint` fill that
 * still has a pending `url` (i.e. not yet resolved), fetches the image
 * bytes in parallel, and attaches them as `imageData: Uint8Array`.
 *
 * After this function resolves, every image fill looks like:
 * ```json
 * {
 *   "type": "IMAGE",
 *   "scaleMode": "FILL",
 *   "imageHash": null,
 *   "url": "https://...",       // kept for debugging / fallback
 *   "imageData": [0, 255, ...]   // Uint8Array — pass to figma.createImage()
 * }
 * ```
 *
 * The Figma plugin side should do:
 * ```ts
 * const hash = figma.createImage(new Uint8Array(fill.imageData)).hash;
 * fill.imageHash = hash;
 * delete fill.imageData;
 * delete fill.url;
 * ```
 */
export async function fetchImagesInLayers(
  layers: (LayerNode | FrameNode)[]
): Promise<void> {
  // Collect all (fill, url) pairs that need resolving
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

  // De-duplicate by URL so we only fetch each unique image once
  const urlToBytes = new Map<string, Uint8Array | undefined>();
  const uniqueUrls = [...new Set(pending.map((p) => p.url))];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      const bytes = await fetchImageBytes(url);
      urlToBytes.set(url, bytes);
    })
  );

  // Attach resolved bytes back to the fill objects (mutates in place)
  for (const { fill, url } of pending) {
    const bytes = urlToBytes.get(url);
    if (bytes) {
      (fill as any).imageData = bytes;
    }
  }
}
