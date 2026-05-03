import type { Job, JobSpyInterface, JobWithMetadata, PgBoss, SendOptions } from 'pg-boss'
import { expect, test } from 'tstyche'
import {
  asTypedPgBoss,
  definePgBossQueues,
  type PgBossQueuesFromRegistry,
  type PgBossRegistrySetupOptions,
  type PgBossScheduleDefinition,
  queue,
  type TypedPgBoss,
} from '../src/index.js'

type EmailJob = {
  userId: string
}

type CleanupJob = {
  olderThanDays: number
}

type ReportJob = {
  reportId: string
  format: 'csv' | 'pdf'
}

type AppContext = {
  log(message: string): void
}

type Queues = {
  'email/send': EmailJob
  cleanup: CleanupJob
  reports: ReportJob
  heartbeat: undefined
  nullable: null
}

declare const boss: PgBoss
declare const context: AppContext
declare const jobId: string
declare const jobIds: string[]
declare const options: SendOptions

test('queue registry derives queue payload map and queue definitions', () => {
  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true, options: { retryLimit: 3 } }),
    cleanup: queue<CleanupJob>({ create: false }),
    heartbeat: queue<undefined>({ create: true }),
  })

  type RegistryQueues = PgBossQueuesFromRegistry<typeof queues>

  expect<RegistryQueues>().type.toBe<{
    'email/send': EmailJob
    cleanup: CleanupJob
    heartbeat: undefined
  }>()
  expect(queues.queues['email/send'].options?.retryLimit).type.toBe<number | undefined>()
  expect(queues.definitions).type.toBeAssignableTo<
    ReadonlyArray<string | { name: string; retryLimit?: number }>
  >()
  expect(queue<ReportJob>()).type.toBeAssignableTo<{ readonly __data?: ReportJob }>()
})

test('queue registry workers bind queue names and payload types', () => {
  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true }),
    cleanup: queue<CleanupJob>({ create: true }),
    heartbeat: queue<undefined>({ create: true }),
    reports: queue<ReportJob>({ create: true }),
  })

  const workers = [
    queues.worker('email/send', {
      name: 'email-worker',
      async handler(jobs) {
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
      async onError(error, jobs) {
        expect(error).type.toBe<unknown>()
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
    }),
    queues.worker('cleanup', (app: AppContext) => {
      expect(app).type.toBe<AppContext>()

      return {
        name: 'cleanup-worker',
        schedule: {
          cron: '0 0 * * *',
          data: {
            olderThanDays: 30,
          },
        },
        async handler(jobs) {
          expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
        },
        onError(error, jobs) {
          expect(error).type.toBe<unknown>()
          expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
        },
      }
    }),
  ] as const

  expect(workers[0].queue).type.toBe<'email/send'>()
  expect(workers[1](context).queue).type.toBe<'cleanup'>()

  expect(queues.worker).type.not.toBeCallableWith('missing', {
    name: 'missing-worker',
    async handler() {},
  })

  queues.worker('email/send', {
    name: 'invalid-payload-worker',
    async handler(jobs) {
      // @ts-expect-error Property 'olderThanDays' does not exist on type 'EmailJob'.
      jobs[0]?.data.olderThanDays
    },
    onError(_error, jobs) {
      // @ts-expect-error Property 'olderThanDays' does not exist on type 'EmailJob'.
      jobs[0]?.data.olderThanDays
    },
  })

  queues.worker('reports', {
    name: 'metadata-report-worker',
    includeMetadata: true,
    async handler(jobs) {
      expect(jobs[0]?.data.format).type.toBe<'csv' | 'pdf' | undefined>()
      expect(jobs[0]?.state).type.toBe<
        'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed' | undefined
      >()
    },
    onError(_error, jobs) {
      expect(jobs[0]?.data.reportId).type.toBe<string | undefined>()
      expect(jobs[0]?.state).type.toBe<
        'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed' | undefined
      >()
    },
  })
})

test('plain schedules preserve payload types', () => {
  const emailSchedule = {
    name: 'email/send',
    cron: '0 8 * * *',
    data: {
      userId: 'user_123',
    },
  } satisfies PgBossScheduleDefinition<EmailJob>

  const invalidEmailSchedule = {
    name: 'email/send',
    cron: '0 8 * * *',
    data: {
      // @ts-expect-error Type 'number' is not assignable to type 'string'.
      userId: 123,
    },
  } satisfies PgBossScheduleDefinition<EmailJob>

  expect(emailSchedule.data.userId).type.toBe<string>()
  expect(invalidEmailSchedule.name).type.toBe<string>()
})

