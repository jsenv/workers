import { threadId, parentPort } from "worker_threads"

parentPort.on("message", () => {
  parentPort.postMessage(threadId)
})
