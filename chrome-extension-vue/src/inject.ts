import { htmlToFigma } from './lib/html-to-figma/index'

// Expose sync function on window so background can call it via executeScript(func)
;(window as any).__htmlToFigmaSync = function () {
  const layers = htmlToFigma('body', false)
  return JSON.stringify({ layers })
}
