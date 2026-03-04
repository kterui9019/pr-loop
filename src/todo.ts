import { existsSync, mkdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { TodoItem, IssueComment, ReviewComment, Review } from "./types.ts"

const TODO_DIR = ".prloop"
const TODO_FILE = "todos.md"

function todoPath(cwd: string): string {
  return join(cwd, TODO_DIR, TODO_FILE)
}

function ensureDir(cwd: string): void {
  const dir = join(cwd, TODO_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function createTodoFromIssueComment(comment: IssueComment): TodoItem {
  return {
    id: `issue-comment-${comment.id}`,
    source: { type: "issue_comment", comment },
    summary: truncate(comment.body, 200),
    author: comment.user.login,
    status: "pending",
    createdAt: comment.createdAt,
  }
}

export function createTodoFromReviewComment(comment: ReviewComment): TodoItem {
  const location = comment.path + (comment.line ? `:${comment.line}` : "")
  return {
    id: `review-comment-${comment.id}`,
    source: { type: "review_comment", comment },
    summary: `[${location}] ${truncate(comment.body, 150)}`,
    author: comment.user.login,
    status: "pending",
    createdAt: comment.createdAt,
  }
}

export function createTodoFromReview(review: Review): TodoItem {
  return {
    id: `review-${review.id}`,
    source: { type: "review", review },
    summary: truncate(review.body, 200),
    author: review.user.login,
    status: "pending",
    createdAt: review.submittedAt,
  }
}

export async function readTodos(cwd: string): Promise<readonly TodoItem[]> {
  const path = todoPath(cwd)

  if (!existsSync(path)) {
    return []
  }

  const content = await readFile(path, "utf-8")
  return parseTodoMarkdown(content)
}

export async function writeTodos(cwd: string, todos: readonly TodoItem[]): Promise<void> {
  ensureDir(cwd)
  const path = todoPath(cwd)
  const content = renderTodoMarkdown(todos)
  await writeFile(path, content, "utf-8")
}

export function getNextPendingTodo(todos: readonly TodoItem[]): TodoItem | undefined {
  return todos.find((t) => t.status === "pending")
}

export function markTodoCompleted(
  todos: readonly TodoItem[],
  todoId: string,
  commitHash?: string,
): readonly TodoItem[] {
  return todos.map((t) =>
    t.id === todoId
      ? { ...t, status: "completed" as const, completedAt: new Date().toISOString(), commitHash }
      : t,
  )
}

export function markTodoInProgress(todos: readonly TodoItem[], todoId: string): readonly TodoItem[] {
  return todos.map((t) => (t.id === todoId ? { ...t, status: "in_progress" as const } : t))
}

export function addTodos(
  existing: readonly TodoItem[],
  newItems: readonly TodoItem[],
): readonly TodoItem[] {
  const existingIds = new Set(existing.map((t) => t.id))
  const uniqueNew = newItems.filter((t) => !existingIds.has(t.id))
  return [...existing, ...uniqueNew]
}

function renderTodoMarkdown(todos: readonly TodoItem[]): string {
  const pending = todos.filter((t) => t.status === "pending" || t.status === "in_progress")
  const completed = todos.filter((t) => t.status === "completed")
  const skipped = todos.filter((t) => t.status === "skipped")

  const lines: string[] = ["# PR Loop - Todo List", ""]

  if (pending.length > 0) {
    lines.push("## Pending", "")
    for (const todo of pending) {
      const marker = todo.status === "in_progress" ? "🔄" : ""
      lines.push(`- [ ] ${marker}[${todo.id}] @${todo.author}: "${todo.summary}"`)
    }
    lines.push("")
  }

  if (completed.length > 0) {
    lines.push("## Completed", "")
    for (const todo of completed) {
      const hash = todo.commitHash ? ` → fixed in ${todo.commitHash}` : ""
      lines.push(`- [x] [${todo.id}] @${todo.author}: "${todo.summary}"${hash}`)
    }
    lines.push("")
  }

  if (skipped.length > 0) {
    lines.push("## Skipped", "")
    for (const todo of skipped) {
      lines.push(`- [~] [${todo.id}] @${todo.author}: "${todo.summary}"`)
    }
    lines.push("")
  }

  lines.push(
    "---",
    `<!-- DATA:${JSON.stringify(todos)} -->`,
    "",
  )

  return lines.join("\n")
}

function parseTodoMarkdown(content: string): readonly TodoItem[] {
  const dataMatch = content.match(/<!-- DATA:(.*?) -->/)
  if (dataMatch?.[1]) {
    return JSON.parse(dataMatch[1]) as TodoItem[]
  }
  return []
}

function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, " ").trim()
  if (singleLine.length <= maxLength) {
    return singleLine
  }
  return singleLine.slice(0, maxLength - 3) + "..."
}
