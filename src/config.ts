import { existsSync, mkdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { type PrLoopConfig, DEFAULT_CONFIG, type AgentType } from "./types.ts"

const CONFIG_DIR_NAME = "pr-loop"
const CONFIG_FILE_NAME = "config.json"

interface RawConfig {
  agent?: string
  systemPrompt?: string
  pollingIntervalSeconds?: number
  maxTasks?: number
  selfUser?: string
}

export function resolveConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg || join(homedir(), ".config")
  return join(base, CONFIG_DIR_NAME)
}

export function resolveConfigPath(): string {
  return join(resolveConfigDir(), CONFIG_FILE_NAME)
}

export async function loadConfig(): Promise<PrLoopConfig> {
  const configPath = resolveConfigPath()

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  const raw = JSON.parse(await readFile(configPath, "utf-8")) as RawConfig

  return {
    agent: validateAgent(raw.agent) ?? DEFAULT_CONFIG.agent,
    systemPrompt: raw.systemPrompt ?? DEFAULT_CONFIG.systemPrompt,
    pollingIntervalSeconds: raw.pollingIntervalSeconds ?? DEFAULT_CONFIG.pollingIntervalSeconds,
    maxTasks: raw.maxTasks ?? DEFAULT_CONFIG.maxTasks,
    selfUser: raw.selfUser ?? DEFAULT_CONFIG.selfUser,
  }
}

export function mergeConfigWithArgs(
  config: PrLoopConfig,
  args: {
    agent?: string
    interval?: number
    systemPrompt?: string
    maxTasks?: number
  },
): PrLoopConfig {
  return {
    agent: validateAgent(args.agent) ?? config.agent,
    systemPrompt: args.systemPrompt ?? config.systemPrompt,
    pollingIntervalSeconds: args.interval ?? config.pollingIntervalSeconds,
    maxTasks: args.maxTasks ?? config.maxTasks,
    selfUser: config.selfUser,
  }
}

export function ensureConfigDir(): void {
  const dir = resolveConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function validateAgent(agent: string | undefined): AgentType | undefined {
  if (agent === "claude" || agent === "opencode" || agent === "codex") {
    return agent
  }
  return undefined
}
