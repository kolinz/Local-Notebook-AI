# Local Notebook AI

自治体・大学・研究室・企業内など、**組織内の複数ユーザーが利用する**ことを前提にした、
NotebookLM 風のローカルRAG（Retrieval-Augmented Generation）Webアプリケーションです。

LLM実行環境には [Ollama](https://ollama.com/) を利用し、外部クラウドLLMには依存しません。

> **現在のステータス: Phase 16（セキュリティ強化）**
> Helmet・レート制限（グローバル10/秒・200/分、ログイン/パスワード変更は5/分）・
> Prompt Injection対策（RAGプロンプトへのデリミタ付きデータ隔離）を実装済み。
> CSRF・XSS・所有者チェック・ファイルアップロード制限・SQL Injection対策
> （Drizzle ORM）・SSRF対策（URL取り込み機能なし）を含む点検項目をすべて
> 実際のリクエストで動作確認済みです。
>
> ⚠️ **重要なセキュリティ修正（Phase 10）**: `OwnershipGuard`がクラスレベルの
> `@CheckOwnership`を認識していなかった不具合を修正済みです。
> 詳細は本ファイル末尾の「既知の問題と修正履歴」を参照してください。

---

## 1. NotebookLMとの違い

本アプリケーションは個人用ツールの単純なクローンではなく、**複数ユーザーがログインして使う組織内RAG基盤**として設計されています。

- 管理者(admin) / 一般ユーザー(user) のロール分離
- ユーザーごとのノートブック・ファイル・チャット履歴の分離（`owner_user_id` によるスコープ制御）
- RAG検索時も所有者・ノートブック単位で検索範囲を制限
- 管理者による全体設定・監査ログ管理

詳細は `docs/` 配下の仕様書（プロジェクト管理者が別途保持）を参照してください。

---

## 2. 技術スタック

| 領域 | 採用技術 |
|---|---|
| Runtime | Node.js 24 LTS |
| Package Manager | pnpm (npm からの実行も可能) |
| Monorepo | pnpm workspaces |
| Frontend | Next.js + React + TypeScript (`apps/web`) |
| Backend | NestJS + TypeScript (`apps/api`) |
| Database | SQLite + **Drizzle ORM** + better-sqlite3 |
| Auth | Cookie-based session（サーバー側セッションストア、opaqueトークン） |
| CSRF | Double-submit cookie方式 |
| LLM Runtime | Ollama（Phase 9以降で接続） |

> **ORMについて:** 当初はPrisma/Drizzleのどちらでも良い方針でしたが、Prisma CLIが
> マイグレーション実行時にクエリエンジン等のバイナリを外部CDNからダウンロードする
> 仕様のため、社内プロキシやオフライン環境などダウンロード元へアクセスできない
> ネットワークでは `pnpm db:migrate` 等が失敗する可能性があります。そのため、
> ネイティブモジュール（better-sqlite3）以外は追加のバイナリダウンロードが不要な
> **Drizzle ORM** を採用しています。`better-sqlite3` はプリビルド済みバイナリを
> GitHub Releases から取得できるバージョン（v12系）に固定しています。

### モノレポ構成

```text
local-notebook-ai/
  apps/
    web/                       # Next.js frontend (UI層。Ollamaへは直接アクセスしない)
      src/middleware.ts        # 保護ページのサーバーサイドリダイレクト
      src/lib/api-client.ts    # API呼び出し共通ヘルパー(CSRF/Cookie/エラー処理)
      src/i18n/
        index.ts               # 翻訳ルックアップ(サーバー/クライアント共通)
        use-translation.ts     # useTranslation()フック(クライアント専用)
        locales/{ja,en}/       # common/auth/notebook/admin別JSON
      src/components/
        app-header.tsx          # 言語切替UI・ログイン状態・Role表示を持つ共通ヘッダー
        notebook-sidebar.tsx    # ノートブック一覧+新規作成フォーム(左カラム)
        notebook-chat-panel.tsx # チャットログ+引用元+Retrieval Details+RAG Strategy切替(中央)
        notebook-sources-panel.tsx  # アップロード+ファイル一覧+Preview/Summary/Delete(右)
        file-preview-modal.tsx  # 抽出済みテキストのプレビュー表示
      src/hooks/use-current-user.ts  # クライアント側の認証チェック共通フック
      src/app/[locale]/
        layout.tsx             # ロケール検証 + AppHeader組み込み
        login/                 # ログイン画面(翻訳適用済み)
        notebooks/
          layout.tsx           # 認証チェック + NotebookSidebar組み込み
          page.tsx             # 未選択時のプレースホルダー
          [notebookId]/page.tsx  # ノートブック詳細(表示/編集/削除)
        admin/                 # 管理者専用領域(Phase 3プレースホルダー、翻訳適用済み)
        change-password/       # パスワード変更誘導画面(構造のみ、API未実装、翻訳適用済み)
    api/                       # NestJS backend (API/業務ロジック層)
      drizzle/                 # 生成されたSQLマイグレーションファイル
      drizzle.config.ts        # drizzle-kit設定
      scripts/db-env.js        # DB系CLIコマンド用の.env読み込み/パス解決ラッパー
      src/db/
        schema.ts              # 全テーブル定義(usersテーブル + sessionsテーブル等)
        db.service.ts          # Nest向けDB接続サービス
        seed.ts                # 初期管理者seedスクリプト
      src/auth/
        auth.controller.ts     # /api/auth/{login,logout,me,csrf}
        auth.service.ts        # 認証ロジック(bcrypt照合)
        session.service.ts     # セッションストアCRUD
        csrf.service.ts        # CSRFトークン発行・検証
        guards/                # CsrfGuard(全体適用) / SessionAuthGuard
        middleware/             # SessionMiddleware(req.user付与)
      src/common/
        app-exception.ts       # code付きHTTP例外
        http-exception.filter.ts # {error:{code,message}}形式に統一
        zod-validation.pipe.ts # Zodベースのリクエストボディ検証
        authorization/
          roles.guard.ts       # RolesGuard(@Roles()デコレータを強制)
          admin-only.decorator.ts # @AdminOnly()便利デコレータ
          ownership.guard.ts   # OwnershipGuard(notebook_id/file_idの所有者チェック)
          check-ownership.decorator.ts # @CheckOwnership()デコレータ
      src/audit-log/
        audit-log.service.ts   # 監査ログ記録基盤(AuditLogService)
      src/notebooks/           # ノートブックAPI(Phase 6でCRUD完成: 更新/論理削除を追加)
      src/files/                # ファイルAPI(Phase 7でアップロード/一覧/削除、Phase 13でPreview追加)
        file-validation.ts      # MIME/マジックナンバー検査、実行ファイル拒否
        notebook-files.controller.ts  # POST/GET /api/notebooks/:id/files
      src/storage/
        local-storage.adapter.ts  # StorageAdapter実装(LOCAL_STORAGE_ROOT配下)
      src/document-processing/    # テキスト抽出・チャンク化(Phase 8)
        embedding-model-resolver.service.ts  # embeddings/内(Phase 10)
      src/embeddings/
        embeddings.service.ts    # チャンクへのEmbedding生成・保存(Phase 10)
      src/search/
        vector-search.service.ts # cosine similarity検索(Phase 10、owner+notebook絞込)
      src/rag/
        rag.service.ts           # RAGオーケストレーション(session/message/rag_run記録)
        rag-strategy-resolver.service.ts  # notebook override→管理設定→.envの優先順位解決
        answer-generator.service.ts  # 両ストラテジー共通の「実チャンクのみ根拠」生成
        strategies/
          standard-rag.strategy.ts
          hyde-rag.strategy.ts    # 仮想文書生成→Embedding→検索(Phase 12)
      src/system-settings/
        system-settings.service.ts  # system_settingsテーブル汎用KVストア
        extraction.ts            # PDF(pdfjs-dist)/DOCX(mammoth)/TXT/MD抽出
        chunking.ts               # 段落単位の素朴なチャンク分割
        document-processing.service.ts  # status遷移+document_chunks保存
      src/admin/                # 管理者専用API(Phase 4は最小限、Phase 14で本実装)
        ollama-admin.controller.ts  # Ollama接続確認・モデル設定API(Phase 9)
      src/ollama/
        ollama.service.ts        # Ollama REST APIクライアント(fetch使用、APIのみ)
      src/models/
        models.service.ts        # modelsテーブル同期・既定モデル設定
  packages/
    shared/                    # 共有の型・定数・i18nキー（Phase 1では雛形のみ）
    storage/                   # StorageAdapterインターフェース（Phase 7で実装）
    rag-core/                  # RagStrategyインターフェース（Phase 11/12で実装）
  data/                        # SQLiteファイル格納先
  storage/uploads/             # アップロードファイル実体（Phase 7以降）
  .env.example
  package.json
  pnpm-workspace.yaml
```

---

## 3. 必要環境

- **Node.js 24 LTS**（`>=24 <25`）
  - 開発機に v24 が未導入の場合は [nvm](https://github.com/nvm-sh/nvm) 等の利用を推奨します
  - v22 などバージョンが異なっていても機能自体は動作しますが、`engines` の警告が出ます
- **pnpm 9 以上**（`corepack enable` で有効化可能）
- Docker は **不要**です（任意手段としてのみ将来追加され得ます）

---

## 4. セットアップ

```bash
corepack enable
pnpm install
cp .env.example .env
```

続けてDBスキーマを作成し、初期管理者を作成します。

```bash
pnpm db:migrate   # SQLiteファイルを作成し、全テーブルを作成
pnpm db:seed      # .envのINITIAL_ADMIN_*から初期管理者を作成
```

`pnpm db:migrate` / `pnpm db:seed` は、リポジトリルートの `.env` を自動的に読み込みます
（`apps/api` からの相対パスに依存せず、常に `data/local-notebook-ai.sqlite` を対象にします）。
`.env` が無い、または必須項目（`SESSION_SECRET`, `INITIAL_ADMIN_EMAIL`,
`INITIAL_ADMIN_PASSWORD`）が不足している場合は、分かりやすいエラーメッセージを表示して
終了します。

---

## 5. 開発起動

以下のいずれかで、Next.js frontend と NestJS backend を同時に起動します。

```bash
pnpm dev
```

または

```bash
npm run dev
```

起動後:

- Next.js: <http://localhost:3000> — トップページが表示されます
- ログイン画面: <http://localhost:3000/ja/login>
  （初期管理者: `.env` の `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`）
- NestJS API: <http://localhost:4000/api/health> — JSONヘルスチェックが返ります

```json
{
  "status": "ok",
  "service": "local-notebook-ai-api",
  "phase": "2",
  "environment": "development",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### 認証の動作確認

1. <http://localhost:3000/ja/login> で初期管理者としてログインする
2. 初回ログイン時は `must_change_password=true` のため
   `/ja/change-password`（構造のみのプレースホルダー）へ誘導される
3. トップページの認証ステータス表示から「My Notebooks」「Admin」へ遷移できる
4. 未ログイン状態で `/ja/notebooks` や `/ja/admin` へ直接アクセスすると
   `/ja/login?next=...` へリダイレクトされる
5. 一般ユーザー（adminロールでない）で `/ja/admin` にアクセスすると
   `/ja/notebooks` へリダイレクトされる

> 一般ユーザーを作成するAPI/画面はまだ存在しません（Phase 4のRBAC実装、
> Phase 14の管理画面で追加されます）。現時点で一般ユーザーの動作を確認したい場合は、
> `data/local-notebook-ai.sqlite` に直接レコードを追加してください。

---

## 6. ビルド・本番相当起動

### ビルド

```bash
pnpm build
```

または

```bash
npm run build
```

### 起動（ビルド済みアプリ）

```bash
pnpm start
```

または

```bash
npm start
```

---

## 7. その他のスクリプト

root の `package.json` から、以下のスクリプトを各ワークスペースへ委譲しています。

| スクリプト | 内容 |
|---|---|
| `pnpm dev` | web + api を同時に開発起動 |
| `pnpm build` | api → web の順にビルド |
| `pnpm start` | ビルド済み api + web を同時起動 |
| `pnpm lint` | 全ワークスペースでlint実行 |
| `pnpm test` | 全ワークスペースでtest実行（現時点ではプレースホルダー） |
| `pnpm db:migrate` | SQLiteファイル作成 + 全テーブルのマイグレーション適用 |
| `pnpm db:seed` | `.env` の `INITIAL_ADMIN_*` から初期管理者を作成（既存なら何もしない） |
| `pnpm --filter api db:generate` | スキーマ変更後に新しいマイグレーションSQLを生成（開発時のみ） |

---

## 8. Dockerについて

本アプリケーションは **Dockerを必須としません**。Node.js 24 LTS環境があれば、
`npm`/`pnpm` scriptsのみで開発・起動が可能です。Docker Composeは将来、環境差分の吸収や
授業配布、PostgreSQL/MinIO検証用途として任意で追加され得ますが、それが唯一の起動手段には
しません。

---

## 9. 実装状況

### 実装済み（Phase 1〜16）

- monorepo基盤（Next.js frontend / NestJS backend / 共有パッケージ）
- `.env` の読み込みと型検証（Zod）、不足時の分かりやすいエラー表示
- SQLiteスキーマ（users, notebooks, files, document_chunks, chat_sessions,
  chat_messages, models, system_settings, rag_runs, audit_logs, sessions）
- 初期管理者のseed（bcryptによるパスワードハッシュ化）
- Cookie-basedセッション認証（HttpOnly / SameSite=Lax / 本番ではSecure対応）
- CSRFトークン発行・検証（double-submit cookie方式、状態変更API全体に適用）
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/csrf`
- ログイン失敗時は原因を問わず同一の汎用エラー（アカウント有無・パスワード誤りを判別させない）
- `is_active=false` のユーザーはログイン不可（既存セッションも次のリクエストで無効化）
- `must_change_password=true` のユーザーをパスワード変更画面へ誘導する構造
- `/[locale]/login` ・ 保護ページ（`/[locale]/notebooks`, `/[locale]/admin`）の
  サーバーサイドリダイレクト（Next.js middleware）
- **RBAC**: `RolesGuard` + `@Roles()` / `@AdminOnly()` デコレータ（管理者専用APIをAPI側で強制）
- **所有者チェック**: `OwnershipGuard` + `@CheckOwnership()` デコレータ
  （notebook_id / file_idを直接指定されてもDB照会で所有者を検証。管理者もバイパスしない。
  クラスレベル/メソッドレベルどちらに付けても正しく機能する — 詳細は12章参照）
- 権限エラーは全経路で統一形式 `{"error":{"code":"FORBIDDEN","message":"..."}}`
- 監査ログ基盤（`AuditLogService`）— ログイン成功/失敗、ログアウト、
  ロール拒否（`authz.role_denied`）、所有者拒否（`authz.ownership_denied`）、
  管理者によるユーザー作成（`admin.user.created`）を記録
- `GET/POST /api/admin/users`（管理者専用、最小実装。完全な管理画面はPhase 14）
- **i18n基盤**: 日本語(ja)/英語(en)のUI切替。`apps/web/src/i18n/`配下にi18next互換の
  namespace別JSON（common/auth/notebook/admin）、ヘッダーからの言語切替UI
  （`AppHeader`）、ログイン画面・ノートブック領域・管理者領域の翻訳を実装
- **ノートブックCRUD**: `GET/POST /api/notebooks`, `GET/PUT/DELETE /api/notebooks/:id`
  （削除は論理削除、`deleted_at`。`defaultRagStrategy`の更新にも対応）。
  UIでも左カラムのノートブック一覧・新規作成フォーム・詳細画面
  （表示/編集/削除、RAG Strategyはダミー表示）を実装
- **ファイルアップロード**: `POST/GET /api/notebooks/:id/files`,
  `GET/DELETE /api/files/:id`。`LocalStorageAdapter`（`StorageAdapter`
  インターフェース実装、将来S3等へ差し替え可能）、UUID命名、
  MIMEタイプ・マジックナンバー検査、実行可能ファイル拒否、パストラバーサル防止。
  UIでもノートブック詳細画面の「Sources」セクションからアップロード・削除操作が可能
- **テキスト抽出・チャンク化**: アップロード完了時に同期実行（`DocumentProcessingService`）。
  PDF（`pdfjs-dist`、ページ単位でmetadata.pageを記録）、DOCX（`mammoth`）、
  TXT/Markdown（そのままUTF-8デコード）に対応。段落単位の素朴なチャンク分割で
  `document_chunks`に保存（owner_user_id / notebook_id / file_id を必ず記録）
- **Ollama接続・モデル管理**: `GET /api/admin/ollama/status`（接続確認）、
  `PUT /api/admin/ollama/settings`（既定生成/Embedding/HyDEモデル設定）、
  `GET /api/admin/models`（一覧）、`POST /api/admin/models/sync-ollama`（同期）、
  `PUT /api/admin/models/:id`（有効/無効切替）。
  管理画面に「Ollama Connection」「Models」タブを追加
- **Embedding・ベクトル検索**: チャンク作成直後に既定Embeddingモデルで
  ベクトル生成（`files.status`は`uploaded → extracting → chunking → embedding → ready`
  / 失敗時`failed`）。`document_chunks.embedding_vector_ref`にJSON配列として保存。
  `POST /api/notebooks/:id/search`でcosine similarity検索（owner_user_id +
  notebook_idで必ず絞り込み、RAG_TOP_K / RAG_SIMILARITY_THRESHOLDに対応）
- **Standard RAG / HyDE RAG**: `POST /api/notebooks/:id/chat`。`RagStrategy`
  インターフェースの下に`StandardRagStrategy`・`HydeRagStrategy`を実装し、
  両者は`AnswerGenerator`（実チャンクのみを根拠に回答生成）を共有することで
  「HyDE仮想文書を最終回答の根拠にしない」を構造的に保証。HyDE仮想文書は
  `rag_runs.hyde_document`に常に保存されるが、API応答に含めるかは
  `ALLOW_HYDE_DOCUMENT_PREVIEW`設定で制御（一般ユーザーには非表示、
  管理者には常に表示）。戦略の選択は
  ノートブック単位のオーバーライド（`ALLOW_NOTEBOOK_RAG_OVERRIDE`が真の場合）→
  管理設定（`system_settings`、`GET/PUT /api/admin/rag/settings`）→
  `.env`の`RAG_DEFAULT_STRATEGY`の優先順で解決。HyDE用prompt templateも
  同様に管理設定から編集可能
- **一般ユーザーUI（3カラムレイアウト）**: 左（`NotebookSidebar`、Phase 6から）・
  中央（`NotebookChatPanel`：チャットログ、引用元バッジ、Retrieval Details、
  RAG Strategy表示/切替）・右（`NotebookSourcesPanel`：アップロード、
  ファイル一覧、Preview/Summary/Deleteボタン）。ヘッダーにRole表示を追加。
  `GET /api/files/:id/preview`（新規、抽出済みチャンク内容を返す）でPreview
  ボタンが実際に機能。Summaryボタンは「未実装」を明示するプレースホルダー
  （生成AIによる要約機能は未実装のため）。LLM出力は常にプレーンテキストで
  レンダリング（`dangerouslySetInnerHTML`不使用、React標準のエスケープでXSS対策）
- **チャット履歴の永続表示**: `GET /api/notebooks/:id/chat/history`で全セッション・
  全期間の会話を時系列取得し、UIで日付区切り付きで表示。新しい質問は直前の
  セッションを引き継ぐ
- **管理画面UI（全11メニュー）**: Dashboard（ユーザー/ノートブック/ファイル/
  RAG実行数、Ollama接続状態）、Users（一覧・作成・ロール変更・有効無効切替）、
  Files（全ユーザー横断のファイル一覧、admin専用の唯一の所有者チェック例外）、
  Models・Ollama Connection（Phase 9から拡張）、RAG Settings（既定戦略・
  HyDEプロンプトテンプレート編集、Top K等は読み取り専用表示）、i18n/Storage/
  Security Settings（読み取り専用の設定確認画面）、Audit Logs（監査ログ一覧、
  設定変更系操作の記録漏れをこのPhaseで追加）、System Health
- **パスワード変更**: `POST /api/auth/change-password`。現在のパスワードを
  検証してから変更し、`mustChangePassword`を解除。`/change-password`画面が
  Phase 3以来のプレースホルダーから実際のフォームに置き換わった
- **監査ログの事象拡充（Phase 15）**: `notebook.created`・`notebook.deleted`・
  `file.uploaded`・`file.deleted`を追加記録。合わせて、フロントエンドだけで
  起きる問題（画面遷移の失敗等）をサーバーに報告する`POST /api/client-log`を
  新設し、`client.error`として同じ監査ログ画面に表示されるようにした
- **使い方ガイド**: トップページ（`/`）がPhase 3時代の開発者向けステータス
  表示から、管理画面「使い方ガイド」で編集できる利用者向けガイド文に置き換わった
- **セキュリティ強化（Phase 16）**: Helmet導入（`X-Content-Type-Options`・
  `X-Frame-Options`・既定CSP等）。レート制限（`@nestjs/throttler`、全体で
  10リクエスト/秒・200リクエスト/分、`/api/auth/login`と
  `/api/auth/change-password`は5リクエスト/分の専用制限）。RAGプロンプトへの
  Prompt Injection対策（検索コンテキストをデリミタで明示的に区切り、
  「データとして扱い指示として解釈しない」旨をプロンプト自体に明記）。
  以下は既存実装済みだったことを本Phaseで再確認：CSRF必須、パストラバーサル
  防止（`../../../../evil.txt`のような入力でも元ファイル名のbasenameのみ
  抽出しUUID保存名を使用）、SQL Injection対策（Drizzle ORMのクエリビルダの
  みを使用、生SQL文字列結合なし）、URL取り込み機能が存在しないこと（SSRF対策）

### 未実装（次Phase以降）

- ユーザー作成の自己申告フロー（現状は管理者作成のみ、初回ログイン時の
  パスワード変更は対応済み）
- ファイル要約（Summary）機能自体（ボタンはあるが「未実装」の案内のみ表示）
- 管理画面からのRAG Top K・類似度しきい値・各種フラグの変更（現状`.env`のみ、
  管理画面では読み取り専用表示）
- ユーザー自身によるlocale変更UI（現状は管理者作成時のlocale指定と、
  ログイン時に保存済みlocaleへリダイレクトする形のみ対応）
- S3等オブジェクトストレージ対応（Storage Settings画面にプレースホルダーのみ表示）

---

## 10. 外部ソースコード利用ポリシー

本プロジェクトの実装では、外部アプリケーション・OSSアプリケーション・GitHubリポジトリ・
商用製品・SaaS・ブログ・記事・サンプル実装等のソースコードのコピー、改変コピー、貼り付け、
実質的な再利用を禁止しています。公式ドキュメントの参照、npmパッケージの通常利用、
公式CLI（`next`, `nest`, `drizzle-kit` 等）による初期雛形生成のみ許可されます。

---

## 11. Phase成果物の出力方針

各Phaseの実装成果物は、Zip/tar.gzなどのアーカイブにまとめず、ファイル1つ1つを個別に
出力する方針で開発を進めています。変更ファイルは差分ではなく、変更後の完全なファイル
内容として管理します。

---

## 12. 既知の問題と修正履歴（重要）

### Phase 10で発見・修正: OwnershipGuardがクラスレベルのデコレータを無視していた（重大）

**発見の経緯**: Phase 10で`SearchController`を実装した際、クラスレベルに
`@CheckOwnership(...)`を付けたが、他ユーザーのnotebook_idを指定してもエラーに
ならない（403にならない）ことに気づいた。

**原因**: `OwnershipGuard`が`this.reflector.get(OWNERSHIP_KEY, context.getHandler())`
という、**メソッド単位のメタデータしか見ない実装**になっていた。NestJSの
`SetMetadata`はクラスに付けるとクラス（コンストラクタ）にメタデータを記録するため、
`context.getHandler()`（実行されるメソッド自体）からはそのメタデータを取得できず、
ガードは「所有者チェックの指定なし」と判断してチェックをスキップしてしまう。

**影響範囲**: `@CheckOwnership`をクラスレベルに付けていたコントローラすべてが対象。
具体的には：
- **`NotebookFilesController`（Phase 7で実装）**: `POST/GET /api/notebooks/:notebookId/files`
  （ファイルアップロード・一覧）。**Phase 7〜9の間、他ユーザーのnotebook_idを
  指定すれば、誰でも任意のノートブックにファイルをアップロードしたり、
  ファイル一覧を取得できていた可能性がある。**
- `SearchController`（Phase 10で新規実装、リリース前に発見）

一方、`NotebooksController`・`FilesController`（`GET/PUT/DELETE /api/notebooks/:id`,
`GET/DELETE /api/files/:id`）はメソッドレベルに`@CheckOwnership`を付けていたため、
この問題の影響を受けていない（Phase 6/7のテストで403が正しく確認できていたのはこのため）。

**修正内容**: `OwnershipGuard`を`this.reflector.getAllAndOverride(OWNERSHIP_KEY,
[context.getHandler(), context.getClass()])`に変更し、メソッド・クラスどちらに
付けても正しく認識されるようにした。修正後、`NotebookFilesController`・
`SearchController`両方で他ユーザーのnotebook_idに対する403が正しく返ることを
再確認済み（Phase 10のテストで確認）。

**対応が必要な場合**: 既にこのアプリケーションを他のユーザーと共有する形で
運用していた場合、Phase 7リリース以降に他ユーザーが自分のノートブックへ
不正にファイルをアップロードしていないか、監査ログ（現時点では
`authz.ownership_denied`イベントのみ記録対象のため、この不具合が有効だった間の
不正アクセス自体は記録されていない点に注意）やstorageディレクトリの内容を
確認することを推奨する。

---
