import type {
  FetchOptions,
  FindJobsOptions,
  Job,
  JobInsert,
  JobSpyInterface,
  JobWithMetadata,
  OffWorkOptions,
  PgBoss,
  Queue,
  ScheduleOptions,
  SendOptions,
  StopOptions,
  WorkHandler,
  WorkOptions,
  WorkWithMetadataHandler,
} from 'pg-boss'

export type PgBossQueueValue = object | null | undefined
export type PgBossQueueMap = Record<string, PgBossQueueValue>

export type PgBossQueueDefinition = string | Queue

export type PgBossQueueConfig<Data = object> = {
  /**
   * Create this queue while registering the registry.
   * When false or omitted, the queue is typed but not created.
   */
  create?: boolean
  /**
   * Queue options used when create is true.
   */
  options?: Omit<Queue, 'name'>
  /**
   * Phantom field used only to carry the queue payload type.
   */
  readonly __data?: Data
}

export type PgBossQueueRegistry = Record<string, PgBossQueueConfig<any>>

type RegistryQueueData<Definition> = Definition extends PgBossQueueConfig<infer Data> ? Data : never

type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false

type QueueData<
  Queues extends PgBossQueueMap,
  QueueName extends keyof Queues & string,
> = Queues[QueueName]

type QueueDataForPgBoss<Data> =
  Exclude<Data, undefined> extends never ? null : Exclude<Data, undefined>

type QueueDataArgs<Data, Options> = undefined extends Data
  ? [data?: QueueDataForPgBoss<Data>, options?: Options]
  : null extends Data
    ? [data?: QueueDataForPgBoss<Data>, options?: Options]
    : [data: QueueDataForPgBoss<Data>, options?: Options]

type QueueDataRequest<Data, Options> = undefined extends Data
  ? {
      data?: QueueDataForPgBoss<Data>
      options?: Options
    }
  : null extends Data
    ? {
        data?: QueueDataForPgBoss<Data>
        options?: Options
      }
    : {
        data: QueueDataForPgBoss<Data>
        options?: Options
      }

type TypedJobInsert<Data> = Omit<JobInsert<QueueDataForPgBoss<Data>>, 'data'> &
  (undefined extends Data
    ? { data?: QueueDataForPgBoss<Data> }
    : null extends Data
      ? { data?: QueueDataForPgBoss<Data> }
      : { data: QueueDataForPgBoss<Data> })

export type TypedPgBossQueueName<Queues extends PgBossQueueMap> = keyof Queues & string

export type PgBossTypedSendRequest<
  Queues extends PgBossQueueMap,
  QueueName extends TypedPgBossQueueName<Queues> = TypedPgBossQueueName<Queues>,
> =
  QueueName extends TypedPgBossQueueName<Queues>
    ? {
        name: QueueName
      } & QueueDataRequest<QueueData<Queues, QueueName>, SendOptions>
    : never

export type PgBossTypedSend<Queues extends PgBossQueueMap> = {
  <QueueName extends TypedPgBossQueueName<Queues>>(
    request: PgBossTypedSendRequest<Queues, QueueName>,
  ): Promise<string | null>
  <QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    ...args: QueueDataArgs<QueueData<Queues, QueueName>, SendOptions>
  ): Promise<string | null>
}

export type PgBossTypedSendAfter<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  data: QueueDataForPgBoss<QueueData<Queues, QueueName>>,
  options: SendOptions | null,
  date: Date | string | number,
) => Promise<string | null>

export type PgBossTypedInsert<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  jobs: TypedJobInsert<QueueData<Queues, QueueName>>[],
  options?: Parameters<PgBoss['insert']>[2],
) => Promise<string[] | null>

export type PgBossTypedFetch<Queues extends PgBossQueueMap> = {
  <QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    options: FetchOptions & { includeMetadata: true },
  ): Promise<JobWithMetadata<QueueDataForPgBoss<QueueData<Queues, QueueName>>>[]>
  <QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    options?: FetchOptions,
  ): Promise<Job<QueueDataForPgBoss<QueueData<Queues, QueueName>>>[]>
}

