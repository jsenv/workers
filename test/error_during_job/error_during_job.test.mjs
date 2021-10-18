import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"
import { writeWorkerFileFromFunction } from "@jsenv/worker/test/test_helpers.mjs"

const workerFileUrl = new URL("./__worker__.mjs", import.meta.url)
await writeWorkerFileFromFunction(async () => {
  throw new Error("HELLO")
}, workerFileUrl)

const workers = createWorkers({
  workerFileUrl,
  logLevel: "off",
})

// rejects when worker throws during ajob

try {
  await workers.addJob()
  throw new Error("should throw")
} catch (e) {
  const actual = {
    typeOfError: typeof e,
    name: e.name,
    message: "HELLO",
  }
  const expected = {
    typeOfError: "object",
    name: "Error",
    message: "HELLO",
  }
  assert({ actual, expected })
}
