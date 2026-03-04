import { existsSync, mkdirSync } from "node:fs"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import type { LoopState } from "./types.ts"

const STATE_DIR = ".prloop"
const STATE_FILE = "state.json"

function statePath(cwd: string): string {
  return join(cwd, STATE_DIR, STATE_FILE)
}

function ensureDir(cwd: string): void {
  const dir = join(cwd, STATE_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export async function readState(cwd: string): Promise<LoopState | null> {
  const path = statePath(cwd)

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, "utf-8")
  return JSON.parse(content) as LoopState
}

export async function writeState(cwd: string, state: LoopState): Promise<void> {
  ensureDir(cwd)
  const path = statePath(cwd)
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8")
}

export async function clearState(cwd: string): Promise<void> {
  const path = statePath(cwd)
  if (existsSync(path)) {
    await unlink(path)
  }
}

export function createInitialState(
  prNumber: number,
  owner: string,
  repo: string,
): LoopState {
  return {
    active: true,
    prNumber,
    owner,
    repo,
    lastCheckedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    processedCommentIds: [],
    totalTasksCompleted: 0,
  }
}

export function addProcessedCommentId(state: LoopState, commentId: number): LoopState {
  return {
    ...state,
    processedCommentIds: [...state.processedCommentIds, commentId],
  }
}

export function incrementTasksCompleted(state: LoopState): LoopState {
  return {
    ...state,
    totalTasksCompleted: state.totalTasksCompleted + 1,
  }
}

export function updateLastChecked(state: LoopState): LoopState {
  return {
    ...state,
    lastCheckedAt: new Date().toISOString(),
  }
}

export function deactivateState(state: LoopState): LoopState {
  return {
    ...state,
    active: false,
  }
}
