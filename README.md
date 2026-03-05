# pr-loop

Coding Agent が PR のレビューコメントや指摘事項を自律的に解消するための Agent Harness Tool。

PR にコメントが付くたびにポーリングで検出し、Claude Code や OpenCode などの Coding Agent に修正を委譲する。

## Highlights

- **自律ループ** — PR のコメント・レビュー指摘を自動検出し、Coding Agent にタスクとして渡す
- **エージェント選択** — Claude Code / OpenCode を切り替え可能
- **ToDo 管理** — 検出したコメントを `.prloop/todos.md` にMarkdown形式で記録。人間が読める
- **自動終了** — PR がマージまたはクローズされるとループを終了
- **カスタマイズ可能** — システムプロンプト、ポーリング間隔、最大タスク数を設定ファイルまたはCLI引数で変更

## Quickstart

### Requirements

- [Bun](https://bun.sh/) v1.0 以上
- [GitHub CLI (`gh`)](https://cli.github.com/) — 認証済みであること (`gh auth login`)
- 以下のいずれかの Coding Agent CLI:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
  - [OpenCode](https://github.com/sst/opencode) (`opencode`)

### Install

```sh
git clone https://github.com/terui/pr-loop.git
cd pr-loop
bun install
bun link
```

`bun link` により `pr-loop` コマンドがグローバルに使えるようになる。

### Run

PR が存在するブランチにチェックアウトした状態で:

```sh
pr-loop start
```

## Usage

### コマンド一覧

```
pr-loop start [options]    PR の監視を開始
pr-loop status             現在の状態と ToDo リストを表示
pr-loop stop               ループを停止
pr-loop help               ヘルプを表示
pr-loop version            バージョンを表示
```

### `start` のオプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `--agent <claude\|opencode>` | 使用するCoding Agent | `claude` |
| `--interval <seconds>` | ポーリング間隔（秒） | `300` (5分) |
| `--system-prompt <text>` | カスタムシステムプロンプト | 下記参照 |
| `--max-tasks <number>` | 最大実行タスク数（安全リミット） | `50` |

### 使用例

```sh
# Claude で5分間隔（デフォルト）
pr-loop start

# OpenCode で10分間隔
pr-loop start --agent opencode --interval 600

# カスタムプロンプトを指定
pr-loop start --system-prompt "Fix the issue and commit."

# 状態確認
pr-loop status

# 停止
pr-loop stop
```

### デフォルトシステムプロンプト

```
次のGitHubの指摘事項を修正してください。
2行以下なら修正完了後にcommit, pushしたあと「修正しました！ fix in {hash}」というコメントで返信してください。
3行以上ならコミットした後slackツールを使って自分のDMに対応完了した旨通知をしてください。
```

## Configuration

設定ファイルは XDG Base Directory 仕様に従い、以下の場所に配置する:

```
$XDG_CONFIG_HOME/pr-loop/config.json
```

`$XDG_CONFIG_HOME` が未設定の場合は `~/.config/pr-loop/config.json` がデフォルト。

`pr-loop help` を実行すると実際に参照されるパスが表示される。

### 設定ファイルの作成

```sh
mkdir -p ~/.config/pr-loop
cat > ~/.config/pr-loop/config.json << 'EOF'
{
  "agent": "claude",
  "systemPrompt": "Fix the review comment. Commit and push when done.",
  "pollingIntervalSeconds": 600,
  "maxTasks": 30,
  "selfUser": "my-github-username"
}
EOF
```

### 設定項目

| フィールド | 型 | 説明 | デフォルト |
|---|---|---|---|
| `agent` | `"claude" \| "opencode"` | 使用するエージェント | `"claude"` |
| `systemPrompt` | `string` | エージェントに渡すシステムプロンプト | 上記参照 |
| `pollingIntervalSeconds` | `number` | ポーリング間隔（秒） | `300` |
| `maxTasks` | `number` | 最大実行タスク数 | `50` |
| `selfUser` | `string` | 自分のGitHubユーザー名 | 自動取得 |

CLI引数は設定ファイルより優先される。`selfUser` を省略した場合は `gh api user` で自動取得する。

## How It Works

```
┌─────────────────────────────────────────────────┐
│  pr-loop start                                  │
│                                                 │
│  1. 現在ブランチの PR を検出                       │
│  2. GitHub認証ユーザーを取得                       │
│  3. ポーリングループ開始                           │
│     ┌───────────────────────────────────────┐   │
│     │  PR状態チェック (merged? closed?)       │   │
│     │       ↓                               │   │
│     │  gh api で新コメント・レビューを取得      │   │
│     │       ↓                               │   │
│     │  自分のコメントを除外                    │   │
│     │       ↓                               │   │
│     │  .prloop/todos.md にタスク追加          │   │
│     │       ↓                               │   │
│     │  先頭の未完了タスクを Coding Agent に委譲 │   │
│     │       ↓                               │   │
│     │  5分待機 → ループ先頭へ                  │   │
│     └───────────────────────────────────────┘   │
│                                                 │
│  PR マージ or Ctrl+C → 終了                      │
└─────────────────────────────────────────────────┘
```

### 生成されるファイル

実行状態とToDoリストはプロジェクトローカルの `.prloop/` ディレクトリに保存される。

| パス | 用途 |
|---|---|
| `.prloop/state.json` | ループの実行状態（PR番号、処理済みコメントID等） |
| `.prloop/todos.md` | 未対応・完了済みタスクのMarkdownリスト |

`.prloop/` は `.gitignore` に追加することを推奨。

### 検出対象

| 種別 | GitHub API エンドポイント | フィルタ |
|---|---|---|
| PR コメント | `GET /repos/{owner}/{repo}/issues/{n}/comments` | `since` パラメータ |
| コードレビューコメント | `GET /repos/{owner}/{repo}/pulls/{n}/comments` | `since` パラメータ |
| レビュー本体 | `GET /repos/{owner}/{repo}/pulls/{n}/reviews` | `submitted_at` クライアントフィルタ |

Bot のコメントと `selfUser` のコメントは自動除外される。

## Environment Variables

| 変数 | 説明 |
|---|---|
| `XDG_CONFIG_HOME` | 設定ファイルの基底ディレクトリ（デフォルト: `~/.config`） |
| `PR_LOOP_DEBUG=1` | デバッグログを有効化 |

## Troubleshooting

### `現在のブランチにPRが見つかりません`

現在チェックアウトしているブランチに紐づく PR が存在しない。先に PR を作成する。

```sh
gh pr create --fill
```

### `gh api failed`

`gh` CLI の認証が切れている可能性がある。

```sh
gh auth status
gh auth login
```

### エージェントが見つからない

`claude` または `opencode` コマンドにPATHが通っているか確認。

```sh
which claude
which opencode
```

### 既に実行中と表示される

前回のループが正常終了しなかった場合、状態ファイルが残っている。

```sh
pr-loop stop
```

状態ファイルを直接削除する場合:

```sh
rm .prloop/state.json
```

### `pr-loop: command not found`

`bun link` がまだ実行されていない。

```sh
cd /path/to/pr-loop
bun link
```

## Uninstall

```sh
cd /path/to/pr-loop
bun unlink
rm -rf ~/.config/pr-loop
```

## License

MIT
