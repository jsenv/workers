import { parentPort } from "node:worker_threads"
import { createRequire } from "node:module"
import { transform } from "./transform.mjs"

const require = createRequire(import.meta.url)

parentPort.on("message", async ({ babelPluginConfig, ...rest }) => {
  const babelPluginMap = babelPluginMapFromBabelPluginConfig(babelPluginConfig)
  const { code, map, metadata } = await transform({
    babelPluginMap,
    ...rest,
  })
  parentPort.postMessage({ code, map, metadata })
})

const babelPluginMapFromBabelPluginConfig = (babelPluginConfig) => {
  const babelPluginMap = {}
  Object.keys(babelPluginConfig).forEach((key) => {
    const babelPluginSpecifier = babelPluginMapping[key] || key
    babelPluginMap[key] = [
      // eslint-disable-next-line import/no-dynamic-require
      require(babelPluginSpecifier),
      babelPluginConfig[key],
    ]
  })
  return babelPluginMap
}

const babelPluginMapping = {
  "proposal-numeric-separator": "@babel/plugin-proposal-numeric-separator",
  "proposal-json-strings": "@babel/plugin-proposal-json-strings",
  "proposal-object-rest-spread": "@babel/plugin-proposal-object-rest-spread",
  "proposal-optional-catch-binding":
    "@babel/plugin-proposal-optional-catch-binding",
  "proposal-optional-chaining": "@babel/plugin-proposal-optional-chaining",
  "proposal-unicode-property-regex":
    "@babel/plugin-proposal-unicode-property-regex",
  "transform-async-to-promises": "babel-plugin-transform-async-to-promises",
  "transform-arrow-functions": "@babel/plugin-transform-arrow-functions",
  "transform-block-scoped-functions":
    "@babel/plugin-transform-block-scoped-functions",
  "transform-block-scoping": "@babel/plugin-transform-block-scoping",
  "transform-classes": "@babel/plugin-transform-classes",
  "transform-computed-properties":
    "@babel/plugin-transform-computed-properties",
  "transform-destructuring": "@babel/plugin-transform-destructuring",
  "transform-dotall-regex": "@babel/plugin-transform-dotall-regex",
  "transform-duplicate-keys": "@babel/plugin-transform-duplicate-keys",
  "transform-exponentiation-operator":
    "@babel/plugin-transform-exponentiation-operator",
  "transform-for-of": "@babel/plugin-transform-for-of",
  "transform-function-name": "@babel/plugin-transform-function-name",
  "transform-literals": "@babel/plugin-transform-literals",
  "transform-new-target": "@babel/plugin-transform-new-target",
  "transform-object-super": "@babel/plugin-transform-object-super",
  "transform-parameters": "@babel/plugin-transform-parameters",
  "transform-regenerator": "@babel/plugin-transform-regenerator",
  "transform-shorthand-properties":
    "@babel/plugin-transform-shorthand-properties",
  "transform-spread": "@babel/plugin-transform-spread",
  "transform-sticky-regex": "@babel/plugin-transform-sticky-regex",
  "transform-template-literals": "@babel/plugin-transform-template-literals",
  "transform-typeof-symbol": "@babel/plugin-transform-typeof-symbol",
  "transform-unicode-regex": "@babel/plugin-transform-unicode-regex",

  "syntax-import-assertions": "@babel/plugin-syntax-import-assertions",
}
