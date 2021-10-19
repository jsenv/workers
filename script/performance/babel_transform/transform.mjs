import { createRequire } from "node:module"
import { urlToFileSystemPath } from "@jsenv/filesystem"

const require = createRequire(import.meta.url)

export const transform = async ({
  code,
  map, // optional
  ast, // optional
  url,
  relativeUrl, // optional

  babelPluginMap,
  moduleOutFormat,

  allowTopLevelAwait,
  sourcemapEnabled,
}) => {
  // eslint-disable-next-line import/no-unresolved
  const transformModulesSystemJs = require("@babel/plugin-transform-modules-systemjs")
  // eslint-disable-next-line import/no-unresolved
  const proposalDynamicImport = require("@babel/plugin-proposal-dynamic-import")

  const inputPath = computeInputPath(url)

  // https://babeljs.io/docs/en/options
  const options = {
    filename: inputPath,
    filenameRelative: relativeUrl,
    inputSourceMap: map,
    configFile: false,
    babelrc: false, // trust only these options, do not read any babelrc config file
    ast: true,
    sourceMaps: sourcemapEnabled,
    sourceFileName: inputPath,
    // https://babeljs.io/docs/en/options#parseropts
    parserOpts: {
      allowAwaitOutsideFunction: allowTopLevelAwait,
    },
  }

  const babelTransformReturnValue = await babelTransform({
    ast,
    code,
    options: {
      ...options,
      plugins: babelPluginsFromBabelPluginMap({
        ...babelPluginMap,
        ...(moduleOutFormat === "systemjs"
          ? {
              "proposal-dynamic-import": [proposalDynamicImport],
              "transform-modules-systemjs": [transformModulesSystemJs],
            }
          : {}),
      }),
    },
  })
  code = babelTransformReturnValue.code
  map = babelTransformReturnValue.map
  ast = babelTransformReturnValue.ast
  const { metadata } = babelTransformReturnValue
  return { code, map, metadata, ast }
}

const babelPluginsFromBabelPluginMap = (babelPluginMap) => {
  return Object.keys(babelPluginMap).map(
    (babelPluginName) => babelPluginMap[babelPluginName],
  )
}

const computeInputPath = (url) => {
  if (url.startsWith("file://")) {
    return urlToFileSystemPath(url)
  }
  return url
}

const babelTransform = async ({ ast, code, options }) => {
  const { transformAsync, transformFromAstAsync } = await import("@babel/core")

  try {
    if (ast) {
      const result = await transformFromAstAsync(ast, code, options)
      return result
    }
    return await transformAsync(code, options)
  } catch (error) {
    if (error && error.code === "BABEL_PARSE_ERROR") {
      throw createParseError({
        cause: error,
        message: error.message,
        filename: options.filename,
        lineNumber: error.loc.line,
        columnNumber: error.loc.column,
      })
    }
    throw error
  }
}

const createParseError = ({ message, cause, ...data }) => {
  const parseError = new Error(message, { cause })
  parseError.code = "PARSE_ERROR"
  parseError.data = {
    message,
    ...data,
  }

  return parseError
}
