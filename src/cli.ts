import { logger } from "./logger.ts"
import { loadConfig, mergeConfigWithArgs } from "./config.ts"
import { detectCurrentPr } from "./pr.ts"
import { fetchSelfUser } from "./github.ts"
import { readState, writeState, clearState, createInitialState } from "./state.ts"
import { readTodos } from "./todo.ts"
import { startPollingLoop } from "./poller.ts"

interface StartArgs {
  readonly agent?: string
  readonly interval?: number
  readonly systemPrompt?: string
  readonly maxTasks?: number
}

export async function handleStart(args: StartArgs): Promise<void> {
  const cwd = process.cwd()

  const existingState = await readState(cwd)
  if (existingState?.active) {
    logger.error("既にpr-loopが実行中です。`pr-loop stop`で停止してから再実行してください。")
    process.exit(1)
  }

  let config = await loadConfig()
  config = mergeConfigWithArgs(config, args)

  if (!config.selfUser) {
    logger.info("GitHub認証ユーザーを取得中...")
    const selfUser = await fetchSelfUser()
    config = { ...config, selfUser }
  }

  logger.info("PRを検出中...")
  const pr = await detectCurrentPr(cwd)
  logger.success(`PR #${pr.number} を検出: ${pr.url}`)

  const state = createInitialState(pr.number, pr.owner, pr.repo)
  await writeState(cwd, state)

  const ctrl = new AbortController()
  let isShuttingDown = false

  function shutdown(signal: string): void {
    if (isShuttingDown) return
    isShuttingDown = true
    logger.info(`[${signal}] グレースフルシャットダウン中...`)
    ctrl.abort()
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGHUP", () => process.exit())

  try {
    await startPollingLoop(pr, config, ctrl.signal)
  } finally {
    logger.info("pr-loop 終了")
  }
}

export async function handleStatus(): Promise<void> {
  const cwd = process.cwd()
  const state = await readState(cwd)

  if (!state) {
    console.log("pr-loop は実行されていません。")
    return
  }

  console.log(`=== PR Loop Status ===`)
  console.log(`Active: ${state.active}`)
  console.log(`PR: #${state.prNumber} (${state.owner}/${state.repo})`)
  console.log(`Started: ${state.startedAt}`)
  console.log(`Last Checked: ${state.lastCheckedAt}`)
  console.log(`Tasks Completed: ${state.totalTasksCompleted}`)
  console.log(`Processed Comments: ${state.processedCommentIds.length}`)
  console.log()

  const todos = await readTodos(cwd)
  const pending = todos.filter((t) => t.status === "pending")
  const inProgress = todos.filter((t) => t.status === "in_progress")
  const completed = todos.filter((t) => t.status === "completed")

  console.log(`=== Todo List ===`)
  console.log(`Pending: ${pending.length} | In Progress: ${inProgress.length} | Completed: ${completed.length}`)

  if (pending.length > 0) {
    console.log()
    console.log("Pending:")
    for (const todo of pending) {
      console.log(`  - [${todo.id}] @${todo.author}: ${todo.summary.slice(0, 80)}`)
    }
  }

  if (inProgress.length > 0) {
    console.log()
    console.log("In Progress:")
    for (const todo of inProgress) {
      console.log(`  - [${todo.id}] @${todo.author}: ${todo.summary.slice(0, 80)}`)
    }
  }
}

export async function handleStop(): Promise<void> {
  const cwd = process.cwd()
  const state = await readState(cwd)

  if (!state || !state.active) {
    console.log("pr-loop は実行されていません。")
    return
  }

  await clearState(cwd)
  logger.success("pr-loop を停止しました。")
}
