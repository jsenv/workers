/*
 * The goal here is to write something similar to what is done inside @jsenv/core
 * and perform the babel with the same concepts without workers
 * - Needs to load babel.config.cjs once
 * - And "copy/paste" a subset of "jsenvTransform"
 * - Then call that function under high pressure and measure perfs
 *
 * Once this is ready we write a version using workers and compare the metrics
 */

import {
  measurePerformanceMultipleTimes,
  computeMetricsMedian,
  logPerformanceMetrics,
} from "@jsenv/performance-impact"

import { createWorkers } from "@jsenv/workers"
import {
  setupTransformCalls,
  loadBabelPluginMapFromFile,
} from "./babel_transform_utils.mjs"

const measureBabelTransformOnWorkerThreads = async ({
  iterations = 5,
} = {}) => {
  const metrics = await measurePerformanceMultipleTimes(
    async () => {
      const projectDirectoryUrl = new URL("./", import.meta.url)
      const transformCalls = await setupTransformCalls()
      // we know babel plugin map before hand
      // in the worker approach we'll need pass only the names
      // and require them in the worker
      const babelPluginMap = await loadBabelPluginMapFromFile({
        projectDirectoryUrl,
      })
      const babelPluginConfig = {}
      Object.keys(babelPluginMap).forEach((key) => {
        babelPluginConfig[key] = babelPluginMap[key].options
      })
      transformCalls.forEach((call) => {
        call.babelPluginConfig = babelPluginConfig
      })
      const workerCount = 1
      const workers = createWorkers({
        workerFileUrl: new URL("./transform_worker.mjs", import.meta.url),
        minWorkers: workerCount,
        maxWorkers: workerCount,
      })
      await new Promise((resolve) => setTimeout(resolve, 500))

      const startMs = Date.now()
      await Promise.all(
        transformCalls.map(async (call) => {
          await workers.addJob(call)
        }),
      )
      const endMs = Date.now()
      const msEllapsed = endMs - startMs

      return {
        [`time to transform ${transformCalls.length} files using ${workerCount} workers`]:
          {
            value: msEllapsed,
            unit: "ms",
          },
      }
    },
    iterations,
    { msToWaitBetweenEachMeasure: 500 },
  )
  return computeMetricsMedian(metrics)
}

const executeAndLog = process.argv.includes("--local") || true
if (executeAndLog) {
  const performanceMetrics = await measureBabelTransformOnWorkerThreads({
    iterations: 1,
  })
  logPerformanceMetrics(performanceMetrics)
}
