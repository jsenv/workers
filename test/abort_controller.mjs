if (!global.AbortController) {
  global.AbortController = function AbortController() {
    let onAbortCallback = () => {}
    const abortCallbacks = []

    const controller = {
      abort: () => {
        signal.aborted = true
        onAbortCallback()
        abortCallbacks.forEach((callback) => {
          callback()
        })
      },
    }
    const signal = {
      aborted: false,
      onabort: (callback) => {
        onAbortCallback = callback
      },
      addEventListener: (_, abortCallback) => {
        abortCallbacks.push(abortCallback)
      },
      removeEventListener: (_, abortCallback) => {
        const index = abortCallbacks.indexOf(abortCallback)
        if (index > -1) {
          abortCallbacks.splice(index, 1)
        }
      },
    }
    controller.signal = signal

    return controller
  }
}