export type PgBossTypedWork<Queues extends PgBossQueueMap> = {
  <QueueName extends TypedPgBossQueueName<Queues>, ResData = any>(
    name: QueueName,
    handler: WorkHandler<QueueDataForPgBoss<QueueData<Queues, QueueName>>, ResData>,
  ): Promise<string>
  <QueueName extends TypedPgBossQueueName<Queues>, ResData = any>(
    name: QueueName,
    options: WorkOptions & { includeMetadata: true },
    handler: WorkWithMetadataHandler<QueueDataForPgBoss<QueueData<Queues, QueueName>>, ResData>,
  ): Promise<string>
  <QueueName extends TypedPgBossQueueName<Queues>, ResData = any>(
    name: QueueName,
    options: WorkOptions,
    handler: WorkHandler<QueueDataForPgBoss<QueueData<Queues, QueueName>>, ResData>,
  ): Promise<string>
}

export type PgBossTypedWorkWithMetadata<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
  ResData = any,
>(
  name: QueueName,
  options: WorkOptions & { includeMetadata: true },
  handler: WorkWithMetadataHandler<QueueDataForPgBoss<QueueData<Queues, QueueName>>, ResData>,
) => Promise<string>

export type PgBossTypedFindJobs<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  options?: FindJobsOptions,
) => Promise<JobWithMetadata<QueueDataForPgBoss<QueueData<Queues, QueueName>>>[]>

export type PgBossTypedGetJobById<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  id: string,
  options?: Parameters<PgBoss['getJobById']>[2],
) => Promise<JobWithMetadata<QueueDataForPgBoss<QueueData<Queues, QueueName>>> | null>

export type PgBossTypedSchedule<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  cron: string,
  ...args: QueueDataArgs<QueueData<Queues, QueueName>, ScheduleOptions>
) => Promise<void>

export type PgBossTypedQueueCommand<Queues extends PgBossQueueMap> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
  id: string | string[],
  ...args: unknown[]
) => Promise<unknown>

export type PgBossTypedQueueGetter<Queues extends PgBossQueueMap, Result> = <
  QueueName extends TypedPgBossQueueName<Queues>,
>(
  name: QueueName,
) => Promise<Result>

export type TypedPgBoss<Queues extends PgBossQueueMap> = Omit<
  PgBoss,
  | 'cancel'
  | 'complete'
  | 'createQueue'
  | 'deleteAllJobs'
  | 'deleteJob'
  | 'deleteQueue'
  | 'deleteQueuedJobs'
  | 'deleteStoredJobs'
  | 'fail'
  | 'fetch'
  | 'findJobs'
  | 'getBlockedKeys'
  | 'getJobById'
  | 'getQueue'
  | 'getQueueStats'
  | 'getQueues'
  | 'getSchedules'
  | 'getSpy'
  | 'insert'
  | 'resume'
  | 'retry'
  | 'schedule'
  | 'send'
  | 'sendAfter'
  | 'sendDebounced'
  | 'sendThrottled'
  | 'touch'
  | 'unschedule'
  | 'updateQueue'
  | 'work'
