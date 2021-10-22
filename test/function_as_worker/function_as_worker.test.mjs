import { assert } from "@jsenv/assert"

import { createWorkers, functionAsWorkerUrl } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workers = createWorkers(
  functionAsWorkerUrl(async (input) => {
    const output = await Promise.resolve(input + 1)
    return output
  }),
  { ...TEST_PARAMS },
)

const results = await Promise.all([
  workers.addJob(1),
  workers.addJob(2),
  workers.addJob(3),
])

const actual = results
const expected = [2, 3, 4]
assert({ actual, expected })
