import { parentPort } from "node:worker_threads"

const fn = async () => {
  return undefined
}

parentPort.on("message", async (data) => {
  const returnValue = await fn(data)
  parentPort.postMessage(returnValue)
})
