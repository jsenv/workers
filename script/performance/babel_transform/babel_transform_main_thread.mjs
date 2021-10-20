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
import { writeFile, resolveUrl, urlToRelativeUrl } from "@jsenv/filesystem"

import {
  setupTransformCalls,
  loadBabelPluginMapFromFile,
} from "./babel_transform_utils.mjs"
import { transform } from "./transform.mjs"

const measureBabelTransformOnMainThread = async ({ iterations = 5 } = {}) => {
  const metrics = await measurePerformanceMultipleTimes(
    async () => {
      const projectDirectoryUrl = new URL("./", import.meta.url)
      const basicAppDirectoryUrl = new URL("./basic_app/", import.meta.url)
      const transformCalls = await setupTransformCalls()
      // we know babel plugin map before hand
      // in the worker approach we'll need pass only the names
      // and require them in the worker
      const babelPluginMap = await loadBabelPluginMapFromFile({
        projectDirectoryUrl,
      })
      transformCalls.forEach((call) => {
        call.babelPluginMap = babelPluginMap
      })
      await new Promise((resolve) => setTimeout(resolve, 500))

      const files = {}
      const startMs = Date.now()
      await Promise.all(
        transformCalls.map(async ({ url, code, babelPluginMap }) => {
          const result = await transform({ url, code, babelPluginMap })
          files[url] = result.code
        }),
      )
      const endMs = Date.now()
      const msEllapsed = endMs - startMs

      await Promise.all(
        Object.keys(files).map(async (url) => {
          const relativeUrl = urlToRelativeUrl(url, basicAppDirectoryUrl)
          const distUrl = resolveUrl(
            relativeUrl,
            new URL("./dist/", import.meta.url),
          )
          await writeFile(distUrl, files[url])
        }),
      )

      return {
        [`time to transform ${transformCalls.length} files on main thread`]: {
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

const executeAndLog = process.argv.includes("--local")
if (executeAndLog) {
  const performanceMetrics = await measureBabelTransformOnMainThread({
    iterations: 1,
  })
  logPerformanceMetrics(performanceMetrics)
}
