import { assert } from "@jsenv/assert"
import { createWorkersForJavaScriptModules } from "@jsenv/workers"

const workers = createWorkersForJavaScriptModules({
  add: `${new URL("./module.mjs", import.meta.url)}#add`,
})

const actual = await workers.add(1, 2)
const expected = 3
assert({ actual, expected })
