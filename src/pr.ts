import { $ } from "bun"
import type { PrInfo } from "./types.ts"

interface RawPrView {
  number: number
  url: string
  state: string
  headRefName: string
  baseRefName: string
}

export async function detectCurrentPr(cwd: string): Promise<PrInfo> {
  const result = await $`gh pr view --json number,url,state,headRefName,baseRefName`
    .quiet()
    .nothrow()
    .cwd(cwd)

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    if (stderr.includes("no pull requests found") || stderr.includes("Could not find")) {
      throw new Error("現在のブランチにPRが見つかりません。PRを作成してから再実行してください。")
    }
    throw new Error(`PR検出に失敗: ${stderr}`)
  }

  const raw = JSON.parse(result.stdout.toString().trim()) as RawPrView

  const { owner, repo } = await extractOwnerRepo(cwd)

  return {
    number: raw.number,
    url: raw.url,
    state: raw.state as PrInfo["state"],
    merged: false,
    headRefName: raw.headRefName,
    baseRefName: raw.baseRefName,
    owner,
    repo,
  }
}

async function extractOwnerRepo(cwd: string): Promise<{ owner: string; repo: string }> {
  const result = await $`gh repo view --json owner,name --jq '{owner: .owner.login, name: .name}'`
    .quiet()
    .nothrow()
    .cwd(cwd)

  if (result.exitCode !== 0) {
    throw new Error(`リポジトリ情報の取得に失敗: ${result.stderr.toString().trim()}`)
  }

  const raw = JSON.parse(result.stdout.toString().trim()) as { owner: string; name: string }

  return { owner: raw.owner, repo: raw.name }
}
