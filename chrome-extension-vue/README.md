# HTML to Figma — Vue Extension

Chrome extension to capture any web page and export it as a Figma-compatible JSON file.

Rewritten with **Vue 3 + TypeScript + Vite**, using the local `lib/` library.

## Stack

- Vue 3 (Composition API, `<script setup>`)
- TypeScript 5.x
- Vite + `@crxjs/vite-plugin`
- Manifest V3

## Setup

```bash
cd chrome-extension-vue
npm install
```

## Development

```bash
npm run dev
```

Then load `dist/` folder in Chrome via `chrome://extensions` → "Load unpacked".

## Build

```bash
npm run build
```

## How it works

1. Popup sends `{ inject: true }` message to background
2. Background injects `inject.js` into the active tab via `chrome.scripting.executeScript`
3. `inject.ts` calls `htmlToFigma('body')` from the local `lib/` copy
4. Result is serialized to JSON and downloaded as `page.figma.json`
5. User opens Figma plugin and uploads the file

## Notes

- The `lib/` folder inside this extension is a copy of the root `lib/` directory
- Do not import from external npm package — use local `lib/` only
