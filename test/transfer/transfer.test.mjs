import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const workers = createWorkers({
  workerFileUrl,
  // logLevel: "debug",
})

// transfer array buffer
if (process.platform !== "darwin") {
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
if (process.platform !== "darwin") {
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
