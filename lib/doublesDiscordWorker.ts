import { boardMessagePlan, boardReplacementPlan, createSignedInteractionId, fixtureThreadPlan, type DivisionDiscordMapping, type FixtureDiscordMapping } from "./doublesDiscordRuntime.ts"

export type WorkerEvent = "ARRANGE_UPDATED" | "MATCH_SET" | "BOARD_REFRESH" | "SCORECARD_UPDATED" | "RESULT_COMPLETED"

export function buildSubmitScorecardComponent(input: { fixtureId: string; secret: string; expiresAt: number }) {
  return { type: 1, components: [{ type: 2, style: 2, label: "SUBMIT SCORECARD", custom_id: createSignedInteractionId({ fixtureId: input.fixtureId, action: "scorecard", expiresAt: input.expiresAt }, input.secret) }] }
}

export type DiscordWorkerStore = {
  getDivision: (seasonId: string, division: string) => Promise<DivisionDiscordMapping | null>
  saveDivision: (mapping: DivisionDiscordMapping) => Promise<void>
  getFixture: (fixtureId: string) => Promise<FixtureDiscordMapping | null>
  saveFixture: (mapping: FixtureDiscordMapping) => Promise<void>
}

export type DiscordWorkerTransport = {
  createMessage: (channelId: string, payload: unknown) => Promise<{ messageId: string; channelId: string }>
  editMessage: (channelId: string, messageId: string, payload: unknown) => Promise<void>
  createThread: (channelId: string, name: string) => Promise<{ threadId: string; channelId: string }>
  sendThreadStarter: (threadId: string, payload: unknown) => Promise<{ messageId: string }>
  archiveThread: (threadId: string) => Promise<void>
  deleteMessage: (channelId: string, messageId: string) => Promise<void>
}

export type DoublesDiscordWorkerInput = {
  enabled: boolean
  testMode?: boolean
  seasonId: string
  division: string
  channelId: string
  fixtureId?: string
  arrangementState?: string
  boardPayload?: unknown
  arrangePayload?: unknown
  threadPayload?: unknown
  threadName?: string
}

export class DoublesDiscordWorker {
  private readonly store: DiscordWorkerStore
  private readonly transport: DiscordWorkerTransport

  constructor(store: DiscordWorkerStore, transport: DiscordWorkerTransport) {
    this.store = store
    this.transport = transport
  }

  async process(input: DoublesDiscordWorkerInput, event: WorkerEvent) {
    if (!input.enabled && !input.testMode) return { status: "DISABLED" as const }
    if (event === "ARRANGE_UPDATED") return this.updateArrange(input)
    if (event === "BOARD_REFRESH" || event === "SCORECARD_UPDATED" || event === "RESULT_COMPLETED") return this.refreshBoard(input, event === "RESULT_COMPLETED")
    if (event === "MATCH_SET") return this.ensureThread(input)
    return { status: "IGNORED" as const }
  }

  private async updateArrange(input: DoublesDiscordWorkerInput) {
    const current = await this.store.getDivision(input.seasonId, input.division)
    const plan = current?.arrangeMessageId ? { operation: "EDIT" as const, messageId: current.arrangeMessageId, channelId: input.channelId } : { operation: "CREATE" as const, messageId: null, channelId: input.channelId }
    if (plan.operation === "EDIT") await this.transport.editMessage(plan.channelId, plan.messageId, input.arrangePayload)
    else {
      const created = await this.transport.createMessage(plan.channelId, input.arrangePayload)
      if (created.channelId !== plan.channelId) throw new Error("Discord returned an unexpected Arrange destination")
      const next = { seasonId: input.seasonId, division: input.division, arrangeChannelId: created.channelId, arrangeMessageId: created.messageId, boardChannelId: current?.boardChannelId ?? null, boardMessageId: current?.boardMessageId ?? null, status: input.testMode ? "TEST" as const : "ACTIVE" as const }
      await this.store.saveDivision(next)
      return { status: "SYNCED" as const, operation: "CREATE" as const, messageId: created.messageId }
    }
    return { status: "SYNCED" as const, operation: "EDIT" as const, messageId: plan.messageId }
  }

  private async refreshBoard(input: DoublesDiscordWorkerInput, completed: boolean) {
    const current = await this.store.getDivision(input.seasonId, input.division)
    const plan = boardMessagePlan(current, input.channelId)
    if (plan.operation === "EDIT" && plan.messageId) {
      try {
        await this.transport.editMessage(plan.channelId, plan.messageId, input.boardPayload)
        return { status: "SYNCED" as const, operation: "EDIT" as const, messageId: plan.messageId, completed }
      } catch (error) {
        if (!(error instanceof Error) || !/attachment|method|not.?supported/i.test(error.message)) throw error
      }
      const replacement = await this.transport.createMessage(plan.channelId, input.boardPayload)
      const replacementPlan = boardReplacementPlan({ existingMessageId: plan.messageId, newMessageId: replacement.messageId, newMessageCreated: true })
      const next = { ...(current as DivisionDiscordMapping), boardChannelId: replacement.channelId, boardMessageId: replacementPlan.mappingMessageId }
      await this.store.saveDivision(next)
      if (replacementPlan.deleteOld && current?.boardMessageId) await this.transport.deleteMessage(plan.channelId, current.boardMessageId)
      return { status: "SYNCED" as const, operation: "REPLACE" as const, messageId: replacement.messageId, completed }
    }
    const created = await this.transport.createMessage(plan.channelId, input.boardPayload)
    const next = { seasonId: input.seasonId, division: input.division, arrangeChannelId: current?.arrangeChannelId ?? null, arrangeMessageId: current?.arrangeMessageId ?? null, boardChannelId: created.channelId, boardMessageId: created.messageId, status: input.testMode ? "TEST" as const : "ACTIVE" as const }
    await this.store.saveDivision(next)
    return { status: "SYNCED" as const, operation: "CREATE" as const, messageId: created.messageId, completed }
  }

  private async ensureThread(input: DoublesDiscordWorkerInput) {
    if (!input.fixtureId) throw new Error("fixtureId is required for MATCH SET")
    const current = await this.store.getFixture(input.fixtureId)
    const plan = fixtureThreadPlan({ arrangementState: input.arrangementState || "NOT ARRANGED", mapping: current })
    if (plan.operation === "WAIT") return { status: "WAITING" as const }
    if (plan.operation === "REUSE") return { status: "REUSED" as const, threadId: plan.threadId }
    const thread = await this.transport.createThread(input.channelId, input.threadName || `Doubles · ${input.division} · ${input.fixtureId}`)
    const initial = { fixtureId: input.fixtureId, threadId: thread.threadId, threadChannelId: thread.channelId, starterMessageId: null, matchImageMessageId: null, submitComponentMessageId: null, state: input.testMode ? "TEST" as const : "MATCH_SET" as const }
    await this.store.saveFixture(initial)
    const starter = await this.transport.sendThreadStarter(thread.threadId, input.threadPayload)
    const completed = { ...initial, starterMessageId: starter.messageId, matchImageMessageId: starter.messageId, submitComponentMessageId: starter.messageId }
    await this.store.saveFixture(completed)
    return { status: "CREATED" as const, threadId: thread.threadId, starterMessageId: starter.messageId }
  }
}
