
import { parentPort } from "node:worker_threads"

const fn = async () => {
  throw new Error("HELLO")
}

parentPort.on('message', async (data) => {
  const returnValue = await fn(data)
  parentPort.postMessage(returnValue)
})