import { Game } from './game/Game.tsx'
import './styles.css'

export function App() {
  return (
    <div className="app">
      <header className="titleblock">
        <div className="titleblock__name">EDEM</div>
      </header>
      <Game />
    </div>
  )
}
