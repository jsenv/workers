import { parentPort } from "node:worker_threads"

parentPort.on("message", async () => {
  parentPort.postMessage(null)
})
