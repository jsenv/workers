import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const workers = createWorkers({
  ...TEST_PARAMS,
  workerFileUrl,
  maxIdleDuration: 500,
  minWorkers: 1,
  maxWorkers: 2,
  // logLevel: "debug",
  // keepProcessAlive: true,
})
// 1 idle worker
{
  const actual = workers.inspect()
  const expected = {
    workerCount: 1,
    workerBusyCount: 0,
    workerIdleCount: 1,
    jobWaitingCount: 0,
  }
  assert({ actual, expected })
}

const firstJobs = [workers.addJob(), workers.addJob()]
// after adding 2 jobs, 2 busy workers
{
  const actual = workers.inspect()
  const expected = {
    workerCount: 2,
    workerBusyCount: 2,
    workerIdleCount: 0,
    jobWaitingCount: 0,
  }
  assert({ actual, expected })
}

const earlyThreadIds = await Promise.all(firstJobs)
assert({
  actual: workers.inspect(),
  expected: {
    workerCount: 2,
    workerBusyCount: 0,
    workerIdleCount: 2,
    jobWaitingCount: 0,
  },
})

await new Promise((resolve) => setTimeout(resolve, 2000))
const actual = workers.inspect()
const expected = {
  workerCount: 1,
  workerBusyCount: 0,
  workerIdleCount: 1,
  jobWaitingCount: 0,
}
assert({ actual, expected })

const secondJobs = [workers.addJob(), workers.addJob()]
assert({
  actual: workers.inspect(),
  expected: {
    workerCount: 2,
    workerBusyCount: 2,
    workerIdleCount: 0,
    jobWaitingCount: 0,
  },
})
const lateThreadIds = await Promise.all(secondJobs)

assert({
  actual: {
    earlyThreadIdsLength: earlyThreadIds.length,
    lateThreadIdsLength: lateThreadIds.length,
    uniqueThreadIdsLength: new Set([...earlyThreadIds, ...lateThreadIds]).size,
  },
  expected: {
    earlyThreadIdsLength: 2,
    lateThreadIdsLength: 2,
    uniqueThreadIdsLength: 4,
  },
})
