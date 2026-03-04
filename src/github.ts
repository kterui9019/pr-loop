import { $ } from "bun"
import { logger } from "./logger.ts"
import type {
  IssueComment,
  ReviewComment,
  Review,
  GitHubUser,
} from "./types.ts"

interface RawUser {
  login: string
  id: number
  type: string
}

interface RawIssueComment {
  id: number
  body: string
  created_at: string
  updated_at: string
  html_url: string
  user: RawUser
  author_association: string
}

interface RawReviewComment {
  id: number
  body: string
  path: string
  line: number | null
  original_line: number | null
  side: string
  created_at: string
  updated_at: string
  html_url: string
  user: RawUser
  author_association: string
  in_reply_to_id?: number | null
  pull_request_review_id: number
  diff_hunk: string
}

interface RawReview {
  id: number
  state: string
  body: string
  submitted_at: string
  html_url: string
  user: RawUser
  author_association: string
}

function toGitHubUser(raw: RawUser): GitHubUser {
  return {
    login: raw.login,
    id: raw.id,
    type: raw.type as GitHubUser["type"],
  }
}

function toIssueComment(raw: RawIssueComment): IssueComment {
  return {
    id: raw.id,
    body: raw.body,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    htmlUrl: raw.html_url,
    user: toGitHubUser(raw.user),
    authorAssociation: raw.author_association,
  }
}

function toReviewComment(raw: RawReviewComment): ReviewComment {
  return {
    id: raw.id,
    body: raw.body,
    path: raw.path,
    line: raw.line,
    originalLine: raw.original_line,
    side: raw.side as ReviewComment["side"],
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    htmlUrl: raw.html_url,
    user: toGitHubUser(raw.user),
    authorAssociation: raw.author_association,
    inReplyToId: raw.in_reply_to_id ?? null,
    pullRequestReviewId: raw.pull_request_review_id,
    diffHunk: raw.diff_hunk,
  }
}

function toReview(raw: RawReview): Review {
  return {
    id: raw.id,
    state: raw.state as Review["state"],
    body: raw.body,
    submittedAt: raw.submitted_at,
    htmlUrl: raw.html_url,
    user: toGitHubUser(raw.user),
    authorAssociation: raw.author_association,
  }
}

async function ghApi<T>(endpoint: string): Promise<T> {
  logger.debug(`gh api ${endpoint}`)
  const result = await $`gh api ${endpoint} --paginate`.quiet().nothrow()

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`gh api failed (exit ${result.exitCode}): ${stderr}`)
  }

  const stdout = result.stdout.toString().trim()
  if (!stdout) {
    return [] as unknown as T
  }

  return JSON.parse(stdout) as T
}

async function ghApiPost(endpoint: string, body: Record<string, string>): Promise<void> {
  const args = Object.entries(body).flatMap(([k, v]) => ["-f", `${k}=${v}`])
  const result = await $`gh api -X POST ${endpoint} ${args}`.quiet().nothrow()

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`gh api POST failed (exit ${result.exitCode}): ${stderr}`)
  }
}

export async function fetchIssueComments(
  owner: string,
  repo: string,
  prNumber: number,
  since?: string,
): Promise<readonly IssueComment[]> {
  const sinceParam = since ? `?since=${since}&sort=updated&direction=asc` : ""
  const endpoint = `repos/${owner}/${repo}/issues/${prNumber}/comments${sinceParam}`
  const raw = await ghApi<RawIssueComment[]>(endpoint)
  return raw.map(toIssueComment)
}

export async function fetchReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
  since?: string,
): Promise<readonly ReviewComment[]> {
  const sinceParam = since ? `?since=${since}&sort=updated&direction=asc` : ""
  const endpoint = `repos/${owner}/${repo}/pulls/${prNumber}/comments${sinceParam}`
  const raw = await ghApi<RawReviewComment[]>(endpoint)
  return raw.map(toReviewComment)
}

export async function fetchReviews(
  owner: string,
  repo: string,
  prNumber: number,
  since?: string,
): Promise<readonly Review[]> {
  const endpoint = `repos/${owner}/${repo}/pulls/${prNumber}/reviews`
  const raw = await ghApi<RawReview[]>(endpoint)

  if (!since) {
    return raw.map(toReview)
  }

  const sinceDate = new Date(since)
  return raw
    .filter((r) => new Date(r.submitted_at) > sinceDate)
    .map(toReview)
}

export async function fetchPrStatus(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ state: "open" | "closed"; merged: boolean }> {
  const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber} --jq '{state,merged}'`
    .quiet()
    .nothrow()

  if (result.exitCode !== 0) {
    throw new Error(`Failed to fetch PR status: ${result.stderr.toString().trim()}`)
  }

  return JSON.parse(result.stdout.toString().trim())
}

export async function postComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  await ghApiPost(`repos/${owner}/${repo}/issues/${prNumber}/comments`, { body })
}

export async function fetchSelfUser(): Promise<string> {
  const result = await $`gh api user --jq '.login'`.quiet().nothrow()

  if (result.exitCode !== 0) {
    throw new Error(`Failed to fetch authenticated user: ${result.stderr.toString().trim()}`)
  }

  return result.stdout.toString().trim()
}
