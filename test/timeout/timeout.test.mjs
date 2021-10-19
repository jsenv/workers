import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const workers = createWorkers({
  ...TEST_PARAMS,
  workerFileUrl,
  maxIdleDuration: Infinity,
  // logLevel: "debug",
})

// timeout after 1s
try {
  await workers.addJob({}, { allocatedMs: 1000 })
  throw new Error("should throw")
} catch (e) {
  const actual = e.message
  const expected = `worker timeout: worker #1 is too slow to perform job #1 (takes more than 1000 ms)`
  assert({ actual, expected })

  // the worker is busy but will be terminated and replaced by an idle worker
  // (ideally we should ensure it's not the same worker but not suprt important to test
  // we know the code is calling terminate() so there is no need to test it)
  {
    const actual = workers.inspect()
    const expected = {
      workerCount: 1,
      workerBusyCount: 0,
      workerIdleCount: 0,
      jobWaitingCount: 0,
    }
    assert({ actual, expected })
  }

  await new Promise((resolve) => setTimeout(resolve, 2000))

  {
    const actual = workers.inspect()
    const expected = {
      workerCount: 2,
      workerBusyCount: 0,
      workerIdleCount: 1,
      jobWaitingCount: 0,
    }
    assert({ actual, expected })
  }
}
