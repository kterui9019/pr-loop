import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { type PrLoopConfig, DEFAULT_CONFIG, type AgentType } from "./types.ts"

const CONFIG_FILE = ".prloop/config.json"

interface RawConfig {
  agent?: string
  systemPrompt?: string
  pollingIntervalSeconds?: number
  maxTasks?: number
  selfUser?: string
}

export async function loadConfig(cwd: string): Promise<PrLoopConfig> {
  const configPath = join(cwd, CONFIG_FILE)

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

function validateAgent(agent: string | undefined): AgentType | undefined {
  if (agent === "claude" || agent === "opencode") {
    return agent
  }
  return undefined
}
