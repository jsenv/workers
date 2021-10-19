# jsenv workers [![npm package](https://img.shields.io/npm/v/@jsenv/workers.svg?logo=npm&label=package)](https://www.npmjs.com/package/@jsenv/workers) [![github main](https://github.com/jsenv/workers/workflows/main/badge.svg)](https://github.com/jsenv/workers/actions?workflow=main) [![codecov coverage](https://codecov.io/gh/jsenv/workers/branch/main/graph/badge.svg)](https://codecov.io/gh/jsenv/workers)

Split CPU intensive code into worker threads.

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
import { createWorkers } from "@jsenv/workers"

const workers = createWorkers({
  workerFileUrl: new URL("./worker.mjs"),
})

const value = await workers.addJob({ a: 1, b: 1 })
console.log(value) // 2
```

## Static pool

By default the pool size is dynamic but it can be fixed to X workers.

```js
import { createWorkers } from "@jsenv/workers"

const workers = createWorkers({
  workerFileUrl: new URL("./worker.mjs"),
  minWorkers: 10,
  maxWorkers: 10,
})
```