test('setup options carry framework context into registry worker factories', () => {
  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true }),
  })
  const worker = queues.worker('email/send', (app: AppContext) => {
    expect(app).type.toBe<AppContext>()

    return {
      name: 'email-worker',
      async handler(jobs) {
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
    }
  })
  const setupOptions = {
    context,
    queueRegistry: queues,
    workers: [worker],
  } satisfies PgBossRegistrySetupOptions<AppContext>

  expect(setupOptions).type.toBeAssignableTo<PgBossRegistrySetupOptions<AppContext>>()
})

test('asTypedPgBoss wraps send variants and insert with typed payloads', () => {
  const typedBoss = asTypedPgBoss<Queues>(boss)

  expect(typedBoss).type.toBe<TypedPgBoss<Queues>>()
  expect(typedBoss.send('email/send', { userId: 'user_123' })).type.toBe<Promise<string | null>>()
  expect(typedBoss.send('email/send', { userId: 'user_123' }, options)).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.send({ name: 'cleanup', data: { olderThanDays: 30 } })).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.send('heartbeat')).type.toBe<Promise<string | null>>()
  expect(typedBoss.send('heartbeat', null, options)).type.toBe<Promise<string | null>>()
  expect(typedBoss.send('nullable')).type.toBe<Promise<string | null>>()
  expect(typedBoss.sendAfter('reports', { reportId: 'r_1', format: 'csv' }, null, 30)).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.sendAfter('heartbeat', null, null, new Date())).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.sendThrottled('cleanup', { olderThanDays: 30 }, options, 60)).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.sendDebounced('email/send', { userId: 'user_123' }, null, 60, 'user')).type.toBe<
    Promise<string | null>
  >()
  expect(typedBoss.insert('email/send', [{ data: { userId: 'user_123' } }])).type.toBe<
    Promise<string[] | null>
  >()
  expect(typedBoss.insert('heartbeat', [{}])).type.toBe<Promise<string[] | null>>()

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.send('missing', { userId: 'user_123' })

  // @ts-expect-error Type 'number' is not assignable to type 'string'.
  typedBoss.send('email/send', { userId: 123 })

  // @ts-expect-error Object literal may only specify known properties, and 'userId' does not exist
  typedBoss.send('cleanup', { userId: 'user_123' })

  // @ts-expect-error Type '"xml"' is not assignable to type '"csv" | "pdf"'.
  typedBoss.sendAfter('reports', { reportId: 'r_1', format: 'xml' }, null, 30)

  // @ts-expect-error Property 'data' is missing
  typedBoss.insert('email/send', [{}])
})

test('asTypedPgBoss wraps fetch, find, getJobById, and work with typed job data', () => {
  const typedBoss = asTypedPgBoss<Queues>(boss)

  expect(typedBoss.fetch('email/send')).type.toBe<Promise<Job<EmailJob>[]>>()
  expect(typedBoss.fetch('cleanup', { includeMetadata: true })).type.toBe<
    Promise<JobWithMetadata<CleanupJob>[]>
  >()
  expect(typedBoss.findJobs('reports')).type.toBe<Promise<JobWithMetadata<ReportJob>[]>>()
  expect(typedBoss.getJobById('email/send', jobId)).type.toBe<
    Promise<JobWithMetadata<EmailJob> | null>
  >()
  expect(
    typedBoss.work('email/send', async (jobs) => {
      expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
    }),
  ).type.toBe<Promise<string>>()
  expect(
    typedBoss.work('cleanup', { pollingIntervalSeconds: 1 }, async (jobs) => {
      expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
    }),
  ).type.toBe<Promise<string>>()
  expect(
    typedBoss.work('reports', { includeMetadata: true }, async (jobs) => {
      expect(jobs[0]?.data.format).type.toBe<'csv' | 'pdf' | undefined>()
      expect(jobs[0]?.state).type.toBe<
        'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed' | undefined
      >()
    }),
  ).type.toBe<Promise<string>>()

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.fetch('missing')

  typedBoss.work('email/send', async (jobs) => {
    // @ts-expect-error Property 'olderThanDays' does not exist on type 'EmailJob'.
    jobs[0]?.data.olderThanDays
  })
})

