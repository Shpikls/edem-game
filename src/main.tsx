import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-condensed/400.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { initAnalytics } from './ui/analytics.ts'
import { App } from './ui/App.tsx'
import { initSound } from './ui/sound.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Phones: never leave the page scrolled under a browser toolbar.
const resetScroll = () => window.scrollTo(0, 0)
window.addEventListener('resize', resetScroll)
window.addEventListener('orientationchange', resetScroll)
resetScroll()

initAnalytics()
initSound()
