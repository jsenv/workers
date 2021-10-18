import { parentPort } from "node:worker_threads"

const fn = async () => {
  await new Promise(() => {})
}

parentPort.on("message", async (data) => {
  const returnValue = await fn(data)
  parentPort.postMessage(returnValue)
})
