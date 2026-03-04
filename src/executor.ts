import { logger } from "./logger.ts"
import type { AgentType, TodoItem } from "./types.ts"

export interface ExecutorResult {
  readonly success: boolean
  readonly exitCode: number
  readonly stdout: string
}

export async function executeTask(
  todo: TodoItem,
  agent: AgentType,
  systemPrompt: string,
  signal: AbortSignal,
): Promise<ExecutorResult> {
  const taskPrompt = buildTaskPrompt(todo, systemPrompt)
  const command = buildCommand(agent, taskPrompt)

  logger.info(`エージェント実行開始: ${agent}`)
  logger.info(`タスク: ${todo.summary.slice(0, 80)}...`)

  const proc = Bun.spawn(command, {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "inherit",
    stdin: "inherit",
    signal,
  })

  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  const exitCode = proc.exitCode ?? 1
  const success = exitCode === 0

  if (success) {
    logger.success(`エージェント実行完了 (exit: ${exitCode})`)
  } else {
    logger.error(`エージェント実行失敗 (exit: ${exitCode})`)
  }

  return { success, exitCode, stdout }
}

function buildCommand(agent: AgentType, prompt: string): string[] {
  switch (agent) {
    case "claude":
      return ["claude", "-p", "--no-dangerously-skip-permissions", prompt]
    case "opencode":
      return ["opencode", "run", prompt]
  }
}

function buildTaskPrompt(todo: TodoItem, systemPrompt: string): string {
  const parts: string[] = [systemPrompt, "", "---", "", "## 指摘内容", ""]

  const source = todo.source
  switch (source.type) {
    case "issue_comment": {
      parts.push(`**コメント種別**: PRコメント`)
      parts.push(`**投稿者**: @${source.comment.user.login}`)
      parts.push(`**URL**: ${source.comment.htmlUrl}`)
      parts.push("")
      parts.push("```")
      parts.push(source.comment.body)
      parts.push("```")
      break
    }
    case "review_comment": {
      const loc = source.comment.path + (source.comment.line ? `:${source.comment.line}` : "")
      parts.push(`**コメント種別**: コードレビューコメント`)
      parts.push(`**投稿者**: @${source.comment.user.login}`)
      parts.push(`**ファイル**: ${loc}`)
      parts.push(`**URL**: ${source.comment.htmlUrl}`)
      parts.push("")
      parts.push("### Diff Hunk")
      parts.push("```diff")
      parts.push(source.comment.diffHunk)
      parts.push("```")
      parts.push("")
      parts.push("### コメント内容")
      parts.push("```")
      parts.push(source.comment.body)
      parts.push("```")
      break
    }
    case "review": {
      parts.push(`**コメント種別**: レビュー (${source.review.state})`)
      parts.push(`**投稿者**: @${source.review.user.login}`)
      parts.push(`**URL**: ${source.review.htmlUrl}`)
      parts.push("")
      parts.push("```")
      parts.push(source.review.body)
      parts.push("```")
      break
    }
  }

  return parts.join("\n")
}
