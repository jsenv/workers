/*
 * This is useful to be able to execute code in a worker without having
 * to create the worker file.
 * There is an eval option in https://nodejs.org/dist/latest-v16.x/docs/api/worker_threads.html#new-workerfilename-options
 * But in that case Node.js will execute the code in CommonJS.
 * - https://github.com/nodejs/node/issues/30682
 * - node code deciding how to eval the worker https://github.com/nodejs/node/blob/49415500bb1bf51a1fade5ea2d03f3988ecabc25/lib/internal/worker.js#L144-L148
 * - code doing the "eval": https://github.com/nodejs/node/blob/82b1b551223f89dd2023d46344fa4a882babebad/lib/internal/main/worker_thread.js#L177-L182
 * - the function that would work: https://github.com/nodejs/node/blob/82b1b551223f89dd2023d46344fa4a882babebad/lib/internal/process/esm_loader.js#L65
 *
 * - CANNOT USE DYNAMIC IMPORT + RELATIVE URL
 * Because the relative url resolves against the data url
 * Ideally the relative url would be resolved to a file url that would be
 * the file calling "functionAsWorkerUrl" by default (can be retrived using error stack trace)
 * To do that we need to find a strategy inside the code stringifed
 * Maybe using new VM to evaluate the fn.toString + giving to that vm an url
 */

import { stringifyDataUrl } from "@jsenv/workers/src/internal/base64_url.js"

export const functionAsWorkerUrl = (fn) => {
  const code = `import { parentPort } from "worker_threads"

const doWork = ${fn.toString()}

parentPort.on('message', async (args) => {
  const res = await doWork(args)
  parentPort.postMessage(res)
})`

  const codeAsDataUrl = stringifyDataUrl({
    data: code,
    //  base64Flag: true,
    mediaType: "text/javascript",
  })
  const codeAsUrlObject = new URL(codeAsDataUrl)
  return codeAsUrlObject
}
