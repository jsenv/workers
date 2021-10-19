// https://medium.com/@Trott/using-worker-threads-in-node-js-80494136dbb6

import {
  measurePerformanceMultipleTimes,
  computeMetricsMedian,
  logPerformanceMetrics,
} from "@jsenv/performance-impact"
import { generatePrimes } from "./generate_primes.mjs"

const measurePrimbeNumbersOnMainThread = async ({ iterations = 5 } = {}) => {
  const metrics = await measurePerformanceMultipleTimes(
    async () => {
      const startMs = Date.now()

      generatePrimes(2, 1e7)

      const endMs = Date.now()
      const msEllapsed = endMs - startMs

      return {
        [`time generate 10,000,000 prime numbers on main thread`]: {
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
  const performanceMetrics = await measurePrimbeNumbersOnMainThread({
    iterations: 1,
  })
  logPerformanceMetrics(performanceMetrics)
}
