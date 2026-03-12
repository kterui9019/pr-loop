#!/usr/bin/env bun

import { handleStart, handleStatus, handleStop } from "./cli.ts"
import { logger } from "./logger.ts"
import { resolveConfigPath } from "./config.ts"

const VERSION = "0.1.0"

function printHelp(): void {
  console.log(`
pr-loop v${VERSION} — Autonomous PR comment/review resolver for coding agents

Usage:
  pr-loop start [options]    Start monitoring current branch's PR
  pr-loop status             Show current state and todo list
  pr-loop stop               Stop the loop
  pr-loop help               Show this help

Options (start):
  --agent <claude|opencode|codex>  Agent to use (default: claude)
  --interval <seconds>       Polling interval in seconds (default: 300)
  --system-prompt <text>     Custom system prompt
  --max-tasks <number>       Maximum tasks to execute (default: 50)

Config:
  ${resolveConfigPath()}

Environment:
  PR_LOOP_DEBUG=1            Enable debug logging
`)
}

function parseArgs(args: readonly string[]): {
  command: string
  options: Record<string, string | undefined>
} {
  const command = args[0] ?? "help"
  const options: Record<string, string | undefined> = {}

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg?.startsWith("--")) {
      const key = arg.replace(/^--/, "")
      const next = args[i + 1]
      if (next && !next.startsWith("--")) {
        options[key] = next
        i++
      } else {
        options[key] = "true"
      }
    }
  }

  return { command, options }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { command, options } = parseArgs(args)

  switch (command) {
    case "start": {
      await handleStart({
        agent: options["agent"],
        interval: options["interval"] ? Number(options["interval"]) : undefined,
        systemPrompt: options["system-prompt"],
        maxTasks: options["max-tasks"] ? Number(options["max-tasks"]) : undefined,
      })
      break
    }
    case "status": {
      await handleStatus()
      break
    }
    case "stop": {
      await handleStop()
      break
    }
    case "help":
    case "--help":
    case "-h": {
      printHelp()
      break
    }
    case "version":
    case "--version":
    case "-v": {
      console.log(`pr-loop v${VERSION}`)
      break
    }
    default: {
      logger.error(`不明なコマンド: ${command}`)
      printHelp()
      process.exit(1)
    }
  }
}

process.on("unhandledRejection", (e) => {
  logger.error("unhandledRejection", e)
  process.exit(1)
})

process.on("uncaughtException", (e) => {
  logger.error("uncaughtException", e)
  process.exit(1)
})

try {
  await main()
} catch (err) {
  if (err instanceof Error) {
    logger.error(err.message)
  } else {
    logger.error("不明なエラー", err)
  }
  process.exit(1)
}
