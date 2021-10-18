# jsenv worker [![npm package](https://img.shields.io/npm/v/@jsenv/worker.svg?logo=npm&label=package)](https://www.npmjs.com/package/@jsenv/worker) [![github main](https://github.com/jsenv/worker/workflows/main/badge.svg)](https://github.com/jsenv/worker/actions?workflow=main) [![codecov coverage](https://codecov.io/gh/jsenv/worker/branch/main/graph/badge.svg)](https://codecov.io/gh/jsenv/worker)

Helps to split CPU intensive code into worker threads.

## Example

_worker.mjs:_

```js
import { parentPort } from "node:worker_threads"

parentPort.on("message", async ({ a, b }) => {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const returnValue = a + b
  parentPort.postMessage(returnValue)
})
```

_main.mjs:_

```js
import { createWorkers } from "@jsenv/worker"

const workers = createWorkers({
  workerFileUrl: new URL("./worker.mjs", import.meta.url),
})

const value = await workers.addJob({ a: 1, b: 1 })
console.log(value) // 2
```

## Static pool

By default the pool size is dynamic but it can be fixed to X workers.

```js
import { createWorkers } from "@jsenv/worker"

const workers = createWorkers({
  workerFileUrl: new URL("./worker.mjs"),
  minWorkers: 10,
  maxWorkers: 10,
})
```
