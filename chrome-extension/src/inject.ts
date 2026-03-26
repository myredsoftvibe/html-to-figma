import { htmlToFigmaSync } from "@builder.io/html-to-figma";

// Expose htmlToFigmaSync on window so background can call it
// via a second executeScript({ func }) and get the return value.
(window as any).__htmlToFigmaSync = htmlToFigmaSync;
