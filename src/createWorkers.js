/*
 *
 */

import { Worker } from "node:worker_threads"
import { cpus } from "node:os"
import { createLogger } from "@jsenv/logger"
import {
  assertAndNormalizeFileUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

import { createIntegerGenerator } from "@jsenv/worker/src/internal/integer_generator.js"
import { raceCallbacks } from "@jsenv/worker/src/internal/race.js"

const cpuCount = (() => {
  try {
    return cpus().length
  } catch {
    return 1
  }
})()

export const createWorkers = ({
  workerFileUrl,
  workerData,
  // to get a static amount of workers: one must pass minWorkers === maxWorkers
  minWorkers = Math.max(cpuCount / 2, 1),
  maxWorkers = cpuCount * 1.5,
  logLevel = "info",
  maxIdleDuration = 0,
  maxWaitingJobs = Number.MAX_SAFE_INTEGER,
  keepProcessAlive = false,
  execArgv,
  argv,
  env,
  handleSIGINT = true,
}) => {
  workerFileUrl = assertAndNormalizeFileUrl(workerFileUrl)

  const logger = createLogger({ logLevel })
  const workerFilePath = urlToFileSystemPath(workerFileUrl)

  const workerIdGenerator = createIntegerGenerator()
  const jobIdGenerator = createIntegerGenerator()

  const workerMap = new Map()
  const busyArray = []
  const idleArray = []
  const jobsWaitingAnAvailableWorker = []

  const inspect = () => {
    const workerCount = workerMap.size
    const workerBusyCount = busyArray.length
    const workerIdleCount = idleArray.length
    const jobWaitingCount = jobsWaitingAnAvailableWorker.length

    return {
      workerCount,
      workerBusyCount,
      workerIdleCount,
      jobWaitingCount,
    }
  }

  const forget = (worker) => {
    workerMap.delete(worker.id)
    removeFromArray(busyArray, worker.id)
    removeFromArray(idleArray, worker.id)
  }

  const kill = (worker) => {
    forget(worker)
    worker.nodeWorker.terminate()
  }

  const createWorker = () => {
    const worker = {
      id: workerIdGenerator(),
      nodeWorker: new Worker(workerFilePath, {
        workerData,
        execArgv,
        argv,
        env,
      }),
      errored: false,
      job: null,
    }
    workerMap.set(worker.id, worker)
    if (!keepProcessAlive) {
      worker.nodeWorker.unref()
    }

    worker.nodeWorker.once("error", (error) => {
      if (worker.job) {
        // already handled by the job
        return
      }
      logger.debug(`error on worker #${worker.id}`)
      worker.errored = true
      throw error
    })
    worker.nodeWorker.once("exit", () => {
      // happens when:
      // - terminate is called due to error when calling worker.postMessage()
      // - terminate is called by terminateAllWorkers()
      // - terminate is called because job is cancelled while worker is executing
      // - terminate is called because worker timeout during execution
      // - There is a runtime error during job excecution
      // -> These cases should be catched by workerMap.has(worker.id)
      // - There is a runtime error during worker execution
      if (workerMap.has(worker.id)) {
        logger.debug(`worker #${worker.id} exited, it's not supposed to happen`)
        forget(worker)
      }

      // the worker emitted an "error" event outside the execution of a job
      // this is not supposed to happen and is used to recognize worker
      // throwing a top level error. In that case we don't want to create
      // an other worker that would also throw
      if (worker.errored) {
        logger.debug(`this worker won't be replace (errored flag is true)`)
        return
      }

      const workerCount = workerMap.size
      if (workerCount >= minWorkers) {
        logger.debug(
          `this worker won't be replaced (there is enough worker already: ${workerCount})`,
        )
        return
      }

      logger.debug("adding a new worker to replace the one who exited")
      addWorker()
    })

    return worker
  }

  const addWorker = () => {
    const newWorker = createWorker()
    const nextJob = jobsWaitingAnAvailableWorker.shift()
    if (nextJob) {
      assignJobToWorker(nextJob, newWorker)
      return
    }
    markAsIdle(newWorker)
  }

  const markAsIdle = (worker) => {
    removeFromArray(busyArray, worker.id)
    idleArray.push(worker.id)

    const workerCount = workerMap.size
    if (
      // keep the min amount of workers alive
      workerCount <= minWorkers ||
      // or if they are allowd to live forever
      maxIdleDuration === Infinity
    ) {
      return
    }

    // this worker was dynamically added, remove it according to maxIdleDuration
    worker.idleKillTimeout = setTimeout(() => {
      logger.debug(
        `killing worker #${worker.id} because idle during more than "maxIdleDuration" (${maxIdleDuration}ms)`,
      )
      kill(worker)
    }, maxIdleDuration)
    worker.idleKillTimeout.unref()
  }

  const addJob = (
    jobData,
    { transferList = [], abortSignal, allocatedMs } = {},
  ) => {
    return new Promise((resolve, reject) => {
      const job = {
        id: jobIdGenerator(),
        data: jobData,
        transferList,
        allocatedMs,
        abortSignal,
        onAbort: (abortTiming) => {
          reject(new Error(`job #${job.id} aborted ${abortTiming}`))
        },
        onError: (error) => {
          reject(error)
        },
        onMessageError: (error) => {
          reject(error)
        },
        onExit: (exitCode) => {
          reject(
            new Error(
              `worker exited: worker #${job.worker.id} exited with code ${exitCode} while performing job #${job.id}.`,
            ),
          )
        },
        onTimeout: () => {
          const timeoutError = new Error(
            `worker timeout: worker #${job.worker.id} is too slow to perform job #${job.id} (takes more than ${allocatedMs} ms)`,
          )
          reject(timeoutError)
        },
        onMessage: (message) => {
          logger.debug(`job #${job.id} completed`)
          resolve(message)
        },
      }
      logger.debug(`add a job with id: ${job.id}`)

      if (abortSignal && abortSignal.aborted) {
        job.onAbort("before adding job")
        return
      }

      if (idleArray.length > 0) {
        logger.debug(`a worker is available for that job`)
        assignJobToWorker(job, workerMap.get(idleArray[0]))
        return
      }

      const workerCount = workerMap.size
      if (workerCount < maxWorkers) {
        logger.debug(`adding a worker for that job`)
        const worker = createWorker()
        assignJobToWorker(job, worker)
        return
      }

      const jobWaitingCount = jobsWaitingAnAvailableWorker.length
      if (jobWaitingCount > maxWaitingJobs) {
        throw new Error(
          `maxWaitingJobs reached (${maxWaitingJobs}), cannot add more job`,
        )
      }
      logger.debug(
        `no worker available for that job -> waiting for an available worker`,
      )
      jobsWaitingAnAvailableWorker.push(job)
      if (abortSignal) {
        const unregisterAbort = registerEventCallback(
          abortSignal,
          "abort",
          () => {
            unregisterAbort()
            removeFromArray(jobsWaitingAnAvailableWorker, job)
            job.onAbort("while waiting a worker")
          },
        )
        job.unregisterAbort = unregisterAbort
      }
    })
  }

  const assignJobToWorker = async (job, worker) => {
    // make worker busy
    clearTimeout(worker.idleKillTimeout)
    removeFromArray(idleArray, worker.id)
    busyArray.push(worker.id)

    job.worker = worker
    worker.job = job
    logger.debug(`job #${job.id} assigned to worker #${worker.id}`)

    let onPostMessageError
    const raceWinnerPromise = raceCallbacks({
      timeout: (cb) => {
        if (!job.allocatedMs) {
          return null
        }
        const timeout = setTimeout(cb, job.allocatedMs)
        return () => {
          clearTimeout(timeout)
        }
      },
      abort: (cb) => {
        if (!job.abortSignal) {
          return null
        }
        // abort now have a new effect: it's not anymore just
        // removing job from "jobsWaitingAnAvailableWorker"
        job.unregisterAbort()
        return registerEventCallback(job.abortSignal, "abort", cb)
      },
      error: (cb) => registerEventCallback(worker.nodeWorker, "error", cb),
      messageerror: (cb) =>
        registerEventCallback(worker.nodeWorker, "messageerror", cb),
      exit: (cb) => registerEventCallback(worker.nodeWorker, "exit", cb),
      message: (cb) => registerEventCallback(worker.nodeWorker, "message", cb),
      postMessageError: (cb) => {
        onPostMessageError = cb
      },
    })

    try {
      worker.nodeWorker.postMessage(job.data, job.transferList)
    } catch (e) {
      onPostMessageError(e) // to ensure other callbacks are removed by raceCallbacks
    }

    const winner = await raceWinnerPromise
    worker.job = null
    const callbacks = {
      postMessageError: (e) => {
        worker.job = job
        job.onError(e)
        // likely e.name ==="DataCloneError"
        // we call worker.terminate otherwise the process never exits
        kill(worker)
      },
      // uncaught error throw in the worker:
      // - clear timeout
      // - calls job.onError, the job promise will be rejected
      // - worker will be removed by "exit" listener set in "createWorker"
      error: (error) => {
        worker.job = job
        job.onError(error)
      },
      abort: () => {
        kill(worker)
        job.onAbort("during execution by worker")
        // The worker might be in the middle of something
        // it cannot be reused, we terminate it
      },
      timeout: () => {
        kill(worker)
        // Same here, worker is in the middle of something, kill it
        job.onTimeout()
      },
      // Error occured while deserializing a message sent by us to the worker
      // - clear timeout
      // - calls job.onMessageError, the job promise will be rejected
      // - indicate worker is about to be idle
      messageerror: (error) => {
        job.onMessageError(error)
        markAsIdle(worker)
      },
      // Worker exits before emitting a "message" event, this is unexpected
      // - clear timeout
      // - calls job.onExit, the job promise will be rejected
      // - worker will be removed by "exit" listener set in "createWorker"
      exit: (exitCode) => {
        job.onExit(exitCode)
      },
      // Worker properly respond something
      // - clear timeout
      // - call job.onMessage, the job promise will resolve
      // - indicate worker is about to be idle
      message: (value) => {
        job.onMessage(value)
        markAsIdle(worker)
      },
    }
    callbacks[winner.name](winner.data)
  }

  const terminateAllWorkers = async () => {
    await Promise.allSettled(
      Array.from(workerMap.values()).map(async (worker) => {
        await worker.terminate()
      }),
    )
  }

  let unregisterSIGINT = () => {}

  const destroy = async () => {
    unregisterSIGINT()
    minWorkers = 0 // prevent onWorkerExit() to spawn worker
    maxWorkers = 0 // so that if any code calls addJob, new worker are not spawned
    jobsWaitingAnAvailableWorker.length = 0
    await terminateAllWorkers()
    workerMap.clear() // this is to help garbage collect faster but not required
  }

  if (handleSIGINT) {
    process.once("SIGINT", destroy)
    unregisterSIGINT = () => {
      process.removeListener("SIGINT", destroy)
    }
  }

  if (minWorkers > 0) {
    let numberOfWorkerToCreate = minWorkers
    logger.debug(
      `create ${numberOfWorkerToCreate} initial workers according to minWorkers`,
    )
    while (numberOfWorkerToCreate--) {
      const worker = createWorker()
      markAsIdle(worker)
    }
  }

  return {
    inspect,
    addJob,
    terminateAllWorkers,
    destroy,

    // for unit test
    addWorker,
  }
}

const removeFromArray = (array, value) => {
  const index = array.indexOf(value)
  array.splice(index, 1)
}

const registerEventCallback = (object, eventName, callback) => {
  if (object.addListener) {
    object.addListener(eventName, callback)
    return () => {
      object.removeListener(eventName, callback)
    }
  }
  object.addEventListener(eventName, callback)
  return () => {
    object.removeEventListener(eventName, callback)
  }
}
