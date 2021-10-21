import { assert } from "@jsenv/assert"
import { createWorkersForJavaScriptModules } from "@jsenv/workers"

const { methodHooks, workers } = createWorkersForJavaScriptModules(
  {
    add: `${new URL("./module.mjs", import.meta.url)}#add`,
  },
  { logLevel: "debug" },
)

const actual = await methodHooks.add(1, 2)
const expected = 3
assert({ actual, expected })

console.log(workers.inspect())
