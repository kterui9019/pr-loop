const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
} as const

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "")
}

function formatPrefix(level: string, color: string): string {
  return `${COLORS.dim}[${timestamp()}]${COLORS.reset} ${color}[${level}]${COLORS.reset}`
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.error(`${formatPrefix("INFO", COLORS.blue)} ${message}`, ...args)
  },

  success(message: string, ...args: unknown[]): void {
    console.error(`${formatPrefix("OK", COLORS.green)} ${message}`, ...args)
  },

  warn(message: string, ...args: unknown[]): void {
    console.error(`${formatPrefix("WARN", COLORS.yellow)} ${message}`, ...args)
  },

  error(message: string, ...args: unknown[]): void {
    console.error(`${formatPrefix("ERROR", COLORS.red)} ${message}`, ...args)
  },

  debug(message: string, ...args: unknown[]): void {
    if (process.env.PR_LOOP_DEBUG) {
      console.error(`${formatPrefix("DEBUG", COLORS.dim)} ${message}`, ...args)
    }
  },

  poll(message: string, ...args: unknown[]): void {
    console.error(`${formatPrefix("POLL", COLORS.cyan)} ${message}`, ...args)
  },
} as const
