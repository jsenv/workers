import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"
import { writeWorkerFileFromFunction } from "@jsenv/worker/test/test_helpers.mjs"

const workerFileUrl = new URL("./__worker__.mjs", import.meta.url)
await writeWorkerFileFromFunction(async () => {
  return undefined
}, workerFileUrl)

const workers = createWorkers({
  workerFileUrl,
  // logLevel: "debug",
})

// transfer array buffer
{
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
}

// cannot transfer functions
{
  const fn = () => {}

  try {
    await workers.addJob({ fn })
    throw new Error("should throw")
  } catch (e) {
    const actual = e.message
    const expected = `() => {} could not be cloned.`
    assert({ actual, expected })
  }
}