test('asTypedPgBoss wraps job state commands with typed queue names', () => {
  const typedBoss = asTypedPgBoss<Queues>(boss)

  expect(typedBoss.cancel('email/send', jobId)).type.toBe<ReturnType<PgBoss['cancel']>>()
  expect(typedBoss.resume('cleanup', jobIds)).type.toBe<ReturnType<PgBoss['resume']>>()
  expect(typedBoss.retry('reports', jobId)).type.toBe<ReturnType<PgBoss['retry']>>()
  expect(typedBoss.deleteJob('heartbeat', jobIds)).type.toBe<ReturnType<PgBoss['deleteJob']>>()
  expect(typedBoss.complete('email/send', jobId, { delivered: true })).type.toBe<
    ReturnType<PgBoss['complete']>
  >()
  expect(typedBoss.fail('cleanup', jobId, { reason: 'manual' })).type.toBe<
    ReturnType<PgBoss['fail']>
  >()
  expect(typedBoss.touch('reports', jobIds)).type.toBe<ReturnType<PgBoss['touch']>>()

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.cancel('missing', jobId)

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.complete('missing', jobId)
})

test('asTypedPgBoss wraps queue management APIs with typed queue names', () => {
  const typedBoss = asTypedPgBoss<Queues>(boss)

  expect(typedBoss.createQueue('email/send')).type.toBe<ReturnType<PgBoss['createQueue']>>()
  expect(typedBoss.getBlockedKeys('cleanup')).type.toBe<ReturnType<PgBoss['getBlockedKeys']>>()
  expect(typedBoss.updateQueue('reports', { retryLimit: 5 })).type.toBe<
    ReturnType<PgBoss['updateQueue']>
  >()
  expect(typedBoss.deleteQueue('heartbeat')).type.toBe<ReturnType<PgBoss['deleteQueue']>>()
  expect(typedBoss.getQueues(['email/send', 'cleanup'])).type.toBe<
    ReturnType<PgBoss['getQueues']>
  >()
  expect(typedBoss.getQueue('email/send')).type.toBe<ReturnType<PgBoss['getQueue']>>()
  expect(typedBoss.getQueueStats('cleanup')).type.toBe<ReturnType<PgBoss['getQueueStats']>>()
  expect(typedBoss.deleteQueuedJobs('reports')).type.toBe<ReturnType<PgBoss['deleteQueuedJobs']>>()
  expect(typedBoss.deleteStoredJobs('email/send')).type.toBe<
    ReturnType<PgBoss['deleteStoredJobs']>
  >()
  expect(typedBoss.deleteAllJobs()).type.toBe<ReturnType<PgBoss['deleteAllJobs']>>()
  expect(typedBoss.deleteAllJobs('cleanup')).type.toBe<ReturnType<PgBoss['deleteAllJobs']>>()

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.createQueue('missing')

  // @ts-expect-error Type '"missing"' is not assignable
  typedBoss.getQueues(['email/send', 'missing'])
})

test('asTypedPgBoss wraps schedules and spies with typed queue names and payloads', () => {
  const typedBoss = asTypedPgBoss<Queues>(boss)

  expect(typedBoss.schedule('email/send', '0 8 * * *', { userId: 'user_123' })).type.toBe<
    Promise<void>
  >()
  expect(typedBoss.schedule('heartbeat', '* * * * *')).type.toBe<Promise<void>>()
  expect(typedBoss.schedule('heartbeat', '* * * * *', null, options)).type.toBe<Promise<void>>()
  expect(typedBoss.unschedule('cleanup', 'nightly-cleanup')).type.toBe<
    ReturnType<PgBoss['unschedule']>
  >()
  expect(typedBoss.getSchedules()).type.toBe<ReturnType<PgBoss['getSchedules']>>()
  expect(typedBoss.getSchedules('reports')).type.toBe<ReturnType<PgBoss['getSchedules']>>()
  expect(typedBoss.getSpy('email/send')).type.toBe<JobSpyInterface<EmailJob>>()

  // @ts-expect-error Type 'number' is not assignable to type 'string'.
  typedBoss.schedule('email/send', '0 8 * * *', { userId: 123 })

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.unschedule('missing')

  // @ts-expect-error Argument of type '"missing"' is not assignable to parameter
  typedBoss.getSpy('missing')
})
