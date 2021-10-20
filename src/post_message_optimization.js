import {
  arrayBufferFromBuffer,
  bufferFromArrayBuffer,
} from "./internal/array_buffer_conversion.js"

// https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
// https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist
export const optimizeValueForPostMessage = (value) => {
  let data
  const transferList = []
  const optimizations = []

  const visited = []
  const afterVisitCallbacks = []
  const optimizationsMap = new Map()

  const writeValueAt = (path, value) => {
    if (path.length === 0) {
      data = value
    } else {
      const pathAccessors = getPathAccessors(path, data)
      pathAccessors.set(value)
    }
  }

  const optimizeValueAt = (path, valueOptimized, from) => {
    const transferListIndex = transferList.length
    transferList[transferListIndex] = valueOptimized
    const optimization = {
      from,
      references: [path],
    }
    optimizations[transferListIndex] = optimization
    writeValueAt(path, valueOptimized)
    optimizationsMap.set(value, optimization)
  }

  const visitValue = (value, path) => {
    const seen = visited.includes(value)
    if (seen) {
      afterVisitCallbacks.push(() => {
        const optimization = optimizationsMap.get(value)
        if (optimization) {
          optimization.references.push(path)
        }
      })
      return
    }
    visited.push(value)

    if (value === null || value === undefined) {
      writeValueAt(path, value)
      return
    }

    if (Buffer.isBuffer(value)) {
      const arrayBuffer = arrayBufferFromBuffer(value)
      optimizeValueAt(path, arrayBuffer, "buffer")
      return
    }

    if (Array.isArray(value)) {
      const copy = []
      writeValueAt(path, copy)
      value.forEach((subvalue, index) => {
        visitValue(subvalue, [...path, index])
      })
      return
    }

    if (typeof value === "object") {
      const copy = {}
      writeValueAt(path, copy)
      Object.keys(value).forEach((key) => {
        const subvalue = value[key]
        visitValue(subvalue, [...path, key])
      })
      return
    }

    writeValueAt(path, value)
    return
  }

  visitValue(value, [])
  afterVisitCallbacks.forEach((cb) => {
    cb()
  })
  afterVisitCallbacks.length = 0
  optimizationsMap.clear()

  return [
    {
      data,
      optimizations,
    },
    transferList,
  ]
}

export const recomposeValueFromPostMessage = ({ data, optimizations }) => {
  optimizations.forEach(({ from, references }) => {
    const firstReference = references[0]
    const firstReferenceAccessors = getPathAccessors(firstReference, data)
    const value = firstReferenceAccessors.get()
    const valueBeforeOptimization = asBeforeOptimization(value, from)
    firstReferenceAccessors.set(valueBeforeOptimization)

    references.slice(1).forEach((reference) => {
      const pathAccessors = getPathAccessors(reference, data)
      pathAccessors.set(valueBeforeOptimization)
    })
  })

  return data
}

const asBeforeOptimization = (value, from) => {
  if (from === "buffer") {
    return bufferFromArrayBuffer(value)
  }
  return value
}

const getPathAccessors = (path, value) => {
  let valueAtPath = value
  const lastKeyIndex = path.length - 1
  let i = 0
  const j = lastKeyIndex
  while (i < j) {
    const subpath = path[i]
    valueAtPath = valueAtPath[subpath]
    i++
  }
  const lastKey = path[lastKeyIndex]

  return {
    get: () => {
      return valueAtPath[lastKey]
    },

    set: (value) => {
      valueAtPath[lastKey] = value
    },
  }
}
