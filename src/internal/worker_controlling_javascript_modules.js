import { workerData, parentPort } from "node:worker_threads"

const { urls } = workerData

// "preload" urls
urls.forEach((url) => {
  // eslint-disable-next-line no-undef
  import(url)
})

parentPort.on("message", async ({ url, exportName, args }) => {
  const namespace = await import(url)
  const method = namespace[exportName]
  const returnValue = await method(...args)
  parentPort.postMessage(returnValue)
})
