export const createIntegerGenerator = () => {
  let previousInteger = 0
  return () => {
    if (previousInteger === Number.MAX_SAFE_INTEGER) {
      previousInteger = 0
      return 1
    }

    previousInteger += 1
    return previousInteger
  }
}
