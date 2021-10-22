import { createWorkers, functionAsWorkerUrl } from "../../../main.js"
import * as TEST_PARAMS from "../../TEST_PARAMS.mjs"

const workers = createWorkers(
  functionAsWorkerUrl(async () => {
    // eslint-disable-next-line import/no-unresolved
    const { answer } = await import("foo")
    return answer
  }),
  { ...TEST_PARAMS },
)

try {
  await workers.addJob()
  throw new Error("should throw")
} catch (e) {
  const actual = e.message
  const expected = "Invalid URL: foo"
  if (actual !== expected) {
    throw new Error(`Unexpected error message
--- actual ---
${actual}
--- expected ---
${expected}`)
  }
}
