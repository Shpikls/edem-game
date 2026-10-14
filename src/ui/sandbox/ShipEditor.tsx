import type { ReactNode } from 'react'
import { moduleList, modules, type ModuleId } from '../../content/modules.ts'
import type { DamageType, ModuleStats } from '../../engine/index.ts'
import {
  createModule,
  drawingLabel,
  withEngineIds,
  type SandboxShip,
} from './sandboxShip.ts'
import { Sheet } from './Sheet.tsx'

const statLabels: Record<string, string> = {
  damage: 'урон',
  cooldownMs: 'перезарядка, мс',
  capacity: 'ёмкость',
  regenAmount: 'реген',
  regenIntervalMs: 'интервал регена, мс',
  armor: 'броня',
}

const kindLabels: Record<ModuleStats['kind'], string> = {
  weapon: 'вооружение',
  shield: 'защита',
  armor: 'защита',
}

interface Props {
  num: string
  title: string
  side: 'player' | 'enemy'
  ship: SandboxShip
  onChange: (ship: SandboxShip) => void
}

export function ShipEditor({ num, title, side, ship, onChange }: Props) {
  const updateStats = (uid: string, stats: ModuleStats) =>
    onChange({
      ...ship,
      modules: ship.modules.map((m) => (m.uid === uid ? { ...m, stats } : m)),
    })

  return (
    <Sheet num={num} title={title} className={`side--${side}`}>
      <Spec name="корпус, HP">
        <NumberInput
          value={ship.hullHp}
          min={1}
          onChange={(hullHp) => onChange({ ...ship, hullHp })}
        />
      </Spec>

      <ol className="parts">
        {withEngineIds(ship).map((m) => (
          <li key={m.uid} className="part">
            <div className="part__head">
              <span className="part__code">{drawingLabel(m.id)}</span>
              <span className="part__name">{modules[m.defId].name}</span>
              <span className="part__kind">{kindLabels[m.stats.kind]}</span>
              <button
                className="link-button"
                onClick={() =>
                  onChange({
                    ...ship,
                    modules: ship.modules.filter((x) => x.uid !== m.uid),
                  })
                }
              >
                снять
              </button>
            </div>
            {m.stats.kind === 'weapon' && (
              <Spec name="тип урона">
                <select
                  value={m.stats.damageType}
                  onChange={(e) =>
                    updateStats(m.uid, {
                      ...m.stats,
                      damageType: e.target.value as DamageType,
                    } as ModuleStats)
                  }
                >
                  <option value="energy">энергия</option>
                  <option value="kinetic">кинетика</option>
                </select>
              </Spec>
            )}
            {Object.entries(m.stats)
              .filter(([, v]) => typeof v === 'number')
              .map(([key, value]) => (
                <Spec key={key} name={statLabels[key] ?? key}>
                  <NumberInput
                    value={value as number}
                    min={key.endsWith('Ms') ? 1 : 0}
                    onChange={(v) =>
                      updateStats(m.uid, {
                        ...m.stats,
                        [key]: v,
                      } as ModuleStats)
                    }
                  />
                </Spec>
              ))}
          </li>
        ))}
      </ol>

      <div className="add-row">
        <span className="add-row__label">добавить:</span>
        {moduleList.map((def) => (
          <button
            key={def.id}
            onClick={() =>
              onChange({
                ...ship,
                modules: [...ship.modules, createModule(def.id as ModuleId)],
              })
            }
          >
            {def.name}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** "name ........ [value]" row, like a spec line on a drawing. */
export function Spec({
  name,
  children,
}: {
  name: string
  children: ReactNode
}) {
  return (
    <label className="spec">
      <span className="spec__name">{name}</span>
      <span className="spec__leader" />
      {children}
    </label>
  )
}

function NumberInput({
  value,
  min,
  onChange,
}: {
  value: number
  min: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(Math.max(min, Math.round(v)))
      }}
    />
  )
}
