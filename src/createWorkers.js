import { Worker } from "node:worker_threads"
import { cpus } from "node:os"
import { createLogger } from "@jsenv/logger"
import {
  assertAndNormalizeFileUrl,
  assertFilePresence,
  urlToFileSystemPath,
} from "@jsenv/filesystem"

const cpuCount = (() => {
  try {
    return cpus().length
  } catch {
    return 1
  }
})()

export const createWorkers = async ({
  workerFileUrl,
  // to get a static amount of workers: one must pass minWorkers === maxWorkers
  minWorkers = Math.max(cpuCount / 2, 1),
  maxWorkers = cpuCount * 1.5,
  logLevel = "warn",
  maxWaitingJobs = Number.MAX_SAFE_INTEGER,
  keepProcessAlive = false,
}) => {
  workerFileUrl = assertAndNormalizeFileUrl(workerFileUrl)
  await assertFilePresence(workerFileUrl)

  const logger = createLogger({ logLevel })
  const workerFilePath = urlToFileSystemPath(workerFileUrl)

  const workerMap = new Map()
  const busyArray = []
  const idleArray = []
  let previousJobId = 0
  const jobsWaitingAnAvailableWorker = []

  const getStatusInfo = () => {
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
    const worker = new Worker(workerFilePath)
    if (!keepProcessAlive) {
      worker.unref()
    }
    workerMap.set(worker.threadId, worker)
    worker.once("exit", () => {
      // except when job is cancelled so we keep debug for now
      logger.debug(`a worker exited, it's not supposed to happen`)
      removeWorker(worker)
    })
    worker.once("error", (e) => {
      logger.error(`an error occured in a worker, removing it
--- error stack ---
${e.stack}`)
      removeWorker(worker)
    })
    return worker
  }

  const removeWorker = (worker) => {
    workerMap.delete(worker.threadId)
    removeFromArray(busyArray, worker.threadId)
    removeFromArray(idleArray, worker.threadId)

    const workerCount = workerMap.size
    if (workerCount < maxWorkers) {
      const worker = addWorker()
      onWorkerAboutToBeIdle(worker)
    }
  }

  const onWorkerAboutToBeIdle = (worker) => {
    const nextJob = jobsWaitingAnAvailableWorker.shift()
    if (nextJob) {
      assignJobToWorker(nextJob, worker)
    } else {
      idleArray.push(worker.threadId)
    }
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
              `worker exited: worker #${job.worker.threadId} exited with code ${exitCode} while performing job #${job.id}.`,
            ),
          )
        },
        onTimeout: () => {
          const timeoutError = new Error(
            `worker timeout: worker #${job.worker.threadId} is too slow to perform job #${job.id} (takes more than ${allocatedMs} ms)`,
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
    job.worker = worker
    busyArray.push(worker.threadId)
    logger.debug(`job #${job.id} assigned to worker #${worker.threadId}`)

    let timeout
    if (job.allocatedMs) {
      timeout = setTimeout(async () => {
        job.onTimeout()
        await worker.terminate()
      }, job.allocatedMs)
    }
    raceEvents([
      ...(job.abortSignal
        ? [
            {
              eventTarget: job.abortSignal,
              events: {
                abort: async () => {
                  clearTimeout(timeout)
                  job.onAbort()
                  // The worker might be in the middle of something
                  // it cannot be reused, we terminate it
                  await worker.terminate()
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
          // - worker will be removed by "error" listener set in "addWorker"
          error: (error) => {
            clearTimeout(timeout)
            job.onError(error)
          },
          // Error occured while deserializing a message sent by us to the worker
          // - clear timeout
          // - calls job.onMessageError, the job promise will be rejected
          // - indicate worker is about to be idle
          messageerror: (error) => {
            clearTimeout(timeout)
            job.onMessageError(error)
            onWorkerAboutToBeIdle(worker)
          },
          // Worker exits before emitting a "message" event, this is unexpected
          // - clear timeout
          // - calls job.onEarlyExit, the job promise will be rejected
          // - worker will be removed by "exit" listener set in "addWorker"
          exit: (exitCode) => {
            clearTimeout(timeout)
            job.onExit(exitCode)
          },
          // Worker properly respond something
          // - clear timeout
          // - call job.onMessage, the job promise will resolve
          // - indicate worker is about to be idle
          message: (value) => {
            clearTimeout(timeout)
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
    maxWorkers = 0
    jobsWaitingAnAvailableWorker.length = 0
    await terminateAllWorkers()
  }

  logger.debug(`create ${minWorkers} workers ready to do some job`)
  let i = 1
  while (i < minWorkers) {
    addWorker()
    i++
  }

  return {
    getStatusInfo,
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
