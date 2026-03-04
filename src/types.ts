export type AgentType = "claude" | "opencode"

export interface PrLoopConfig {
  readonly agent: AgentType
  readonly systemPrompt: string
  readonly pollingIntervalSeconds: number
  readonly maxTasks: number
  readonly selfUser: string
}

export interface PrInfo {
  readonly number: number
  readonly url: string
  readonly state: "open" | "closed"
  readonly merged: boolean
  readonly headRefName: string
  readonly baseRefName: string
  readonly owner: string
  readonly repo: string
}

export interface GitHubUser {
  readonly login: string
  readonly id: number
  readonly type: "User" | "Bot" | "Organization"
}

export interface IssueComment {
  readonly id: number
  readonly body: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly htmlUrl: string
  readonly user: GitHubUser
  readonly authorAssociation: string
}

export interface ReviewComment {
  readonly id: number
  readonly body: string
  readonly path: string
  readonly line: number | null
  readonly originalLine: number | null
  readonly side: "LEFT" | "RIGHT"
  readonly createdAt: string
  readonly updatedAt: string
  readonly htmlUrl: string
  readonly user: GitHubUser
  readonly authorAssociation: string
  readonly inReplyToId: number | null
  readonly pullRequestReviewId: number
  readonly diffHunk: string
}

export interface Review {
  readonly id: number
  readonly state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING"
  readonly body: string
  readonly submittedAt: string
  readonly htmlUrl: string
  readonly user: GitHubUser
  readonly authorAssociation: string
}

export type TodoItemSource =
  | { readonly type: "issue_comment"; readonly comment: IssueComment }
  | { readonly type: "review_comment"; readonly comment: ReviewComment }
  | { readonly type: "review"; readonly review: Review }

export interface TodoItem {
  readonly id: string
  readonly source: TodoItemSource
  readonly summary: string
  readonly author: string
  readonly status: "pending" | "in_progress" | "completed" | "skipped"
  readonly createdAt: string
  readonly completedAt?: string
  readonly commitHash?: string
}

export interface LoopState {
  readonly active: boolean
  readonly prNumber: number
  readonly owner: string
  readonly repo: string
  readonly lastCheckedAt: string
  readonly startedAt: string
  readonly processedCommentIds: readonly number[]
  readonly totalTasksCompleted: number
}

export const DEFAULT_SYSTEM_PROMPT =
  "次のGitHubの指摘事項を修正してください。2行以下なら修正完了後にcommit, pushしたあと「修正しました！ fix in {hash}」というコメントで返信してください。3行以上ならコミットした後slackツールを使って自分のDMに対応完了した旨通知をしてください。"

export const DEFAULT_CONFIG: PrLoopConfig = {
  agent: "claude",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  pollingIntervalSeconds: 300,
  maxTasks: 50,
  selfUser: "",
}
