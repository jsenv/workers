import { threadId, parentPort } from "worker_threads"

parentPort.on("message", async () => {
  parentPort.postMessage(threadId)
})