> & {
  send: PgBossTypedSend<Queues>
  sendAfter: PgBossTypedSendAfter<Queues>
  sendThrottled<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    data: QueueDataForPgBoss<QueueData<Queues, QueueName>>,
    options: SendOptions | null,
    seconds: number,
    key?: string,
  ): Promise<string | null>
  sendDebounced<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    data: QueueDataForPgBoss<QueueData<Queues, QueueName>>,
    options: SendOptions | null,
    seconds: number,
    key?: string,
  ): Promise<string | null>
  insert: PgBossTypedInsert<Queues>
  fetch: PgBossTypedFetch<Queues>
  work: PgBossTypedWork<Queues>
  cancel<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    options?: Parameters<PgBoss['cancel']>[2],
  ): ReturnType<PgBoss['cancel']>
  resume<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    options?: Parameters<PgBoss['resume']>[2],
  ): ReturnType<PgBoss['resume']>
  retry<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    options?: Parameters<PgBoss['retry']>[2],
  ): ReturnType<PgBoss['retry']>
  deleteJob<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    options?: Parameters<PgBoss['deleteJob']>[2],
  ): ReturnType<PgBoss['deleteJob']>
  complete<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    data?: object | null,
    options?: Parameters<PgBoss['complete']>[3],
  ): ReturnType<PgBoss['complete']>
  fail<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    data?: object | null,
    options?: Parameters<PgBoss['fail']>[3],
  ): ReturnType<PgBoss['fail']>
  touch<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    id: string | string[],
    options?: Parameters<PgBoss['touch']>[2],
  ): ReturnType<PgBoss['touch']>
  getJobById: PgBossTypedGetJobById<Queues>
  findJobs: PgBossTypedFindJobs<Queues>
  createQueue<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    options?: Omit<Queue, 'name'>,
  ): ReturnType<PgBoss['createQueue']>
  getBlockedKeys<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['getBlockedKeys']>
  updateQueue<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    options?: Parameters<PgBoss['updateQueue']>[1],
  ): ReturnType<PgBoss['updateQueue']>
  deleteQueue<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['deleteQueue']>
  getQueues(names?: TypedPgBossQueueName<Queues>[]): ReturnType<PgBoss['getQueues']>
  getQueue<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['getQueue']>
  getQueueStats<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['getQueueStats']>
  deleteQueuedJobs<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['deleteQueuedJobs']>
  deleteStoredJobs<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): ReturnType<PgBoss['deleteStoredJobs']>
  deleteAllJobs<QueueName extends TypedPgBossQueueName<Queues>>(
    name?: QueueName,
  ): ReturnType<PgBoss['deleteAllJobs']>
  schedule: PgBossTypedSchedule<Queues>
  unschedule<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
    key?: string,
  ): ReturnType<PgBoss['unschedule']>
  getSchedules<QueueName extends TypedPgBossQueueName<Queues>>(
    name?: QueueName,
    key?: string,
  ): ReturnType<PgBoss['getSchedules']>
  getSpy<QueueName extends TypedPgBossQueueName<Queues>>(
    name: QueueName,
  ): JobSpyInterface<QueueDataForPgBoss<QueueData<Queues, QueueName>>>
}

export type PgBossWorkerScheduleDefinition<Data = object> =
  | string
  | {
      cron: string
      data?: QueueDataForPgBoss<Data>
      enabled?: boolean
      key?: string
      /**
       * Override the scheduled queue name. Defaults to the worker queue.
       */
      name?: string
      options?: ScheduleOptions
      /**
       * Shortcut for options.tz.
       */
      tz?: string
    }

export type PgBossWorkerErrorHandler<ReqData = object> = (
  error: unknown,
  jobs: Job<QueueDataForPgBoss<ReqData>>[],
) => void | Promise<void>

export type PgBossWorkerWithMetadataErrorHandler<ReqData = object> = (
  error: unknown,
  jobs: JobWithMetadata<QueueDataForPgBoss<ReqData>>[],
) => void | Promise<void>

type PgBossWorkerBaseDefinition<ReqData = object, ResData = any> = {
  enabled?: boolean
  /**
   * Human-readable worker name.
   */
  name: string
  offWorkOnClose?: boolean
  offWorkOptions?: OffWorkOptions
  /**
   * Schedule this worker's queue without declaring a separate schedules entry.
   */
  schedule?: PgBossWorkerScheduleDefinition<ReqData>
} & (
  | {
      includeMetadata?: false
      handler: WorkHandler<QueueDataForPgBoss<ReqData>, ResData>
      /**
       * Called when the worker handler throws. The original error is rethrown
       * after this hook so pg-boss can keep its retry/failure behavior.
       */
      onError?: PgBossWorkerErrorHandler<ReqData>
      options?: WorkOptions
    }
  | {
      includeMetadata: true
      handler: WorkWithMetadataHandler<QueueDataForPgBoss<ReqData>, ResData>
      /**
       * Called when the worker handler throws. The original error is rethrown
       * after this hook so pg-boss can keep its retry/failure behavior.
       */
      onError?: PgBossWorkerWithMetadataErrorHandler<ReqData>
      options?: WorkOptions & { includeMetadata: true }
    }
)

export type PgBossWorkerDefinition<ReqData = object, ResData = any> = PgBossWorkerBaseDefinition<
  ReqData,
  ResData
