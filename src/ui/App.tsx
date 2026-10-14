import { useState } from 'react'
import { Game } from './game/Game.tsx'
import { BattleSandbox } from './sandbox/BattleSandbox.tsx'
import './styles.css'

const tabs = { game: 'Забег', sandbox: 'Песочница боя' } as const
type Tab = keyof typeof tabs

export function App() {
  const [tab, setTab] = useState<Tab>('game')
  return (
    <div className="app">
      <header className="titleblock">
        <div className="titleblock__name">EDEM</div>
        <nav className="titleblock__tabs">
          {(Object.keys(tabs) as Tab[]).map((t, i) => (
            <button
              key={t}
              className={t === tab ? 'is-active' : ''}
              onClick={() => setTab(t)}
            >
              <span>лист {i + 1}</span>
              {tabs[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'game' ? <Game /> : <BattleSandbox />}
    </div>
  )
}
