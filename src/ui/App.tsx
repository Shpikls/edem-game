import { useState } from 'react'
import { BattleSandbox } from './sandbox/BattleSandbox.tsx'
import { GridSandbox } from './sandbox/GridSandbox.tsx'
import './styles.css'

const tabs = { battle: 'Бой', grid: 'Сетка корпуса' } as const
type Tab = keyof typeof tabs

export function App() {
  const [tab, setTab] = useState<Tab>('battle')
  return (
    <div className="app">
      <header className="titleblock">
        <div className="titleblock__name">EDEM</div>
        <div className="titleblock__cell">
          <span>наименование</span>
          Песочница баланса
        </div>
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
      {tab === 'battle' ? <BattleSandbox /> : <GridSandbox />}
    </div>
  )
}
