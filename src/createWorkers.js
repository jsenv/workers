// https://github.com/piscinajs/piscina/tree/master

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
  maxIdleDuration = 0,
  keepProcessAlive = false,
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

  const createWorker = () => {
    if (previousWorkerId === Number.MAX_SAFE_INTEGER) {
      previousWorkerId = 0
    }
    const workerId = previousWorkerId + 1
    previousWorkerId = workerId

    const worker = new Worker(workerFilePath, {
      argv: ["--unhandled-rejections=strict"],
    })
    worker.__id__ = workerId
    if (!keepProcessAlive) {
      worker.unref()
    }
    workerMap.set(worker.__id__, worker)

    worker.on("error", (error) => {
      worker.__errored__ = true
      throw error
    })
    worker.once("exit", () => {
      // happens when:
      // - terminate is called due to error when calling worker.postMessage()
      // - terminate is called by terminateAllWorkers()
      // - terminate is called because job is cancelled while worker is executing
      // - terminate is called because worker timeout during execution
      // - There is a runtime error during job excecution
      // All cases above should just "debug" things, not even sure anything is needed
      // - There is a runtime error during worker execution
      //   This one is problematic because trying to respawn a worker
      //   to respect "minWorkers" would fail again
      //   And there is no reliable way to know where the error comes from
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

    if (!worker.__errored__) {
      const workerCount = workerMap.size
      if (workerCount < minWorkers) {
        logger.debug("Create a new worker to respect minWorkers")
        const worker = createWorker()
        onWorkerAboutToBeIdle(worker)
      }
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
      maxIdleDuration === Infinity
    ) {
      idleArray.push(worker.__id__)
      return
    }

    // this worker was dynamically added, remove it according to maxIdleDuration
    idleArray.push(worker.__id__)
    worker.idleAutoRemoveTimeout = setTimeout(() => {
      worker.terminate()
    }, maxIdleDuration)
    worker.idleAutoRemoveTimeout.unref()
  }

  const addJob = (
    jobData,
    { transferList = [], abortSignal, allocatedMs } = {},
  ) => {
    return new Promise((resolve, reject) => {
      if (previousJobId === Number.MAX_SAFE_INTEGER) {
        previousJobId = 0
      }
      const jobId = previousJobId + 1
      previousJobId = jobId
      logger.debug(`add a job with id: ${jobId}`)
      const job = {
        id: jobId,
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
        job.onAbort("before adding job")
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

    // job error is not considered as a worker error
    // we remove the error listener, this job
    // will reject in case of "error" and Node.js will terminate
    // worker, giving a chance to recreate one if the error is catched
    worker.removeAllListeners("error")
    if (job.unregisterAbort) job.unregisterAbort()
    raceEvents([
      ...(job.abortSignal
        ? [
            {
              eventTarget: job.abortSignal,
              events: {
                abort: () => {
                  cleanup()
                  job.onAbort("during execution by worker")
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
          // - worker will be removed by "exit" listener set in "createWorker"
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
          // - worker will be removed by "exit" listener set in "createWorker"
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
    maxWorkers = 0 // so that if any code calls addJob, new worker are not spawned
    jobsWaitingAnAvailableWorker.length = 0
    await terminateAllWorkers()
    // workerMap.clear() this is to help garbage collect faster but not required
  }

  logger.debug(`create ${minWorkers} initial workers according to minWorkers`)
  let i = 1
  while (i < minWorkers) {
    const worker = createWorker()
    onWorkerAboutToBeIdle(worker)
    i++
  }

  return {
    inspect,
    addJob,
    terminateAllWorkers,
    destroy,

    // for unit test
    addWorker: () => {
      const worker = createWorker()
      onWorkerAboutToBeIdle(worker)
    },
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
