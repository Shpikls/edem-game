import { useState } from 'react'
import { BattleSandbox } from './sandbox/BattleSandbox.tsx'
import { GridSandbox } from './sandbox/GridSandbox.tsx'
import './styles.css'

const tabs = { battle: 'Бой', grid: 'Сетка' } as const
type Tab = keyof typeof tabs

export function App() {
  const [tab, setTab] = useState<Tab>('battle')
  return (
    <div className="app">
      <header className="app__header">
        <h1>Edem · песочница</h1>
        <nav>
          {(Object.keys(tabs) as Tab[]).map((t) => (
            <button
              key={t}
              className={t === tab ? 'primary' : ''}
              onClick={() => setTab(t)}
            >
              {tabs[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'battle' ? <BattleSandbox /> : <GridSandbox />}
    </div>
  )
}
