import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const workers = createWorkers({
  ...TEST_PARAMS,
  workerFileUrl,
  // minWorkers: 1,
  // logLevel: "debug",
})

// transfer array buffer
const arrayBuffer = new ArrayBuffer(40)
await workers.addJob(
  { arrayBuffer },
  {
    transferList: [arrayBuffer],
  },
)
const actual = arrayBuffer.byteLength
const expected = 0
assert({ actual, expected })

// cannot transfer functions
const fn = () => {}

try {
  await workers.addJob({ fn })
  throw new Error("should throw")
} catch (e) {
  const actual = e.message
  const expected = `() => {} could not be cloned.`
  assert({ actual, expected })
}
