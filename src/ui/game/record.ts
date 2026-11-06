import { load, save } from '../storage.ts'

const RECORD_KEY = 'record.v1'

/** Best wins in one run (local storage, synced to the VK cloud save). */
export function readRecord(): number {
  try {
    return Number(load(RECORD_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

export function saveRecord(wins: number): void {
  save(RECORD_KEY, String(wins))
}

/** "1 победа", "3 победы", "5 побед". */
export function winsWord(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'победа'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'победы'
  return 'побед'
}