>

export type PgBossWorkerDefinitionFactory<Context = unknown, ReqData = object, ResData = any> = (
  context: Context,
) => PgBossWorkerDefinition<ReqData, ResData>

export type PgBossWorkerRegistration<Context = unknown, ReqData = object, ResData = any> =
  | PgBossWorkerDefinition<ReqData, ResData>
  | PgBossWorkerDefinitionFactory<Context, ReqData, ResData>

export type PgBossQueueRegistryWorkerOptions<
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = PgBossWorkerBaseDefinition<RegistryQueueData<Registry[QueueName]>, ResData> & {
  queue?: never
}

export type PgBossQueueRegistryWorker<
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = PgBossWorkerDefinition<RegistryQueueData<Registry[QueueName]>, ResData> & {
  queue: QueueName
}

export type PgBossQueueRegistryWorkerFactory<
  Context,
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = (context: Context) => PgBossQueueRegistryWorker<Registry, QueueName, ResData>

type PgBossQueueRegistryWorkerBuilder<Registry extends PgBossQueueRegistry> = <
  const QueueName extends keyof Registry & string,
  ResData = any,
>(
  name: QueueName,
  definition: PgBossQueueRegistryWorkerOptions<Registry, QueueName, ResData>,
) => PgBossQueueRegistryWorker<Registry, QueueName, ResData>

type PgBossQueueRegistryWorkerFactoryBuilder<Context, Registry extends PgBossQueueRegistry> = <
  const QueueName extends keyof Registry & string,
  ResData = any,
>(
  name: QueueName,
  definition: (context: Context) => PgBossQueueRegistryWorkerOptions<Registry, QueueName, ResData>,
) => PgBossQueueRegistryWorkerFactory<Context, Registry, QueueName, ResData>

type PgBossQueueRegistryInferredWorkerFactoryBuilder<Registry extends PgBossQueueRegistry> = <
  WorkerContext,
  const QueueName extends keyof Registry & string,
  ResData = any,
>(
  name: QueueName,
  definition: (
    context: WorkerContext,
  ) => PgBossQueueRegistryWorkerOptions<Registry, QueueName, ResData>,
) => PgBossQueueRegistryWorkerFactory<WorkerContext, Registry, QueueName, ResData>

export type PgBossDefinedQueueRegistry<Registry extends PgBossQueueRegistry, Context = unknown> = {
  readonly queues: Registry
  readonly definitions: readonly PgBossQueueDefinition[]
  worker: PgBossQueueRegistryWorkerBuilder<Registry> &
    (IsUnknown<Context> extends true
      ? PgBossQueueRegistryInferredWorkerFactoryBuilder<Registry>
      : PgBossQueueRegistryWorkerFactoryBuilder<Context, Registry>)
}

export type PgBossQueuesFromRegistry<Registry> =
  Registry extends PgBossDefinedQueueRegistry<infer Definitions, any>
    ? {
        [QueueName in keyof Definitions & string]: RegistryQueueData<Definitions[QueueName]>
      }
    : Registry extends PgBossQueueRegistry
      ? {
          [QueueName in keyof Registry & string]: RegistryQueueData<Registry[QueueName]>
        }
      : never

export type PgBossScheduleDefinition<Data = object> = {
  data?: QueueDataForPgBoss<Data>
  enabled?: boolean
  key?: string
  name: string
  options?: ScheduleOptions
  cron: string
}

export type PgBossRegistrySetupOptions<Context = unknown> = {
  context?: Context
  /**
   * Start pg-boss before queue, schedule, and worker registration.
   * Defaults to false so framework integrations can choose their own lifecycle.
   */
  start?: boolean
  /**
   * Stop pg-boss when the returned setup handle is closed.
   * Defaults to false.
   */
  stopOnClose?: boolean
  stopOptions?: StopOptions
  /**
   * Typed queue registry used to create queues and derive worker/send payload types.
   */
  queueRegistry?: Pick<PgBossDefinedQueueRegistry<any, any>, 'definitions'>
  /**
   * Register workers after queue registry definitions.
   */
  workers?: readonly PgBossWorkerRegistration<Context, any, any>[]
}
