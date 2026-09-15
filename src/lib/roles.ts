import type { BuildModel } from '../engine/model'
import { SKIN_BUILD_ORDER, type Guide, type Step } from '../engine/steps'

/** How the 3D preview draws each cube. */
export const ROLE = { hidden: 0, ghost: 1, solid: 2, focus: 3 } as const

/** Which cubes to show for a step. `step` is null for the materials overview. */
export function rolesForStep(model: BuildModel, guide: Guide, step: Step | null): Uint8Array {
  const roles = new Uint8Array(model.voxels.length)
  model.voxels.forEach((v, i) => {
    if (!step) {
      roles[i] = ROLE.solid
    } else if (step.kind === 'paint') {
      const recipe = guide.recipeOf.get(v)
      roles[i] = recipe && step.recipes.includes(recipe.id) ? ROLE.focus : ROLE.ghost
    } else if (step.kind === 'assemble') {
      roles[i] = step.parts.includes(v.part) ? ROLE.focus : ROLE.solid
    } else if (model.kind === 'item') {
      roles[i] = v.y < step.layer ? ROLE.solid : v.y === step.layer ? ROLE.focus : ROLE.hidden
    } else {
      const partOrder = SKIN_BUILD_ORDER.indexOf(v.part)
      const stepOrder = SKIN_BUILD_ORDER.indexOf(step.part)
      if (partOrder < stepOrder) roles[i] = ROLE.solid
      else if (partOrder > stepOrder) roles[i] = ROLE.hidden
      else roles[i] = v.ly < step.layer ? ROLE.solid : v.ly === step.layer ? ROLE.focus : ROLE.hidden
    }
  })
  return roles
}
