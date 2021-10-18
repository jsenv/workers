export const raceCallbacks = (raceDescription) => {
  return new Promise((resolve) => {
    const unregisterCallbacks = []
    Object.keys(raceDescription).forEach((candidateName) => {
      const registerCallback = raceDescription[candidateName]
      const registerReturnValue = registerCallback((data) => {
        unregisterCallbacks.forEach((unregister) => {
          unregister()
        })
        unregisterCallbacks.length = 0
        resolve({
          name: candidateName,
          data,
        })
      })
      if (typeof registerReturnValue === "function") {
        unregisterCallbacks.push(registerReturnValue)
      }
    })
  })
}
