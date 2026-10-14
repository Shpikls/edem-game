import { moduleList, modules, type ModuleId } from '../../content/modules.ts'
import type { DamageType, ModuleStats } from '../../engine/index.ts'
import { createModule, withEngineIds, type SandboxShip } from './sandboxShip.ts'

const statLabels: Record<string, string> = {
  damage: 'урон',
  cooldownMs: 'перезарядка, мс',
  capacity: 'ёмкость',
  regenAmount: 'реген',
  regenIntervalMs: 'интервал регена, мс',
  armor: 'броня',
}

interface Props {
  title: string
  ship: SandboxShip
  onChange: (ship: SandboxShip) => void
}

export function ShipEditor({ title, ship, onChange }: Props) {
  const updateStats = (uid: string, stats: ModuleStats) =>
    onChange({
      ...ship,
      modules: ship.modules.map((m) => (m.uid === uid ? { ...m, stats } : m)),
    })

  return (
    <section className="panel">
      <h2>{title}</h2>
      <label className="field">
        <span>Корпус, HP</span>
        <NumberInput
          value={ship.hullHp}
          min={1}
          onChange={(hullHp) => onChange({ ...ship, hullHp })}
        />
      </label>

      <ul className="module-list">
        {withEngineIds(ship).map((m) => (
          <li key={m.uid} className={`module module--${m.stats.kind}`}>
            <div className="module__head">
              <strong>{modules[m.defId].name}</strong>
              <code>{m.id}</code>
              <button
                className="icon-button"
                title="Убрать"
                onClick={() =>
                  onChange({
                    ...ship,
                    modules: ship.modules.filter((x) => x.uid !== m.uid),
                  })
                }
              >
                ✕
              </button>
            </div>
            <div className="module__stats">
              {m.stats.kind === 'weapon' && (
                <label className="field">
                  <span>тип</span>
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
                </label>
              )}
              {Object.entries(m.stats)
                .filter(([, v]) => typeof v === 'number')
                .map(([key, value]) => (
                  <label key={key} className="field">
                    <span>{statLabels[key] ?? key}</span>
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
                  </label>
                ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="add-row">
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
            + {def.name}
          </button>
        ))}
      </div>
    </section>
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
