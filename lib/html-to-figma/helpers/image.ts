/**
 * `ImagePaintWithUrl` is an intermediate type used during DOM parsing.
 * The `url` field holds the raw image URL collected from the element.
 * It is NOT part of the final Figma JSON — after parsing the caller must
 * resolve the URL to actual bytes via `fetchImagesInLayers` so the plugin
 * can call `figma.createImage(imageData)` and get a real `imageHash`.
 */
export interface ImagePaintWithUrl extends ImagePaint {
  /** Raw URL collected from the DOM element. Resolved to `imageData` later. */
  url: string;
  /**
   * Resolved image bytes. Populated by `fetchImagesInLayers`.
   * The Figma plugin receives this and calls `figma.createImage(imageData)`.
   */
  imageData?: Uint8Array;
}

export const getImagePaintWithUrl = ({
  computedStyle,
  el,
}: {
  computedStyle: CSSStyleDeclaration;
  el: Element;
}): ImagePaintWithUrl | undefined => {
  if (el instanceof SVGSVGElement) {
    const url = `data:image/svg+xml,${encodeURIComponent(
      el.outerHTML.replace(/\s+/g, " ")
    )}`;
    return {
      url,
      type: "IMAGE",
      scaleMode: "FILL",
      imageHash: null,
    };
  } else {
    const baseImagePaint: ImagePaint = {
      type: "IMAGE",
      scaleMode: computedStyle.objectFit === "contain" ? "FIT" : "FILL",
      imageHash: null,
    };

    if (el instanceof HTMLImageElement) {
      const url = el.currentSrc;
      if (url) {
        return { url, ...baseImagePaint };
      }
    } else if (el instanceof HTMLVideoElement) {
      const url = el.poster;
      if (url) {
        return { url, ...baseImagePaint };
      }
    }
  }

  if (
    computedStyle.backgroundImage &&
    computedStyle.backgroundImage !== "none"
  ) {
    const urlMatch = computedStyle.backgroundImage.match(
      /url\(['"]?(.*?)['"]?\)/
    );
    const url = urlMatch?.[1];
    if (url) {
      return {
        url,
        type: "IMAGE",
        scaleMode: computedStyle.backgroundSize === "contain" ? "FIT" : "FILL",
        imageHash: null,
      };
    }
  }

  return undefined;
};

/**
 * Fetches a single image URL and returns its raw bytes as Uint8Array.
 * Returns `undefined` if the fetch fails (network error, CORS, etc.).
 */
export async function fetchImageBytes(
  url: string
): Promise<Uint8Array | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return undefined;
  }
}
