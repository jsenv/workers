import { Worker } from "node:worker_threads"
import { cpus } from "node:os"
import { createLogger } from "@jsenv/logger"
import {
  assertAndNormalizeFileUrl,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

const cpuCount = (() => {
  try {
    return cpus().length
  } catch {
    return 1
  }
})()

export const createWorkers = ({
  workerFileUrl,
  // to get a static amount of workers: one must pass minWorkers === maxWorkers
  minWorkers = Math.max(cpuCount / 2, 1),
  maxWorkers = cpuCount * 1.5,
  logLevel = "warn",
  maxWaitingJobs = Number.MAX_SAFE_INTEGER,
  keepProcessAlive = false,
  idleTimeout = 0,
}) => {
  workerFileUrl = assertAndNormalizeFileUrl(workerFileUrl)

  const logger = createLogger({ logLevel })
  const workerFilePath = urlToFileSystemPath(workerFileUrl)

  let previousWorkerId = 0
  const workerMap = new Map()
  const busyArray = []
  const idleArray = []
  let previousJobId = 0
  const jobsWaitingAnAvailableWorker = []

  const inspect = () => {
    const workerBusyCount = busyArray.length
    const workerIdleCount = idleArray.length
    const jobWaitingCount = jobsWaitingAnAvailableWorker.length

    return {
      workerBusyCount,
      workerIdleCount,
      jobWaitingCount,
    }
  }

  const addWorker = () => {
    if (previousWorkerId === Number.MAX_SAFE_INTEGER) {
      previousWorkerId = 0
    }
    const workerId = previousWorkerId + 1

    const worker = new Worker(workerFilePath, {
      argv: ["--unhandled-rejections=strict"],
    })
    worker.__id__ = workerId
    if (!keepProcessAlive) {
      worker.unref()
    }
    workerMap.set(worker.__id__, worker)

    worker.once("exit", () => {
      // except when job is cancelled so we keep debug for now
      logger.debug(`a worker exited, it's not supposed to happen`)
      onWorkerExit(worker)
    })

    return worker
  }

  const onWorkerExit = (worker) => {
    workerMap.delete(worker.__id__)
    removeFromArray(busyArray, worker.__id__)
    removeFromArray(idleArray, worker.__id__)
    clearTimeout(worker.idleAutoRemoveTimeout)

    const workerCount = workerMap.size
    if (workerCount < minWorkers) {
      logger.debug("Create a new worker to respect minWorkers")
      const worker = addWorker()
      onWorkerAboutToBeIdle(worker)
    }
  }

  const onWorkerAboutToBeIdle = (worker) => {
    const nextJob = jobsWaitingAnAvailableWorker.shift()
    if (nextJob) {
      assignJobToWorker(nextJob, worker)
      return
    }

    const workerCount = workerMap.size
    if (
      // keep the min amount of workers alive
      workerCount <= minWorkers ||
      // or if they are allowd to live forever
      idleTimeout === Infinity
    ) {
      idleArray.push(worker.__id__)
      return
    }

    // this worker was dynamically added, remove it according to idleTimeout
    if (idleTimeout === 0) {
      worker.terminate()
      return
    }

    idleArray.push(worker.__id__)
    worker.idleAutoRemoveTimeout = setTimeout(() => {
      worker.terminate()
    })
    worker.idleAutoRemoveTimeout.unref()
  }

  const requestJob = (
    jobData,
    { transferList = [], abortSignal, allocatedMs } = {},
  ) => {
    return new Promise((resolve, reject) => {
      if (previousJobId === Number.MAX_SAFE_INTEGER) {
        previousJobId = 0
      }
      const jobId = previousJobId + 1
      logger.debug(`add a job with id: ${jobId}`)
      const job = {
        id: jobId,
        data: jobData,
        transferList,
        allocatedMs,
        abortSignal,
        onAbort: () => {
          reject(new Error(`job #${job.id} aborted`))
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
              `worker exited: worker #${job.worker.__id__} exited with code ${exitCode} while performing job #${job.id}.`,
            ),
          )
        },
        onTimeout: () => {
          const timeoutError = new Error(
            `worker timeout: worker #${job.worker.__id__} is too slow to perform job #${job.id} (takes more than ${allocatedMs} ms)`,
          )
          reject(timeoutError)
        },
        onMessage: (message) => {
          logger.debug(`job #${job.id} completed`)
          resolve(message)
        },
      }

      if (abortSignal && abortSignal.aborted) {
        job.onAbort()
        return
      }

      const idleWorkerId = idleArray.shift()
      if (idleWorkerId) {
        logger.debug(`a worker is available for that job`)
        assignJobToWorker(job, workerMap.get(idleWorkerId))
        return
      }

      const workerCount = workerMap.size
      if (workerCount < maxWorkers) {
        logger.debug(`adding a worker for that job`)
        const worker = addWorker()
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
        abortSignal.addEventListener(
          "abort",
          () => {
            removeFromArray(jobsWaitingAnAvailableWorker, job)
          },
          { once: true },
        )
      }
    })
  }

  const assignJobToWorker = (job, worker) => {
    clearTimeout(worker.idleAutoRemoveTimeout)
    job.worker = worker
    busyArray.push(worker.__id__)
    logger.debug(`job #${job.id} assigned to worker #${worker.__id__}`)

    let timeout
    if (job.allocatedMs) {
      timeout = setTimeout(async () => {
        job.onTimeout()
        await worker.terminate()
      }, job.allocatedMs)
    }

    const cleanup = () => {
      clearTimeout(timeout)
    }

    raceEvents([
      ...(job.abortSignal
        ? [
            {
              eventTarget: job.abortSignal,
              events: {
                abort: () => {
                  cleanup()
                  job.onAbort()
                  // The worker might be in the middle of something
                  // it cannot be reused, we terminate it
                  worker.terminate()
                },
              },
            },
          ]
        : []),
      {
        eventTarget: worker,
        events: {
          // uncaught error throw in the worker:
          // - clear timeout
          // - calls job.onError, the job promise will be rejected
          // - worker will be removed by "exit" listener set in "addWorker"
          error: (error) => {
            cleanup()
            job.onError(error)
          },
          // Error occured while deserializing a message sent by us to the worker
          // - clear timeout
          // - calls job.onMessageError, the job promise will be rejected
          // - indicate worker is about to be idle
          messageerror: (error) => {
            cleanup()
            job.onMessageError(error)
            onWorkerAboutToBeIdle(worker)
          },
          // Worker exits before emitting a "message" event, this is unexpected
          // - clear timeout
          // - calls job.onEarlyExit, the job promise will be rejected
          // - worker will be removed by "exit" listener set in "addWorker"
          exit: (exitCode) => {
            cleanup()
            job.onExit(exitCode)
          },
          // Worker properly respond something
          // - clear timeout
          // - call job.onMessage, the job promise will resolve
          // - indicate worker is about to be idle
          message: (value) => {
            cleanup()
            job.onMessage(value)
            onWorkerAboutToBeIdle(worker)
          },
        },
      },
    ])

    try {
      worker.postMessage(job.data, job.transferList)
    } catch (e) {
      // likely e.name ==="DataCloneError"
      // we call worker.terminate otherwise the process never exits
      worker.terminate()
      throw e
    }
  }

  const terminateAllWorkers = async () => {
    await Promise.allSettled(
      Array.from(workerMap.values()).map(async (worker) => {
        await worker.terminate()
      }),
    )
  }

  const destroy = async () => {
    minWorkers = 0 // prevent onWorkerExit() to spawn worker
    maxWorkers = 0 // so that if any code calls requestJob, new worker are not spawned
    jobsWaitingAnAvailableWorker.length = 0
    await terminateAllWorkers()
    // workerMap.clear() this is to help garbage collect faster but not required
  }

  logger.debug(`create ${minWorkers} initial workers according to minWorkers`)
  let i = 1
  while (i < minWorkers) {
    addWorker()
    i++
  }

  return {
    inspect,
    requestJob,
    terminateAllWorkers,
    destroy,
  }
}

const removeFromArray = (array, value) => {
  const index = array.indexOf(value)
  array.splice(index, 1)
}

const raceEvents = (eventRaces) => {
  const unregisterCallbacks = []
  eventRaces.forEach(({ eventTarget, events }) => {
    Object.keys(events).forEach((eventName) => {
      const unregisterEventCallback = registerEventCallback(
        eventTarget,
        eventName,
        (...args) => {
          unregisterCallbacks.forEach((unregister) => {
            unregister()
          })
          events[eventName](...args)
        },
      )
      unregisterCallbacks.push(unregisterEventCallback)
    })
  })
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
