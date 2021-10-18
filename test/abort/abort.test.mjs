import "@jsenv/worker/test/abort_controller.mjs"
import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"
import { writeWorkerFileFromFunction } from "@jsenv/worker/test/test_helpers.mjs"

const workerFileUrl = new URL("./__worker__.mjs", import.meta.url)
await writeWorkerFileFromFunction(async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 500)
  })
}, workerFileUrl)

const workers = createWorkers({
  workerFileUrl,
  minWorkers: 0,
  maxWorkers: 0,
  idleTimeout: Infinity,
  // logLevel: "debug",
})

// aborting before requesting job
{
  const abortController = new AbortController()

  abortController.abort()
  try {
    await workers.addJob({}, { abortSignal: abortController.signal })
    throw new Error("should throw")
  } catch (e) {
    const actual = e.message
    const expected = `job #1 aborted before adding job`
    assert({ actual, expected })
  }
}

// aborting while job waits a worker
{
  const abortController = new AbortController()

  const jobPromise = workers.addJob({}, { abortSignal: abortController.signal })
  abortController.abort()

  try {
    await jobPromise
    throw new Error("should throw")
  } catch (e) {
    const actual = e.message
    const expected = `job #2 aborted while waiting a worker`
    assert({ actual, expected })
  }
}

// aborting while worker handles the job
{
  const abortController = new AbortController()

  const jobPromise = workers.addJob({}, { abortSignal: abortController.signal })
  workers.addWorker()
  abortController.abort()

  try {
    await jobPromise
    throw new Error("should throw")
  } catch (e) {
    const actual = e.message
    const expected = `job #3 aborted during execution by worker`
    assert({ actual, expected })
  }
}

// aborting afterwards
{
  const abortController = new AbortController()

  const jobPromise = workers.addJob({}, { abortSignal: abortController.signal })
  workers.addWorker()
  await jobPromise
  abortController.abort()
  // nothing happens
}
