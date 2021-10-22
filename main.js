/*
 * This file is the first file executed by code using the package
 * Its responsability is to export what is documented
 * Ideally this file should be kept simple to help discovering codebase progressively.
 */

export { createWorkers } from "./src/createWorkers.js"
export { functionAsWorkerUrl } from "./src/functionAsWorkerUrl.js"

export { createWorkersForJavaScriptModules } from "./src/createWorkersForJavaScriptModules.js"
