import { assert } from "@jsenv/assert"

import { createWorkers, functionAsWorkerUrl } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

const workers = createWorkers(
  functionAsWorkerUrl(async () => {
    const { answer } = await import("./file.mjs")
    return answer
  }),
  { ...TEST_PARAMS },
)

try {
  await workers.addJob()
  throw new Error("should throw")
} catch (e) {
  const actual = {
    code: e.code,
    message: e.message,
    input: e.input,
  }
  const expected = {
    code: "ERR_INVALID_URL",
    message: "Invalid URL: ./file.mjs",
    input: "./file.mjs",
  }
  assert({ actual, expected })
}
