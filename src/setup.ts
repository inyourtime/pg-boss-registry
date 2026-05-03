import type { PgBoss } from 'pg-boss'
import type {
  PgBossQueueDefinition,
  PgBossRegistrySetupOptions,
  PgBossScheduleDefinition,
  PgBossWorkerDefinition,
  PgBossWorkerRegistration,
} from './types.js'

type PgBossWorkerQueueBinding = {
  queue?: string
}

function getPgBossWorkerQueue<ReqData, ResData>(worker: PgBossWorkerDefinition<ReqData, ResData>) {
  const queue = (worker as PgBossWorkerQueueBinding).queue

  return queue ?? worker.name
}

export async function registerPgBossQueue(
  boss: Pick<PgBoss, 'createQueue'>,
  queue: PgBossQueueDefinition,
) {
  if (typeof queue === 'string') {
    await boss.createQueue(queue)
    return
  }

  const { name, ...options } = queue
  await boss.createQueue(name, options)
}

export async function registerPgBossQueues(
  boss: Pick<PgBoss, 'createQueue'>,
  queues: readonly PgBossQueueDefinition[] = [],
) {
  for (const queue of queues) {
    await registerPgBossQueue(boss, queue)
  }
}

export async function registerPgBossSchedule<Data = object>(
  boss: Pick<PgBoss, 'schedule'>,
  schedule: PgBossScheduleDefinition<Data>,
) {
  if (schedule.enabled === false) {
    return
  }

  const options = schedule.key
    ? {
        ...schedule.options,
        key: schedule.key,
      }
    : schedule.options

  await boss.schedule(schedule.name, schedule.cron, schedule.data ?? null, options)
}

export async function registerPgBossSchedules(
  boss: Pick<PgBoss, 'schedule'>,
  schedules: readonly PgBossScheduleDefinition<any>[] = [],
) {
  for (const schedule of schedules) {
    await registerPgBossSchedule(boss, schedule)
  }
}

export function getPgBossWorkerSchedule<ReqData>(
  worker: PgBossWorkerDefinition<ReqData>,
): PgBossScheduleDefinition<ReqData> | null {
  if (!worker.schedule) {
    return null
  }

  const queue = getPgBossWorkerQueue(worker)

  if (typeof worker.schedule === 'string') {
    return {
      cron: worker.schedule,
      name: queue,
    }
  }

  const { tz, ...schedule } = worker.schedule
  const options = tz
    ? {
        ...schedule.options,
        tz,
      }
    : schedule.options

  const definition: PgBossScheduleDefinition<ReqData> = {
    ...schedule,
    name: schedule.name ?? queue,
  }

  if (options) {
    definition.options = options
  }

  return definition
}

export function resolvePgBossWorkerDefinition<Context, ReqData = object, ResData = any>(
  context: Context,
  worker: PgBossWorkerRegistration<Context, ReqData, ResData>,
): PgBossWorkerDefinition<ReqData, ResData> {
  return typeof worker === 'function' ? worker(context) : worker
}

function wrapPgBossWorkerHandler<Jobs, ResData>(
  handler: (jobs: Jobs) => Promise<ResData>,
  onError?: (error: unknown, jobs: Jobs) => void | Promise<void>,
): (jobs: Jobs) => Promise<ResData> {
  if (!onError) {
    return handler
  }

  return async (jobs) => {
    try {
      return await handler(jobs)
    } catch (error) {
      await onError(error, jobs)
      throw error
    }
  }
}

export async function registerPgBossWorker<ReqData = object, ResData = any>(
  boss: Pick<PgBoss, 'schedule' | 'work'>,
  worker: PgBossWorkerDefinition<ReqData, ResData>,
) {
  if (worker.enabled === false) {
    return
  }

  const queue = getPgBossWorkerQueue(worker)

  const schedule = getPgBossWorkerSchedule(worker)
  if (schedule) {
    await registerPgBossSchedule(boss, schedule)
  }

  if (worker.includeMetadata) {
    await boss.work(
      queue,
      { ...(worker.options ?? {}), includeMetadata: true as const },
      wrapPgBossWorkerHandler(worker.handler, worker.onError),
    )
    return
  }

  await boss.work(
    queue,
    worker.options ?? {},
    wrapPgBossWorkerHandler(worker.handler, worker.onError),
  )
}

export async function registerPgBossWorkers(
  boss: Pick<PgBoss, 'schedule' | 'work'>,
  workers: readonly PgBossWorkerDefinition<any>[] = [],
) {
  for (const worker of workers) {
    await registerPgBossWorker(boss, worker)
  }
}

export async function closePgBossWorkers(
  boss: Pick<PgBoss, 'offWork'>,
  workers: readonly PgBossWorkerDefinition[] = [],
) {
  for (const worker of workers) {
    if (worker.enabled === false || worker.offWorkOnClose === false) {
      continue
    }

    await boss.offWork(getPgBossWorkerQueue(worker), worker.offWorkOptions)
  }
}

export async function setupPgBoss<Context = unknown>(
  boss: PgBoss,
  options: PgBossRegistrySetupOptions<Context> = {},
) {
  const start = options.start ?? false
  const context = options.context as Context

  if (start) {
    await boss.start()
  }

  await registerPgBossQueues(boss, options.queueRegistry?.definitions)

  const workers = (options.workers ?? []).map((worker) =>
    resolvePgBossWorkerDefinition(context, worker),
  )

  await registerPgBossWorkers(boss, workers)

  return {
    boss,
    workers,
    async close() {
      await closePgBossWorkers(boss, workers)

      if (options.stopOnClose) {
        await boss.stop(options.stopOptions)
      }
    },
  }
}
