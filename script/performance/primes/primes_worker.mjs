import { parentPort } from "node:worker_threads"
import { generatePrimes } from "./generate_primes.mjs"

parentPort.on("message", ({ start, range }) => {
  const primes = generatePrimes(start, range)
  parentPort.postMessage(primes)
})
