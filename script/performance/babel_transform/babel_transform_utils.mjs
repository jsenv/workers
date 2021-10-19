import { fileURLToPath } from "node:url"
import { loadOptionsAsync } from "@babel/core"
import { listFilesMatching, readFile } from "@jsenv/filesystem"

export const setupTransformCalls = async () => {
  const directoryUrl = new URL("./", import.meta.url)
  const fileUrls = await listFilesMatching("./basic_app/**/*.js", directoryUrl)
  const transformCalls = []
  await Promise.all(
    fileUrls.map(async (fileUrl) => {
      transformCalls.push({
        code: await readFile(fileUrl),
        url: fileUrl,
        allowTopLevelAwait: true,
        sourcemapEnabled: true,
      })
    }),
  )
  return transformCalls
}

export const loadBabelPluginMapFromFile = async ({
  projectDirectoryUrl,
  babelConfigFileUrl,
}) => {
  const babelOptions = await loadOptionsAsync({
    cwd: fileURLToPath(projectDirectoryUrl),
    configFile: babelConfigFileUrl
      ? fileURLToPath(babelConfigFileUrl)
      : undefined,
  })
  const babelPluginMap = {}
  babelOptions.plugins.forEach((plugin) => {
    babelPluginMap[plugin.key] = plugin
  })

  return babelPluginMap
}
