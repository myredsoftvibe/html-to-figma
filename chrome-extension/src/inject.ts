import { htmlToFigmaSync } from "@builder.io/html-to-figma";

// inject.ts runs via executeScript — chrome.runtime is NOT available here.
// We only collect layers (with url fields) synchronously and return them.
// The background script will fetch image bytes and embed them before saving.
(async () => {
  const layers = htmlToFigmaSync(
    "body",
    location.hash.includes("useFrames=true")
  );
  // Return layers to background via executeScript result
  return JSON.stringify({ layers });
})();
