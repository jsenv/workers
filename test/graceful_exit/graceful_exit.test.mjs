import { createWorkers } from "@jsenv/workers"
import * as TEST_PARAMS from "@jsenv/workers/test/TEST_PARAMS.mjs"

// const { createRequire } = await import("node:module")
// const require = createRequire(import.meta.url)
// const why = require("why-is-node-running")

const workerFileUrl = new URL("./worker.mjs", import.meta.url)
createWorkers({
  ...TEST_PARAMS,
  workerFileUrl,
  minWorkers: 1,
  // logLevel: "debug",
  handleSIGINT: false,
  maxIdleDuration: Infinity,
})

// setTimeout(() => {
//   why()
// }, 1000)
