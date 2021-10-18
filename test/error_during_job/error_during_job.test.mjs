import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/worker"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
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
