import { assert } from "@jsenv/assert"
import { createWorkersForJavaScriptModules } from "@jsenv/workers"

const { methodHooks } = createWorkersForJavaScriptModules({
  add: `${new URL("./module.mjs", import.meta.url)}#add`,
})

const actual = await methodHooks.add(1, 2)
const expected = 3
assert({ actual, expected })
