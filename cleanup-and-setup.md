# Local Notebook AI — クリーンアップ＆再セットアップ手順

## ① 削除して良いもの（保存前に削除、あとで復元可能）

リポジトリのルート（`localnotebook`）で実行してください。

```bash
cd localnotebook
```

```bash
find . -name "node_modules" -type d -prune -exec rm -rf {} +
```

```bash
rm -rf apps/web/.next apps/api/dist packages/*/dist
```

```bash
rm -rf e2e/node_modules e2e/test-results e2e/playwright-report
```

```bash
rm -f data/*.sqlite data/*.sqlite-journal data/*.sqlite-wal data/*.sqlite-shm
rm -f data/e2e-test.sqlite*
```

```bash
rm -rf storage-e2e-test
```

```bash
# ノートブックにアップロードされた添付ファイルの実体
# （storage/uploads/{ユーザーID}/{ノートブックID}/original/ 配下、
#  全ユーザー・全ノートブック分）をまとめて削除します。
# ディレクトリ構造自体を保つための .gitkeep だけは残します。
find storage/uploads -mindepth 1 ! -name ".gitkeep" -delete
```

```bash
find . -name "*.tsbuildinfo" -delete
```

```bash
# curl -c/-b を使った動作確認で生成された、Cookie保存用の一時ファイル
# （cookie.txt, cookieA.txt, cookieB.txt, cookieAdmin.txt 等）
rm -f cookie*.txt
```

## ② 削除してはいけないもの（重要）

- **`.env`** — 秘密情報・設定を含む。削除すると再セットアップ時に作り直しが必要（`.env.example`からコピー可能）
- **`storage/uploads/.gitkeep`** — これがないとディレクトリ自体がGit管理から消える
- ソースコード本体（`apps/`・`packages/`・`e2e/`の`.ts`/`.tsx`/`.json`等）

## ③ 削除後、サイズ確認（任意）

```bash
du -sh .
```

`node_modules`や`.next`は数百MB〜1GB近くになることが多いため、削除後は数MB〜数十MB程度に収まるはずです。

---

# 再セットアップ手順

保存したソースコードから再び動かす場合、以下の順で実行してください。

## ① 依存関係のインストール

```bash
cd localnotebook
pnpm install
```

## ② `.env`の準備

`.env`を削除・保存していなかった場合のみ必要です。

```bash
cp .env.example .env
```

その後、`.env`を開いて以下を確認・編集してください。

- `SESSION_SECRET`（本番相当で使う場合はランダムな長い文字列に変更）
- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`
- `OLLAMA_BASE_URL`（Windows側でOllamaを起動している場合は`http://localhost:11434`のままでOK）

## ③ DBの初期化

```bash
pnpm db:migrate
pnpm db:seed
```

## ④ 起動確認

```bash
pnpm dev
```

`http://localhost:3000` にアクセスし、初期管理者でログインできれば復元完了です。

## ⑤ （任意）E2Eテストを使う場合

```bash
npx playwright install chromium
pnpm test:e2e
```

---

## チェックリスト

- [ ] `node_modules`（ルート・各`apps/`・`packages/`・`e2e/`）を削除した
- [ ] `.next`・`dist`ビルド成果物を削除した
- [ ] `data/*.sqlite*`・`storage-e2e-test/`を削除した
- [ ] ノートブックの添付ファイル実体（`storage/uploads`配下、全ユーザー分）を削除した
- [ ] 動作確認で生成された`cookie*.txt`等の一時ファイルを削除した
- [ ] `.env`は削除していない（または内容を別途保存済み）
- [ ] `storage/uploads/.gitkeep`は残っている
- [ ] 再セットアップ後、`pnpm dev`でログインできることを確認した
