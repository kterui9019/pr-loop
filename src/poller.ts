import { logger } from "./logger.ts"
import type { PrLoopConfig, PrInfo, TodoItem } from "./types.ts"
import {
  fetchIssueComments,
  fetchReviewComments,
  fetchReviews,
  fetchPrStatus,
} from "./github.ts"
import {
  readState,
  writeState,
  clearState,
  updateLastChecked,
  addProcessedCommentId,
  incrementTasksCompleted,
} from "./state.ts"
import {
  readTodos,
  writeTodos,
  addTodos,
  getNextPendingTodo,
  markTodoInProgress,
  markTodoCompleted,
  createTodoFromIssueComment,
  createTodoFromReviewComment,
  createTodoFromReview,
} from "./todo.ts"
import { executeTask } from "./executor.ts"

export async function startPollingLoop(
  pr: PrInfo,
  config: PrLoopConfig,
  signal: AbortSignal,
): Promise<void> {
  const cwd = process.cwd()

  logger.info(`ポーリングループ開始: PR #${pr.number}`)
  logger.info(`エージェント: ${config.agent} | 間隔: ${config.pollingIntervalSeconds}秒`)
  logger.info(`自分: @${config.selfUser}`)

  while (!signal.aborted) {
    try {
      const shouldContinue = await runOneCycle(pr, config, cwd, signal)
      if (!shouldContinue) {
        logger.info("ポーリングループ終了")
        return
      }
    } catch (err) {
      if (signal.aborted) break
      logger.error("ポーリングサイクルでエラー:", err)
    }

    if (signal.aborted) break

    logger.poll(`次のポーリングまで ${config.pollingIntervalSeconds}秒 待機中...`)
    await sleep(config.pollingIntervalSeconds * 1000, signal)
  }

  logger.info("ポーリングループがキャンセルされました")
}

async function runOneCycle(
  pr: PrInfo,
  config: PrLoopConfig,
  cwd: string,
  signal: AbortSignal,
): Promise<boolean> {
  logger.poll("PRの状態を確認中...")
  const prStatus = await fetchPrStatus(pr.owner, pr.repo, pr.number)

  if (prStatus.state === "closed" && prStatus.merged) {
    logger.success("PR がマージされました！")
    await writeTodos(cwd, [])
    await clearState(cwd)
    return false
  }

  if (prStatus.state === "closed") {
    logger.warn("PR がクローズされました（マージなし）")
    await clearState(cwd)
    return false
  }

  let state = await readState(cwd)
  if (!state || !state.active) {
    logger.warn("ループ状態が無効です。終了します。")
    return false
  }

  logger.poll("新しいコメントを取得中...")
  const since = state.lastCheckedAt

  const [issueComments, reviewComments, reviews] = await Promise.all([
    fetchIssueComments(pr.owner, pr.repo, pr.number, since),
    fetchReviewComments(pr.owner, pr.repo, pr.number, since),
    fetchReviews(pr.owner, pr.repo, pr.number, since),
  ])

  const filteredIssue = issueComments.filter(
    (c) => c.user.login !== config.selfUser && c.user.type !== "Bot",
  )
  const filteredReview = reviewComments.filter(
    (c) => c.user.login !== config.selfUser && c.user.type !== "Bot",
  )
  const filteredReviews = reviews.filter(
    (r) =>
      r.user.login !== config.selfUser &&
      r.user.type !== "Bot" &&
      r.body.trim().length > 0 &&
      (r.state === "CHANGES_REQUESTED" || r.state === "COMMENTED"),
  )

  const processedIds = new Set(state.processedCommentIds)
  const newIssue = filteredIssue.filter((c) => !processedIds.has(c.id))
  const newReview = filteredReview.filter((c) => !processedIds.has(c.id))
  const newReviews = filteredReviews.filter((r) => !processedIds.has(r.id))

  const newTodos: TodoItem[] = [
    ...newIssue.map(createTodoFromIssueComment),
    ...newReview.map(createTodoFromReviewComment),
    ...newReviews.map(createTodoFromReview),
  ]

  if (newTodos.length > 0) {
    logger.info(`新しいタスク ${newTodos.length}件 を検出`)
  } else {
    logger.poll("新しいタスクなし")
  }

  let todos = await readTodos(cwd)
  todos = addTodos(todos, newTodos)
  await writeTodos(cwd, todos)

  for (const c of newIssue) {
    state = addProcessedCommentId(state, c.id)
  }
  for (const c of newReview) {
    state = addProcessedCommentId(state, c.id)
  }
  for (const r of newReviews) {
    state = addProcessedCommentId(state, r.id)
  }

  state = updateLastChecked(state)
  await writeState(cwd, state)

  const nextTodo = getNextPendingTodo(todos)
  if (!nextTodo) {
    logger.poll("実行するタスクなし")
    return true
  }

  if (state.totalTasksCompleted >= config.maxTasks) {
    logger.warn(`最大タスク数 (${config.maxTasks}) に到達。新規タスクの実行を停止。`)
    return true
  }

  if (signal.aborted) return true

  logger.info(`タスク実行開始: ${nextTodo.id}`)
  todos = markTodoInProgress(todos, nextTodo.id)
  await writeTodos(cwd, todos)

  const result = await executeTask(nextTodo, config.agent, config.systemPrompt, signal)

  todos = markTodoCompleted(todos, nextTodo.id, result.success ? extractCommitHash(result.stdout) : undefined)
  await writeTodos(cwd, todos)

  state = incrementTasksCompleted(state)
  await writeState(cwd, state)

  if (result.success) {
    logger.success(`タスク完了: ${nextTodo.id}`)
  } else {
    logger.warn(`タスク失敗: ${nextTodo.id} (exit: ${result.exitCode})`)
  }

  return true
}

function extractCommitHash(output: string): string | undefined {
  const match = output.match(/\b([0-9a-f]{7,40})\b/i)
  return match?.[1]
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)

    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }

    if (signal.aborted) {
      clearTimeout(timer)
      resolve()
      return
    }

    signal.addEventListener("abort", onAbort, { once: true })
  })
}
