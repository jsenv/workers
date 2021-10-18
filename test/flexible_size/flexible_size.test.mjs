import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const workers = createWorkers({
  workerFileUrl,
  minWorkers: 2,
  maxWorkers: 4,
  // logLevel: "debug",
})
const getWorkerCount = () => workers.inspect().workerCount

{
  const actual = getWorkerCount()
  const expected = 2
  assert({ actual, expected })
}

await new Promise((resolve) => setTimeout(resolve, 500))
{
  const actual = getWorkerCount()
  const expected = 2
  assert({ actual, expected })
}

workers.addJob()
workers.addJob()
workers.addJob()
workers.addJob()
{
  const actual = getWorkerCount()
  const expected = 4
  assert({ actual, expected })
}

await new Promise((resolve) => setTimeout(resolve, 500))
{
  const actual = getWorkerCount()
  const expected = 2
  assert({ actual, expected })
}

workers.addJob()
workers.addJob()
workers.addJob()
workers.addJob()
workers.addJob()
{
  const actual = getWorkerCount()
  const expected = 4
  assert({ actual, expected })
}
