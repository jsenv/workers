// https://medium.com/@Trott/using-worker-threads-in-node-js-80494136dbb6

import {
  measurePerformanceMultipleTimes,
  computeMetricsMedian,
  logPerformanceMetrics,
} from "@jsenv/performance-impact"
import { createWorkers } from "@jsenv/workers"

const measurePrimbeNumbersOnWorkerThreads = async ({ iterations = 5 } = {}) => {
  const metrics = await measurePerformanceMultipleTimes(
    async () => {
      const startMs = Date.now()

      const workerCount = 2
      const workers = createWorkers({
        workerFileUrl: new URL("./primes_worker.mjs", import.meta.url),
      })
      const min = 2
      const max = 1e7
      const range = Math.ceil((max - min) / workerCount)
      let start = min

      const primes = []
      await Promise.all(
        new Array(workerCount).fill("").map(async () => {
          const workerStart = start
          start += range
          const primesFromWorker = await workers.addJob({
            start: workerStart,
            range,
          })
          primes.concat(primesFromWorker)
        }),
      )

      const endMs = Date.now()
      const msEllapsed = endMs - startMs

      return {
        [`time generate 10,000,000 prime numbers on ${workerCount} workers`]: {
          value: msEllapsed,
          unit: "ms",
        },
      }
    },
    iterations,
    { msToWaitBetweenEachMeasure: 100 },
  )
  return computeMetricsMedian(metrics)
}

const executeAndLog = process.argv.includes("--local")
if (executeAndLog) {
  const performanceMetrics = await measurePrimbeNumbersOnWorkerThreads({
    iterations: 1,
  })
  logPerformanceMetrics(performanceMetrics)
}
