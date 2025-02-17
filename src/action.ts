/**
 * Wraps calling the action implementation.
 */

import { entrypoint, getActionInputs } from './index.js'

const actionInputs = await getActionInputs()

if (actionInputs) {
  /* istanbul ignore next */
  await entrypoint(actionInputs)
} else {
  console.log(`Inputs were null, and should have already error'd the action run`)
}
