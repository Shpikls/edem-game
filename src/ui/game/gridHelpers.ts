import { modules, type ModuleId } from '../../content/modules.ts'
import {
  checkPlacement,
  type Placement,
  type Rotation,
  type Shape,
  type Tier,
} from '../../engine/index.ts'

export interface GridModule {
  uid: string
  defId: string
  label: string
  x: number
  y: number
  rotation: Rotation
  tier?: Tier
}

export interface GridPreview {
  /** Module being moved (excluded from overlap checks), if it is already on the hull. */
  uid: string | null
  defId: string
  x: number
  y: number
  rotation: Rotation
}

export const toPlacement = (m: {
  uid: string | null
  defId: string
  x: number
  y: number
  rotation: Rotation
}): Placement => ({
  id: m.uid ?? '__new__',
  shape: modules[m.defId as ModuleId].shape,
  x: m.x,
  y: m.y,
  rotation: m.rotation,
})

export function previewFits(
  hull: Shape,
  items: readonly GridModule[],
  preview: GridPreview,
): boolean {
  const others = items.filter((m) => m.uid !== preview.uid).map(toPlacement)
  return checkPlacement(hull, others, toPlacement(preview)).ok
}
