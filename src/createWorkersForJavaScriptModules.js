import { createWorkers } from "./createWorkers.js"

const workerControllingJavaScriptModulesUrl = new URL(
  "./internal/worker_controlling_javascript_modules.js",
  import.meta.url,
)

export const createWorkersForJavaScriptModules = (methods, options) => {
  let workers

  const methodHooks = {}
  const urlSet = new Set()
  Object.keys(methods).forEach((methodName) => {
    const value = methods[methodName]
    let url
    try {
      url = new URL(value)
    } catch (e) {
      throw new TypeError(
        `method value must be an url, found ${value} for method "${methodName}"`,
      )
    }

    const { hash, urlWithoutHash } = extractHashFromUrl(url)
    if (!hash) {
      throw new Error(`no hash found for method url: ${url}`)
    }

    const exportName = hash.slice(1)

    urlSet.add(urlWithoutHash)

    methodHooks[methodName] = async (...args) => {
      // il faudrait parcourir tous les args
      // et mettre certains truc dans une transfer list
      // dans le worker on fera un truc similaire pour respecter la valeur de retour de la fonction

      const result = await workers.addJob(
        {
          url: urlWithoutHash,
          exportName,
          args,
        },
        {
          transferList: [],
        },
      )
      return result
    }
  })

  workers = createWorkers({
    workerFileUrl: workerControllingJavaScriptModulesUrl,
    workerData: {
      // urls that will be pre-imported by the worker on initialisation
      urls: Array.from(urlSet.values()),
    },
    ...options,
  })

  return methodHooks
}

const extractHashFromUrl = (url) => {
  const { hash } = url
  url.hash = ""
  const urlWithoutHash = String(url)
  return { hash, urlWithoutHash }
}
