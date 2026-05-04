# pg-boss-registry

[![CI](https://github.com/inyourtime/pg-boss-registry/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/inyourtime/pg-boss-registry/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/pg-boss-registry.svg?style=flat)](https://www.npmjs.com/package/pg-boss-registry)
[![Checked with Biome](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)](https://biomejs.dev)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](./LICENSE)

Typed queue registry and lifecycle helpers for
[`pg-boss`](https://github.com/timgit/pg-boss).

The library keeps the real `PgBoss` instance visible. It adds typed helpers for
queue names, payloads, workers, schedules, and registration order, so framework
plugins for Fastify, Hono, Express, NestJS, or custom workers can share the same
core definitions.

## Install

```sh
npm install pg-boss-registry pg-boss
```

## Quick Start

```ts
import { PgBoss } from 'pg-boss'
import {
  definePgBossQueues,
  queue,
  setupPgBoss,
} from 'pg-boss-registry'

type EmailJob = {
  userId: string
}

// Define every known queue in one registry. `queue<T>()` carries the payload
// type, while `create: true` tells setupPgBoss to create it in pg-boss.
const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({ create: true }),
})

// You keep ownership of the real PgBoss instance and its connection settings.
const boss = new PgBoss(process.env.POSTGRES_URL!)

// Bind workers through the registry so handler payloads match the queue.
const workers = [
  queues.worker('email/send', {
    name: 'email-worker',
    schedule: {
      cron: '0 8 * * *',
      data: {
        userId: 'daily',
      },
    },
    async handler(jobs) {
      for (const job of jobs) {
        job.data.userId
      }
    },
  }),
]

// Register queue definitions, schedules declared on workers, and workers.
// Set start: true only when this setup call should start pg-boss for you.
const setup = await setupPgBoss(boss, {
  start: true,
  queueRegistry: queues,
  workers,
})

// setup.boss is the same PgBoss instance, typed from the queue registry.
await setup.boss.send('email/send', {
  userId: 'user_123',
})
```

## Framework Integration Shape

Pass framework state through `context`. Worker factories receive the same
context, but the registry itself stays independent from any framework.

```ts
const queues = definePgBossQueues<AppContext>()({
  'email/send': queue<EmailJob>({ create: true }),
})

const worker = queues.worker('email/send', (app) => ({
  name: 'email-worker',
  async handler(jobs) {
    app.log.info({ count: jobs.length }, 'processing email jobs')
  },
}))

const setup = await setupPgBoss(boss, {
  context: app,
  start: true,
  stopOnClose: true,
  queueRegistry: queues,
  workers: [worker],
})

app.onClose(setup.close)
```

## Worker Error Handling

Workers can declare `onError` to observe handler failures with the original
error and the same jobs passed to `handler`. The original error is rethrown
after `onError` finishes, so pg-boss still applies its normal retry and failure
behavior.

```ts
const worker = queues.worker('email/send', {
  name: 'email-worker',
  async handler(jobs) {
    for (const job of jobs) {
      await sendEmail(job.data.userId)
    }
  },
  onError(error, jobs) {
    console.error({ error, jobIds: jobs.map((job) => job.id) }, 'email worker failed')
  },
})
```

## Typed pg-boss API

`asTypedPgBoss<Queues>(boss)` returns the same pg-boss object with queue-related
methods narrowed to the known registry keys and payload types. The underlying
runtime object is not wrapped.

When `setupPgBoss` receives a typed `queueRegistry`, the returned `setup.boss`
is already typed from that registry.

Typed methods include `send`, `sendAfter`, `sendThrottled`, `sendDebounced`,
`insert`, `fetch`, `work`, job commands, queue commands, queue getters,
schedules, and spies.

```ts
const typedBoss = setup.boss

await typedBoss.send('email/send', { userId: 'user_123' })
await typedBoss.fetch('email/send')
await typedBoss.schedule('email/send', '0 8 * * *', { userId: 'daily' })
```

Unknown queue names or wrong payload shapes fail at compile time.

## API Reference

### `queue<Data>(definition?)`

Declares one queue in a registry and carries the queue payload type.

```ts
const queues = definePgBossQueues({
  email: queue<{ userId: string }>({
    create: true,
    options: {
      retryLimit: 3,
    },
  }),
  heartbeat: queue<undefined>(),
})
```

Options:

| Option | Type | Description |
| --- | --- | --- |
| `create` | `boolean` | When `true`, `setupPgBoss` creates the queue through `boss.createQueue`. Defaults to not creating it. |
| `options` | `Omit<Queue, 'name'>` | Queue options passed to `boss.createQueue(name, options)` when `create` is `true`. |

`queue<undefined>()` and `queue<null>()` make `send(name)` valid without a data
argument. Other payload types require data.

### `definePgBossQueues(registry)`

Creates a typed queue registry. Registry keys become the allowed queue names for
workers and typed boss methods.

```ts
const queues = definePgBossQueues({
  email: queue<{ userId: string }>({ create: true }),
})

type Queues = PgBossQueuesFromRegistry<typeof queues>
```

Use the curried form when worker factories need a framework context type:

```ts
const queues = definePgBossQueues<AppContext>()({
  email: queue<{ userId: string }>({ create: true }),
})
```

Returned properties:

| Property | Description |
| --- | --- |
| `queues` | The original registry object. |
| `definitions` | Queue definitions generated from entries with `create: true`. |
| `worker(name, definition)` | Binds a worker definition to a known queue name and payload type. |

### `setupPgBoss(boss, options?)`

Registers queue definitions and workers against an existing `PgBoss` instance.
When `queueRegistry` is provided, the returned `setup.boss` is typed from that
registry.

```ts
const setup = await setupPgBoss(boss, {
  context: app,
  start: true,
  stopOnClose: true,
  stopOptions: { close: true },
  queueRegistry: queues,
  workers: [worker],
})
```

Options:

| Option | Type | Description |
| --- | --- | --- |
| `context` | `Context` | Value passed to worker factories. Required at runtime when any worker is a factory function. |
| `start` | `boolean` | Starts pg-boss with `boss.start()` before registration. Defaults to `false`. |
| `stopOnClose` | `boolean` | Calls `boss.stop(stopOptions)` from `setup.close()`. Defaults to `false`. |
| `stopOptions` | `StopOptions` | Options passed to `boss.stop` when `stopOnClose` is `true`. |
| `queueRegistry` | `PgBossDefinedQueueRegistry` | Creates queues from registry entries with `create: true` and types `setup.boss`. |
| `workers` | `readonly PgBossWorkerRegistration[]` | Worker definitions or worker factories registered after queue creation. |

Return value:

| Property | Description |
| --- | --- |
| `boss` | The same `PgBoss` instance. Typed as `TypedPgBoss<PgBossQueuesFromRegistry<typeof queueRegistry>>` when a typed registry is provided. |
| `workers` | Resolved worker definitions after applying worker factories. |
| `close()` | Calls `offWork` for registered workers unless disabled, then optionally stops pg-boss. Returns `Promise<void>`. |

### Worker Definitions

Workers can be registered directly or through `queues.worker(name, definition)`.
Using `queues.worker` is recommended because it ties the worker to a known queue
name and payload type.

```ts
const worker = queues.worker('email', {
  name: 'email-worker',
  enabled: true,
  includeMetadata: false,
  options: {
    pollingIntervalSeconds: 1,
  },
  schedule: '0 8 * * *',
  async handler(jobs) {
    jobs[0]?.data.userId
  },
  async onError(error, jobs) {
    console.error(error, jobs.length)
  },
})
```

Options:

| Option | Type | Description |
| --- | --- | --- |
| `name` | `string` | Human-readable worker name. Also used as the queue name for plain workers that are not created with `queues.worker`. |
| `enabled` | `boolean` | When `false`, registration and `offWork` are skipped. Defaults to enabled. |
| `includeMetadata` | `boolean` | When `true`, the handler receives `JobWithMetadata<Data>[]`; otherwise it receives `Job<Data>[]`. |
| `handler` | `WorkHandler` or `WorkWithMetadataHandler` | Worker handler passed to `boss.work`. Payload data is typed from the queue. |
| `onError` | `(error, jobs) => void | Promise<void>` | Called when `handler` throws. The original error is rethrown after this hook. |
| `options` | `WorkOptions` | Options passed to `boss.work`. Put `includeMetadata` on the worker itself, not inside `options`. |
| `schedule` | `PgBossWorkerScheduleDefinition<Data>` | Optional schedule created before registering the worker. |
| `offWorkOnClose` | `boolean` | When `false`, `setup.close()` will not call `boss.offWork` for this worker. Defaults to `true`. |
| `offWorkOptions` | `OffWorkOptions` | Options passed to `boss.offWork` from `setup.close()`. |

Worker factories receive `setupPgBoss` context:

```ts
const worker = queues.worker('email', (app) => ({
  name: 'email-worker',
  async handler(jobs) {
    app.log.info({ count: jobs.length })
  },
}))
```

### Worker Schedules

`worker.schedule` can be a cron string or an object.

```ts
const worker = queues.worker('email', {
  name: 'email-worker',
  schedule: {
    cron: '0 8 * * *',
    data: { userId: 'daily' },
    enabled: true,
    key: 'daily-email',
    name: 'email',
    options: {},
    tz: 'UTC',
  },
  async handler() {},
})
```

Options:

| Option | Type | Description |
| --- | --- | --- |
| `cron` | `string` | Cron expression passed to `boss.schedule`. Required for object schedules. |
| `data` | `Data` | Scheduled job payload. Typed from the queue payload. `undefined` becomes `null` for pg-boss. |
| `enabled` | `boolean` | When `false`, the schedule is skipped. Defaults to enabled. |
| `key` | `string` | Schedule key. Merged into schedule options as `options.key`. |
| `name` | `string` | Queue name to schedule. Defaults to the worker queue. |
| `options` | `ScheduleOptions` | Options passed to `boss.schedule`. |
| `tz` | `string` | Shortcut for `options.tz`. |

### Plain Schedule Definitions

Use `registerPgBossSchedule` or `registerPgBossSchedules` when you want to
register schedules outside worker definitions.

```ts
await registerPgBossSchedule(boss, {
  name: 'email',
  cron: '0 8 * * *',
  data: { userId: 'daily' },
  enabled: true,
  key: 'daily-email',
  options: {},
})
```

Options:

| Option | Type | Description |
| --- | --- | --- |
| `name` | `string` | Queue name passed to `boss.schedule`. |
| `cron` | `string` | Cron expression passed to `boss.schedule`. |
| `data` | `Data` | Scheduled job payload. `undefined` becomes `null` for pg-boss. |
| `enabled` | `boolean` | When `false`, registration is skipped. Defaults to enabled. |
| `key` | `string` | Schedule key. Merged into schedule options as `options.key`. |
| `options` | `ScheduleOptions` | Options passed to `boss.schedule`. |

### Typed Boss Methods

`TypedPgBoss<Queues>` narrows queue names and payloads for these pg-boss APIs:

| Group | Methods |
| --- | --- |
| Send jobs | `send`, `sendAfter`, `sendThrottled`, `sendDebounced`, `insert` |
| Read jobs | `fetch`, `findJobs`, `getJobById` |
| Work jobs | `work` |
| Job state | `cancel`, `resume`, `retry`, `deleteJob`, `complete`, `fail`, `touch` |
| Queues | `createQueue`, `updateQueue`, `deleteQueue`, `getQueue`, `getQueues`, `getQueueStats`, `getBlockedKeys` |
| Delete jobs | `deleteQueuedJobs`, `deleteStoredJobs`, `deleteAllJobs` |
| Schedules and spies | `schedule`, `unschedule`, `getSchedules`, `getSpy` |

Use `asTypedPgBoss<Queues>(boss)` when you need a typed view without calling
`setupPgBoss` with a registry:

```ts
const typedBoss = asTypedPgBoss<Queues>(boss)
```

### Registration Helpers

Lower-level helpers are exported for framework adapters or custom lifecycles:

| Helper | Description |
| --- | --- |
| `registerPgBossQueue(boss, queue)` | Creates one queue from a string or `Queue` definition. |
| `registerPgBossQueues(boss, queues)` | Creates many queues in order. |
| `registerPgBossSchedule(boss, schedule)` | Registers one schedule unless `enabled` is `false`. |
| `registerPgBossSchedules(boss, schedules)` | Registers many schedules in order. |
| `registerPgBossWorker(boss, worker)` | Registers one worker and its inline schedule unless `enabled` is `false`. |
| `registerPgBossWorkers(boss, workers)` | Registers many workers in order. |
| `closePgBossWorkers(boss, workers)` | Calls `offWork` for workers unless disabled. |
| `getPgBossWorkerSchedule(worker)` | Converts a worker schedule into a plain schedule definition. |
| `resolvePgBossWorkerDefinition(context, worker)` | Resolves a worker definition or factory. |

## Development

```sh
npm install
npm run db:up
npm test
```
