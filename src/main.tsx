import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-condensed/400.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { initAnalytics } from './ui/analytics.ts'
import { App } from './ui/App.tsx'
import { initPlatform, isPaused, onPauseChange } from './ui/platform.ts'
import { initSound, setAudioPaused } from './ui/sound.ts'

// Cloud saves (Yandex Games) must be in place before the first render.
void initPlatform().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)

// Ads and platform overlays pause the game: silence it too.
onPauseChange(() => setAudioPaused(isPaused()))

// A game, not a page: no long-press menus or text selection.
window.addEventListener('contextmenu', (e) => e.preventDefault())

// Phones: never leave the page scrolled under a browser toolbar.
const resetScroll = () => window.scrollTo(0, 0)
window.addEventListener('resize', resetScroll)
window.addEventListener('orientationchange', resetScroll)
resetScroll()

initAnalytics()
initSound()
