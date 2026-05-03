# pg-boss-registry

Framework-agnostic typed queue registry and lifecycle helpers for
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
  asTypedPgBoss,
  definePgBossQueues,
  queue,
  setupPgBoss,
  type PgBossQueuesFromRegistry,
} from 'pg-boss-registry'

type EmailJob = {
  userId: string
}

// Define every known queue in one registry. `queue<T>()` carries the payload
// type, while `create: true` tells setupPgBoss to create it in pg-boss.
const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({ create: true }),
})

// Derive the queue map for asTypedPgBoss from the registry.
type Queues = PgBossQueuesFromRegistry<typeof queues>

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
await setupPgBoss(boss, {
  start: true,
  queueRegistry: queues,
  workers,
})

// Cast the same PgBoss instance to a typed view for queue-related APIs.
await asTypedPgBoss<Queues>(boss).send('email/send', {
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

Typed methods include `send`, `sendAfter`, `sendThrottled`, `sendDebounced`,
`insert`, `fetch`, `work`, job commands, queue commands, queue getters,
schedules, and spies.

```ts
const typedBoss = asTypedPgBoss<Queues>(boss)

await typedBoss.send('email/send', { userId: 'user_123' })
await typedBoss.fetch('email/send')
await typedBoss.schedule('email/send', '0 8 * * *', { userId: 'daily' })
```

Unknown queue names or wrong payload shapes fail at compile time.

## Development

```sh
npm install
npm run db:up
npm test
```
