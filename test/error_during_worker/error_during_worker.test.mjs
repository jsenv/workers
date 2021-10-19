import { assert } from "@jsenv/assert"

import { createWorkers } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
const exceptions = []
process.on("uncaughtException", (error) => {
  exceptions.push(error)
})
createWorkers({
  ...TEST_PARAMS,
  workerFileUrl,
  logLevel: "off",
  minWorkers: 2,
})
await new Promise((resolve) => setTimeout(resolve, 2000))

const actual = [
  {
    message: exceptions[0].message,
    name: exceptions[0].name,
  },
  {
    message: exceptions[0].message,
    name: exceptions[0].name,
  },
  ...exceptions.slice(2),
]
const expected = [
  {
    message: "HELLO",
    name: "Error",
  },
  {
    message: "HELLO",
    name: "Error",
  },
]
assert({ actual, expected })
