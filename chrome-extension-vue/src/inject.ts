import { htmlToFigma } from './lib/html-to-figma/index'

const layers = htmlToFigma('body', false)

const json = JSON.stringify({ layers })
const blob = new Blob([json], { type: 'application/json' })
const link = document.createElement('a')
link.href = URL.createObjectURL(blob)
link.download = 'page.figma.json'
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
