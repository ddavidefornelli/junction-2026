import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// On a phone the keyboard covers the bottom of the page without resizing it
// (iOS always, Android in some browsers). Keep two CSS variables current so
// the sheets and Walter's bar (index.css) can stay above it:
//   --vvh  the height of what is actually visible
//   --kb   how much of the bottom the keyboard covers
const viewport = window.visualViewport
if (viewport) {
  const root = document.documentElement
  const sync = () => {
    if (viewport.scale > 1.01) return // pinch-zoomed: not the keyboard
    root.style.setProperty('--vvh', `${viewport.height}px`)
    root.style.setProperty('--kb', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`)
  }
  viewport.addEventListener('resize', sync)
  viewport.addEventListener('scroll', sync)
  sync()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
