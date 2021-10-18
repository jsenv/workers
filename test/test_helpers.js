import { writeFile } from "@jsenv/filesystem"

export const writeWorkerFileFromFunction = async (fn, workerFileUrl) => {
  const workerCode = `
import { parentPort } from "node:worker_threads"

const fn = ${fn.toString()}

parentPort.on('message', async (data) => {
  const returnValue = await fn(data)
  parentPort.postMessage(returnValue)
})`
  await writeFile(workerFileUrl, workerCode)
}
