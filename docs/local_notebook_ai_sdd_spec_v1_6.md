# Local Notebook AI
## SDD実装仕様書 v1.6

NotebookLM風・複数ユーザー対応・Ollama接続・RAG方式切替対応  
Node.js 24 LTS / Next.js / NestJS / SQLite / Local Storage

> v1.2では、外部アプリケーション等のソースコード利用禁止ポリシーと、Phaseごとの実装成果物をZipではなくファイル1つ1つで出力するルールを追加する。

> **v1.6での変更点**：Phase 1〜20の実装・実運用を経て判明した、当初設計（v1.2）と
> 実装の乖離を反映した。主な変更は以下の通り（詳細は各該当節に「v1.6追加」
> 「v1.6更新」として記載）。
> - データモデルに`sessions`テーブル（§11.11）・`files`の要約用4カラム（§11.3）・
>   `models.is_default_hyde`（§11.7）を追加（実装済みで仕様書に未反映だったもの）
> - `.env.example`（§8.2・14.1）を実際の運用内容に更新し、未実装だった変数
>   （S3関連、アップロード制限の`.env`化等）を削除、Ollama生成チューニング用の
>   4変数を追加
> - API仕様（§15）を実装済みエンドポイントに合わせて更新（ファイル要約・
>   システム状態・秘匿値開示・パスワード変更・使い方ガイド等を追加、
>   実装しなかったエンドポイントを削除）
> - ファイル要約機能（Phase 17）・Ollama生成チューニングと秘匿値表示
>   （Phase 18）を各節に反映
> - 監査ログ（§16.9）・受け入れ条件（§20）・READMEに含める内容（§25）を
>   実装内容に合わせて更新
>
> Phaseごとの詳細な実装経緯・議論は`local_notebook_ai_implementation_prompts_v1_6.md`、
> プロジェクト運用ルールは`PROJECT_PROMPT.md`（v1.6）を参照。

---

# 0. この仕様書の目的

この仕様書は、GPT-5.5、Claude、その他のLLMコーディングエージェントに対して、仕様駆動開発（SDD: Specification Driven Development）で実装を依頼するための実装仕様書である。

通常の企画書ではなく、以下を目的とする。

1. 実装時の判断を減らす
2. LLMが誤解しやすい点を明示する
3. 画面、API、DB、権限、RAG処理、セキュリティの要件を統一する
4. MVPの完了条件を明確にする
5. 後からS3、PostgreSQL、Rerank RAGなどへ拡張しやすくする
6. 外部アプリケーション等のソースコード利用禁止を明確にする
7. Phaseごとの実装成果物を個別ファイルとして出力する方針を明確にする

---

# 1. プロダクト概要

## 1.1 名称

仮称: **Local Notebook AI**

## 1.2 概要

Local Notebook AIは、NotebookLM風の資料アップロード型RAG Webアプリケーションである。

ユーザーはログイン後、自分のノートブックを作成し、PDF、Markdown、TXT、DOCXなどの資料をアップロードする。  
アップロードされた資料はテキスト抽出、チャンク化、Embedding処理を経て、ノートブック単位で検索可能になる。  
ユーザーはノートブックに対して質問し、アップロード資料に基づく回答と引用元を得る。

LLM実行環境にはOllamaを利用する。  
管理者は管理画面から、Ollama接続、モデル、RAG方式、ユーザー、ファイル、ストレージ、セキュリティ設定を管理できる。

---

# 2. NotebookLMとの違い

本アプリケーションはNotebookLM風のUI/UXを参考にするが、NotebookLMそのものの単純な個人用クローンではない。

本アプリケーションは、**大学、研究室、授業、企業、自治体、病院・福祉施設などの組織内で、複数ユーザーがログインして利用するRAG基盤**として設計する。

そのため、次の点を中核要件とする。

1. 複数ユーザー利用を前提にする
2. 管理者と一般ユーザーのロールを分離する
3. ユーザーごとにノートブックを分離する
4. ユーザーごとにアップロードファイルを分離する
5. 一般ユーザーは他ユーザーのノートブック、ファイル、チャット履歴、RAG実行ログへアクセスできない
6. 管理者は全体設定、ユーザー、モデル、RAG方式、ファイル監査、監査ログを管理できる
7. RAG検索時にも `owner_user_id` と `notebook_id` によって検索範囲を制限する
8. UI制御だけでなく、API側で必ず認可を行う

---

# 3. 想定利用シナリオ

## 3.1 授業利用

教員または管理者が学生ユーザーを作成する。  
学生は自分のノートブックに授業資料、メモ、レポート要件などをアップロードし、それらに対して質問する。  
学生は他の学生の資料にはアクセスできない。

## 3.2 研究室利用

研究室メンバーが各自の文献、メモ、実験資料をアップロードする。  
管理者はモデル設定、RAG方式、ストレージ使用量、監査ログを確認できる。

## 3.3 組織内ナレッジ利用

企業、自治体、病院、福祉施設などで、部署またはユーザーごとにノートブックを作成して利用する。  
機密資料を扱う可能性があるため、所有者チェック、ロール管理、監査ログ、ファイルアクセス制御を必須とする。

---

# 4. 技術スタック

## 4.1 標準構成

| 領域 | 採用技術 |
|---|---|
| Runtime | Node.js 24 LTS |
| Package Manager | pnpm推奨。ただしroot scriptsはnpmからも実行可能にする |
| Monorepo | pnpm workspaces |
| Frontend | Next.js + React + TypeScript |
| Backend | NestJS + TypeScript |
| Database | SQLite（WALモード） |
| ORM | **Drizzle ORM** + better-sqlite3（v12系固定）。Prismaは不採用（CLIのバイナリ
外部CDNダウンロードが閉域網で失敗する問題のため。§4.3相当の判断） |
| Auth | Cookie-based session |
| Password Hash | bcryptjs |
| File Storage | ローカル指定ディレクトリ |
| Future Storage | S3 / MinIO / IBM Cloud Object Storage |
| LLM Runtime | Ollama |
| i18n | i18next互換JSON |
| Validation | Zod または class-validator |
| Security Headers | Helmet相当 |
| Test | Playwright（E2E、`e2e/`）。ユニットテストは本実装時点では未導入 |

## 4.2 Node.jsバージョン

Node.jsは **24 LTS** を標準対象とする。

`package.json`:

```json
{
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.15.0"
}
```

Docker image:

```text
node:24-bookworm-slim
```

## 4.3 Next.js単体にしない理由

Next.jsだけでも実装は可能である。  
しかし本アプリケーションでは、RAG処理、ファイル管理、Ollama接続、チャンク化、Embedding、監査ログ、RBACなどバックエンド責務が大きい。

そのため、Next.jsはUI層、NestJSはAPI/業務ロジック層として分離する。

```text
Browser
  → Next.js frontend
    → NestJS API
      → SQLite
      → Local Storage / future S3
      → Ollama
```

---

# 5. モノレポ構成

```text
local-notebook-ai/
  apps/
    web/                         # Next.js frontend
    api/                         # NestJS backend

  packages/
    shared/                      # shared types, constants, i18n keys
    storage/                     # StorageAdapter interface
    rag-core/                    # RAG strategy implementations

  prisma/ or drizzle/
    schema.prisma

  data/
    local-notebook-ai.sqlite

  storage/
    uploads/

  docs/
    sdd.md

  .env
  .env.example
  package.json
  pnpm-workspace.yaml
```

---

# 6. Backend構成

## 6.1 NestJSモジュール

```text
apps/api/src/
  app.module.ts

  modules/
    auth/
    users/
    notebooks/
    files/
    document-processing/
    models/
    ollama/
    rag/
    rag-strategies/
    storage/
    admin/
    audit-logs/
    i18n/
    security/
    system-settings/
```

## 6.2 主な責務

| モジュール | 責務 |
|---|---|
| auth | ログイン、ログアウト、セッション、CSRF |
| users | ユーザー管理、ロール管理、locale設定 |
| notebooks | ノートブックCRUD、所有者確認 |
| files | アップロード、削除、プレビュー、所有者確認 |
| document-processing | テキスト抽出、チャンク化 |
| models | Ollamaモデル一覧、管理画面用モデル設定 |
| ollama | Ollama API接続 |
| rag | チャット実行、検索、回答生成 |
| rag-strategies | Standard RAG、HyDE RAG |
| storage | LocalStorageAdapter、将来S3対応 |
| admin | 管理者API |
| audit-logs | 監査ログ |
| i18n | locale管理 |
| security | CSP、Helmet、Rate limit、CSRF |
| system-settings | 管理画面から変更する全体設定 |

---

# 7. Frontend構成

## 7.1 Next.js画面構成

```text
apps/web/src/app/
  [locale]/
    login/
      page.tsx
    change-password/
      page.tsx

    notebooks/
      page.tsx
      [notebookId]/
        page.tsx

    admin/
      dashboard/
        page.tsx
      usage-guide/
        page.tsx
      users/
        page.tsx
      files/
        page.tsx
      models/
        page.tsx
      rag-settings/
        page.tsx
      ollama/
        page.tsx
      i18n/
        page.tsx
      storage/
        page.tsx
      security/
        page.tsx
      audit-logs/
        page.tsx
      system-health/
        page.tsx
```

（v1.6更新：当初案にあった独立の`files/`トップレベル画面・`account/`画面は
実装されておらず、ファイル操作はノートブック画面右カラムの「ソース」パネルに
統合されている。`change-password/`・`admin/usage-guide/`・`admin/i18n/`・
`admin/system-health/`はPhase 15前後の追加実装、または後述のPhase 17〜18で
新設された画面。）

## 7.2 一般ユーザー画面

一般ユーザー画面は、以下の3カラム構成を基本とする。

```text
左: ノートブック一覧
中央: ノートブックに対するチャット
右: アップロード済みSources
```

機能:

- ノートブック作成
- 自分のノートブック一覧
- ファイルアップロード
- ファイルプレビュー
- ノートブック単位のチャット
- 引用付き回答
- RAG方式表示
- 管理者が許可した場合のみRAG方式切替
- Retrieval Details表示
- 言語切替

## 7.3 管理者画面

管理画面には以下を用意する。

```text
Dashboard
Usage Guide
Users
Files
Models
RAG Settings
Ollama Connection
i18n Settings
Storage Settings
Security Settings
Audit Logs
System Health
```

---

# 8. `.env` 設定

## 8.1 方針

`.env` は、環境ごとに異なる設定、秘密情報、起動時に決まる設定を管理する。  
管理画面から変更する運用設定はDBに保存する。

優先順位:

```text
1. ユーザー個別設定
2. ノートブック個別設定
3. 管理画面のDB設定
4. .env
5. アプリケーションのデフォルト値
```

## 8.2 `.env.example`

（v1.6更新：以下は実際にリポジトリで運用している内容に合わせて更新した。
当初案にあった`NODE_VERSION_POLICY`・`SQLITE_WAL`・`COOKIE_DOMAIN`・
`OLLAMA_REQUEST_TIMEOUT_MS`・S3関連変数・`ALLOWED_UPLOAD_MIME_TYPES`・
`BLOCK_EXECUTABLE_UPLOADS`は、実装時点でこれらを`.env`変数化せず、
コード側の固定値・実装ロジックとして扱う設計に変更したため削除した
（アップロード検証は拡張子許可リスト＋マジックナンバー検査として
`file-validation.ts`にハードコードされている。§16.5参照）。
S3ストレージは`STORAGE_DRIVER=s3`という値自体は将来の選択肢として
スキーマ上は残っているが、実装は`local`のみで、S3関連の`.env`変数は
未実装のため`.env.example`には含めない（§26 将来拡張参照）。）

```env
# ------------------------------------------------------------
# App
# ------------------------------------------------------------
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
PORT_WEB=3000
PORT_API=4000

# ------------------------------------------------------------
# Database
# ------------------------------------------------------------
DATABASE_URL=file:./data/local-notebook-ai.sqlite

# ------------------------------------------------------------
# Session / Cookie
# ------------------------------------------------------------
SESSION_SECRET=change-this-to-a-long-random-string
SESSION_COOKIE_NAME=lna_session
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

# ------------------------------------------------------------
# CSRF
# ------------------------------------------------------------
CSRF_COOKIE_NAME=lna_csrf
CSRF_HEADER_NAME=x-csrf-token

# ------------------------------------------------------------
# Ollama
# ------------------------------------------------------------
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_GENERATION_MODEL=phi4-mini:3.8b
DEFAULT_EMBEDDING_MODEL=nomic-embed-text:latest
# （v1.6追加）RAG回答生成・HyDE仮想文書生成・要約生成すべてに使われる
# 生成パラメータ。小規模ローカルモデル特有の生成ブレ・暴走への対処として
# Phase 18で追加した（詳細は§14.1参照）。
OLLAMA_GENERATION_TEMPERATURE=0.2
OLLAMA_HYDE_MAX_OUTPUT_TOKENS=400
OLLAMA_ANSWER_MAX_OUTPUT_TOKENS=1024
OLLAMA_DISABLE_THINKING=true

# ------------------------------------------------------------
# Storage
# ------------------------------------------------------------
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=./storage
MAX_UPLOAD_SIZE_MB=50

# ------------------------------------------------------------
# i18n
# ------------------------------------------------------------
DEFAULT_LOCALE=ja
SUPPORTED_LOCALES=ja,en

# ------------------------------------------------------------
# RAG
# ------------------------------------------------------------
RAG_DEFAULT_STRATEGY=hyde
RAG_TOP_K=8
RAG_SIMILARITY_THRESHOLD=0.68
ALLOW_NOTEBOOK_RAG_OVERRIDE=true
SHOW_RETRIEVAL_DEBUG=true
ALLOW_HYDE_DOCUMENT_PREVIEW=false

# ------------------------------------------------------------
# Initial Admin
# ------------------------------------------------------------
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=change-me-on-first-login
INITIAL_ADMIN_LOCALE=ja
```

---

# 9. 多言語対応

## 9.1 対応言語

- 日本語: `ja`
- 英語: `en`

## 9.2 i18n形式

i18next互換JSONを使う。

```text
apps/web/src/i18n/
  index.ts
  locales/
    ja/
      common.json
      admin.json
      notebook.json
      auth.json
    en/
      common.json
      admin.json
      notebook.json
      auth.json
```

## 9.3 方針

- UI文言をコードに直接埋め込まない
- 画面単位でnamespaceを分ける
- DBに保存するユーザー生成コンテンツは翻訳しない
- モデル出力はユーザー入力言語またはユーザー設定言語に従う
- ユーザーごとに `locale` を保存する
- ヘッダーに言語切替UIを置く

## 9.4 サンプル

`ja/admin.json`

```json
{
  "dashboard": "ダッシュボード",
  "users": "ユーザー管理",
  "files": "ファイル管理",
  "models": "モデル管理",
  "ragSettings": "RAG設定",
  "storageSettings": "ストレージ設定",
  "securitySettings": "セキュリティ設定",
  "defaultRagStrategy": "既定のRAG方式",
  "standardRag": "標準RAG",
  "hydeRag": "HyDE RAG",
  "allowNotebookOverride": "ノートブック単位の切替を許可",
  "showRetrievalDebug": "検索デバッグを表示"
}
```

`en/admin.json`

```json
{
  "dashboard": "Dashboard",
  "users": "Users",
  "files": "Files",
  "models": "Models",
  "ragSettings": "RAG Settings",
  "storageSettings": "Storage Settings",
  "securitySettings": "Security Settings",
  "defaultRagStrategy": "Default RAG Strategy",
  "standardRag": "Standard RAG",
  "hydeRag": "HyDE RAG",
  "allowNotebookOverride": "Allow Notebook-Level Override",
  "showRetrievalDebug": "Show Retrieval Debug"
}
```

---

# 10. ロールと権限

## 10.1 ロール

### admin

管理者。  
組織全体の設定、ユーザー、モデル、ファイル、RAG設定、監査ログを管理できる。

### user

一般ユーザー。  
自分のノートブック、ファイル、チャットのみ利用できる。

## 10.2 管理者ができること

- ユーザー作成
- ユーザー停止
- ロール変更
- 全ファイル一覧確認
- 必要に応じたファイル監査
- Ollama接続設定
- モデル管理
- 既定モデル設定
- RAG Strategy設定
- HyDEプロンプト編集
- Storage設定
- i18n設定
- Security設定
- Audit Log確認

## 10.3 一般ユーザーができること

- ログイン
- 自分のノートブック作成
- 自分のノートブック一覧表示
- 自分のファイルアップロード
- 自分のファイルプレビュー
- 自分のファイル削除
- 自分のノートブックに質問
- 引用付き回答確認
- UI言語切替
- 許可された場合のみノートブック単位でRAG方式切替

## 10.4 禁止事項

一般ユーザーは以下を行えない。

- 他ユーザーのノートブック閲覧
- 他ユーザーのファイル閲覧
- 他ユーザーのファイルダウンロード
- 他ユーザーのチャット履歴閲覧
- 他ユーザーのRAG実行ログ閲覧
- システム全体のモデル設定変更
- システム全体のRAG設定変更
- Ollama接続設定変更
- 監査ログ閲覧

---

# 11. データモデル

## 11.1 users

```text
id
email
password_hash
display_name
role
locale
is_active
must_change_password
created_at
updated_at
last_login_at
```

## 11.2 notebooks

```text
id
owner_user_id
title
description
default_rag_strategy
created_at
updated_at
deleted_at
```

## 11.3 files

```text
id
owner_user_id
notebook_id
original_filename
stored_object_key
mime_type
size_bytes
status
sha256
summary_text
summary_generated_at
summary_model
summary_truncated
created_at
updated_at
deleted_at
```

（v1.6追加：`summary_text`・`summary_generated_at`・`summary_model`・
`summary_truncated`はPhase 17で追加。すべてNULL/false許容で、既存行の
バックフィルは不要。ファイル要約機能（§13末尾・15.3参照）が生成した要約を
キャッシュする。`summary_model`はモデル名の文字列で、`models.id`への外部
キーではない。）

status:

```text
uploaded
extracting
chunking
embedding
ready
failed
deleted
```

## 11.4 document_chunks

```text
id
owner_user_id
notebook_id
file_id
chunk_index
content
metadata_json
embedding_vector_ref
created_at
```

初期SQLite実装では、EmbeddingベクトルはJSONまたは別ファイルで保持してよい。  
ただし、将来的なPostgreSQL + pgvector移行を想定して、抽象化する。

## 11.5 chat_sessions

```text
id
owner_user_id
notebook_id
title
created_at
updated_at
```

## 11.6 chat_messages

```text
id
chat_session_id
owner_user_id
notebook_id
role
content
citations_json
rag_run_id
created_at
```

role:

```text
user
assistant
system
```

## 11.7 models

```text
id
provider
name
model_type
is_enabled
is_default_generation
is_default_embedding
is_default_hyde
created_at
updated_at
```

（v1.6追加：`is_default_hyde`はPhase 9で追加。§14.2の「HyDE生成モデル設定」
に対応する。）

model_type:

```text
generation
embedding
hyde_generation
reranker
```

## 11.8 system_settings

```text
id
key
value_json
created_at
updated_at
```

## 11.9 rag_runs

```text
id
user_id
notebook_id
strategy_name
query
hyde_document
retrieved_chunk_ids_json
latency_ms
created_at
```

## 11.10 audit_logs

```text
id
actor_user_id
action
resource_type
resource_id
metadata_json
ip_address
user_agent
created_at
```

## 11.11 sessions（v1.6追加）

当初のSDD（v1.2）のデータモデルには含まれていなかったが、Phase 3の
Cookie-basedセッション認証実装にあたり追加した。JWT等のステートレス
トークンではなく、サーバー側で失効可能なセッションストアとする設計判断
（§16.1参照）に伴う、実装上必須のテーブル。

```text
id
user_id
created_at
expires_at
```

Cookieには`id`（不透明なランダムトークン）のみを持たせ、ユーザー情報を
クライアント側に埋め込むことはしない。

## 11.12 future: notebook_members

初期MVPでは共有機能を実装しない。  
将来実装時は以下を追加する。

```text
id
notebook_id
user_id
role
created_at
updated_at
```

role:

```text
viewer
editor
notebook_admin
```

---

# 12. ファイル保存

## 12.1 初期方式

初期実装では、ファイル実体をサーバー上の指定ディレクトリに保存する。

```text
storage/
  uploads/
    {user_id}/
      {notebook_id}/
        original/
        extracted/
        chunks/
```

## 12.2 重要ルール

- 元ファイル名はDBに保存する
- 実体ファイル名はUUIDにする
- 保存パスにユーザー入力値を使わない
- Web公開ディレクトリには置かない
- ファイルアクセス時は必ず所有者確認する
- MIMEタイプを検査する
- マジックナンバーを検査する
- 実行可能ファイルは拒否する
- 最大ファイルサイズを制限する

## 12.3 Storage Adapter

保存方式はAdapterで抽象化する。

```ts
export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<NodeJS.ReadableStream>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
```

初期実装:

```text
LocalStorageAdapter
```

将来実装:

```text
S3StorageAdapter
MinioStorageAdapter
IBMCloudObjectStorageAdapter
```

---

# 13. RAG仕様

## 13.1 対応RAG方式

MVPでは以下に対応する。

1. Standard RAG
2. HyDE RAG

将来拡張候補:

1. Rerank RAG
2. Hybrid Search RAG
3. Multi-query RAG
4. Graph RAG

## 13.2 Standard RAG

```text
User query
→ Embed query
→ Vector search
→ Retrieve chunks
→ Generate answer
→ Return answer with citations
```

特徴:

- 実装が単純
- 応答が速い
- 基準方式として有用
- 短く曖昧な質問では検索精度が落ちる場合がある

## 13.3 HyDE RAG

HyDEは Hypothetical Document Embeddings の略称である。

```text
User query
→ Generate hypothetical document
→ Embed hypothetical document
→ Vector search
→ Retrieve real chunks
→ Generate answer using only real chunks
→ Return answer with citations
```

重要:

- HyDEで生成した仮想文書は検索用である
- 仮想文書を最終回答の根拠にしてはいけない
- 最終回答は実文書チャンクのみを根拠にする
- 検索結果に根拠がない場合は「資料からは確認できません」と答える

## 13.4 HyDE Prompt Template

```text
あなたは検索クエリ拡張のための文書生成器です。
以下の質問に答えるために、検索対象文書に含まれていそうな説明文を作成してください。

注意:
- 実際の回答を断定しない
- 固有名詞や数値を捏造しない
- 検索に有用な関連語を含める
- 300〜600文字程度で書く

質問:
{{ query }}

仮想文書:
```

## 13.5 回答生成プロンプトの制約

```text
以下の検索コンテキストだけを根拠に回答してください。

制約:
- 検索コンテキストにない内容を断定しない
- HyDEで生成された仮想文書は検索用であり、回答根拠として使用しない
- 根拠がない場合は「資料からは確認できません」と回答する
- 回答には引用元を付ける
```

## 13.6 検索範囲制限

RAG検索時には必ず以下でフィルタする。

```text
owner_user_id = current_user.id
notebook_id = requested_notebook_id
```

管理者であっても、通常のRAGチャット実行時には対象ノートブックの範囲に限定する。  
管理者監査用検索は別APIとして実装する。

---

# 14. Ollama連携

## 14.1 設定

```env
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_GENERATION_MODEL=phi4-mini:3.8b
DEFAULT_EMBEDDING_MODEL=nomic-embed-text:latest
# （v1.6追加、Phase 18）RAG回答生成・HyDE仮想文書生成・要約生成の生成
# パラメータ。管理者がモデルを自由に選べる設計である以上、モデルごとに
# 適切な値が変わりうるため、コードにハードコードせず.envで調整可能にする。
OLLAMA_GENERATION_TEMPERATURE=0.2
OLLAMA_HYDE_MAX_OUTPUT_TOKENS=400
OLLAMA_ANSWER_MAX_OUTPUT_TOKENS=1024
OLLAMA_DISABLE_THINKING=true
```

`OLLAMA_DISABLE_THINKING`は、Ollamaの生成リクエストのトップレベルに
`think: false`を送ることで、内部の「思考（thinking）」モードを持つ一部の
モデル（Granite・Qwen3等）が、要求した出力の代わりに内部の思考過程を
そのまま返してしまう事象を抑制する（`options`オブジェクトの中ではない点に
注意）。モデル・Ollamaのバージョンによっては効果が無い場合がある。

## 14.2 管理画面でできること

- Ollama接続確認
- 利用可能モデル一覧取得
- 既定生成モデル設定
- 既定Embeddingモデル設定
- HyDE生成モデル設定
- モデル有効化/無効化

## 14.3 API方針

Ollamaへの直接アクセスはFrontendから行わない。  
必ずNestJS APIを経由する。

---

# 15. API仕様

（v1.6更新：当初案から実装時に変わった点が複数ある。個別ノートブック単位の
`GET/PUT /api/notebooks/{id}/rag-setting`は独立エンドポイントとして実装せず、
`PUT /api/notebooks/{id}`（`defaultRagStrategy`フィールド）に統合した。
`POST /api/admin/rag/test`、管理者によるStorage/Security設定の
`GET/PUT`は実装しなかった（Storage/Security設定は`.env`のみで変更する
読み取り専用表示という運用方針に確定したため。§20.5参照）。実装した
一覧は以下の通り。）

## 15.1 Auth

```http
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/auth/csrf
POST /api/auth/change-password
```

`POST /api/auth/change-password`はPhase 3で当初プレースホルダーだったものを
Phase 15直後に実装した（現在のパスワードの検証を必須にする。§16.1参照）。

## 15.2 Notebooks

```http
GET    /api/notebooks
POST   /api/notebooks
GET    /api/notebooks/{id}
PUT    /api/notebooks/{id}
DELETE /api/notebooks/{id}
```

`PUT /api/notebooks/{id}`は`title`・`description`に加え、`defaultRagStrategy`
（`standard` | `hyde`）も更新できる。個別の`/rag-setting`エンドポイントは
実装していない。

## 15.3 Files

```http
POST   /api/notebooks/{id}/files
GET    /api/notebooks/{id}/files
GET    /api/files/{file_id}
GET    /api/files/{file_id}/preview
POST   /api/files/{file_id}/summary
DELETE /api/files/{file_id}
```

- `GET /api/files/{file_id}/preview`：抽出済みチャンクのテキストを返す
  （元ファイルのバイト列は返さない。Phase 13）
- `POST /api/files/{file_id}/summary`：要約を生成（初回）・再生成する
  （v1.6追加、Phase 17）。生成済みの要約は`GET /api/files/{file_id}`・
  `GET /api/notebooks/{id}/files`のレスポンスに含まれる`summaryText`等の
  フィールドからも参照できるため、専用の取得エンドポイントは設けていない

## 15.4 Chat / RAG

```http
POST /api/notebooks/{id}/chat
GET  /api/notebooks/{id}/chat/history
```

`GET/PUT /api/notebooks/{id}/rag-setting`は実装せず、RAG方式の変更は
`PUT /api/notebooks/{id}`に統合した（15.2参照）。

## 15.5 Admin

```http
GET  /api/admin/dashboard
GET  /api/admin/users
POST /api/admin/users
PUT  /api/admin/users/{id}

GET  /api/admin/files

GET  /api/admin/models
POST /api/admin/models/sync-ollama
PUT  /api/admin/models/{id}

GET  /api/admin/ollama/status
PUT  /api/admin/ollama/settings

GET  /api/admin/rag/settings
PUT  /api/admin/rag/settings

GET  /api/admin/audit-logs

GET  /api/admin/system-info
POST /api/admin/system-info/reveal-secret

GET  /api/usage-guide
PUT  /api/admin/usage-guide

POST /api/client-log
```

- `PUT /api/admin/models/{id}`：モデルの有効/無効を切り替える
  （`isEnabled`のみ）。既定生成/既定Embedding/既定HyDEの指定は
  `PUT /api/admin/ollama/settings`で行う
- `POST /api/admin/rag/test`、`GET/PUT /api/admin/storage/settings`、
  `GET/PUT /api/admin/security/settings`は実装しなかった。Storage/
  Security設定は`.env`のみで変更する読み取り専用表示という運用方針に
  確定したため（管理画面の該当タブは`GET /api/admin/system-info`の
  値をそのまま表示するのみ）
- `GET /api/admin/system-info`（v1.6追加、Phase 18）：他の設定タブに
  表示されていない`.env`由来の値（アプリURL・ポート・DBパス・Ollama
  生成チューニング値・CSRFのCookie名/ヘッダー名等）を返す。
  `SESSION_SECRET`・`INITIAL_ADMIN_PASSWORD`は生の値を含めず、
  「設定済み（n文字）」／「プレースホルダーのまま」という状態のみ返す
- `POST /api/admin/system-info/reveal-secret`（v1.6追加、Phase 18）：
  `SESSION_SECRET`または`INITIAL_ADMIN_PASSWORD`のどちらか一方の生の値を、
  管理者が明示的に要求した時だけ返す。呼び出しのたびに監査ログへ記録する
  （値そのものは記録しない。§16.9・20.6参照）
- `GET /api/usage-guide`・`PUT /api/admin/usage-guide`（Phase 15直後に
  追加）：トップページに表示する利用者向けガイド文を、管理者が編集できる
- `POST /api/client-log`（Phase 15直後に追加）：サーバーからは見えない
  ブラウザ側だけの問題（画面遷移の失敗等）を、既存の監査ログに
  `client.*`という命名のactionとして記録する

## 15.6 API共通ルール

- JSON APIとする
- 状態変更APIはCSRF必須
- すべての入力をValidationする
- 一般ユーザーAPIは所有者確認を必須にする
- 管理者APIはadminロール必須
- エラー形式を統一する

エラー例:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource."
  }
}
```

---

# 16. セキュリティ要件

## 16.1 認証

- Cookie-based session
- `HttpOnly`
- 本番では `Secure`
- `SameSite=Lax` または `SameSite=Strict`
- パスワードはbcryptjs（saltRounds=12）でハッシュ化
- ログイン失敗回数制限（5回/分、`/api/auth/login`・`/api/auth/change-password`
  それぞれ専用。v1.6追記）
- 初期管理者パスワードは初回ログイン後に変更を要求する（`POST
  /api/auth/change-password`、現在のパスワードの検証必須。§15.1参照）

## 16.2 認可

- APIごとに認可チェック
- 一般ユーザーは自分のリソースのみ操作可能
- 管理者APIはadminのみ
- UI表示制御だけに依存しない
- Backendで所有者確認を必ず実施
- RAG検索時も `owner_user_id` と `notebook_id` で検索範囲を制限する

禁止:

- 一般ユーザーが他ユーザーのnotebook_idを直接指定してアクセスできること
- 一般ユーザーが他ユーザーのfile_idを直接指定してダウンロードできること
- ベクトル検索結果に他ユーザーのチャンクが混入すること

## 16.3 CSRF

Cookieセッションを使うため、状態変更APIにはCSRFトークンを必須にする。

対象:

```text
POST
PUT
PATCH
DELETE
```

Header:

```http
X-CSRF-Token: {token}
```

## 16.4 XSS

- Reactの自動エスケープを利用
- `dangerouslySetInnerHTML` は原則禁止
- MarkdownプレビューはDOMPurify等でサニタイズ
- LLM出力をHTMLとして直接描画しない
- CSPを設定する

推奨CSP:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
```

## 16.5 ファイルアップロード

- 最大サイズ制限
- MIMEタイプ制限
- マジックナンバー検査
- 実体ファイル名はUUID
- パストラバーサル防止
- 所有者確認
- 実行可能ファイル拒否
- 必要に応じてウイルススキャン連携

## 16.6 SQL Injection

- ORMまたはパラメータ化クエリを使う
- SQL文字列結合は禁止
- 入力値はValidationする

## 16.7 Prompt Injection

- 資料内の命令をシステム命令として扱わない
- 取得チャンクは参考資料として扱う
- システムプロンプトや管理設定を資料経由で変更できない
- 外部URLへの自動アクセスは禁止
- ユーザー資料内の「前の命令を無視せよ」等を実行してはいけない

## 16.8 SSRF

初期MVPではURL取り込み機能を提供しない。  
将来実装時は以下を禁止する。

- localhost
- private IP
- link-local
- cloud metadata service
- file URL
- internal network URL

## 16.9 監査ログ

以下を記録する。

- ログイン成功
- ログイン失敗
- ログアウト
- パスワード変更成功・失敗（v1.6追記：`.env`変数追加ではなくPhase 15直後の
  実装追加）
- ユーザー作成
- ユーザー変更
- ユーザー停止
- ファイルアップロード
- ファイル削除
- ファイル要約生成（v1.6追加、Phase 17。使用モデル名・切り捨ての有無を
  記録し、要約本文そのものは記録しない）
- ノートブック作成
- ノートブック削除
- モデル設定変更
- RAG設定変更
- Ollama設定変更
- 秘匿設定値の開示（v1.6追加、Phase 18。`SESSION_SECRET`・
  `INITIAL_ADMIN_PASSWORD`のどちらを表示したかのキー名のみを記録し、
  値そのものは記録しない）
- 管理者API実行
- クライアント側でのみ検知した問題報告（v1.6追記：`client.*`という
  action名で記録される。Phase 15直後の実装追加）

（v1.6注記：「Storage設定変更」は、Storage設定がPUTで変更可能という
当初案を前提にした記述だった。実装ではStorage/Security設定は`.env`のみで
変更する読み取り専用表示に確定したため、このイベントは実際には発生しない。
§15.5参照。）

---

# 17. 非機能要件

## 17.1 保守性

- NestJSのModule単位で責務を分ける
- Next.jsはUIに集中する
- RAG StrategyはStrategy Patternで実装する
- StorageはAdapter Patternで実装する
- i18n文言はJSONに分離する

## 17.2 可搬性

- Node.js 24 LTSで動作する
- Docker Composeで起動できる
- 初期DBはSQLite
- 初期ファイル保存はローカルディレクトリ
- 将来S3/PostgreSQLへ移行できる

## 17.3 性能

MVPでは大規模運用を対象にしない。  
ただし、複数ユーザーが同時利用する前提で以下を守る。

- 長時間処理は非同期ジョブ化できる設計にする
- ファイル処理状態をstatusで管理する
- Ollama request timeoutを設定する
- 将来キュー導入を想定する

## 17.4 バックアップ

- SQLite DBを定期バックアップできる構造にする
- `storage/` ディレクトリをバックアップ対象にする
- 将来S3利用時はバケット単位のバックアップを検討する

---

# 18. 起動方法

## 18.1 基本方針

本アプリケーションは、**Dockerを必須としない**。  
Node.js 24 LTSがインストールされた環境で、通常のnpm/pnpm scriptsにより起動できることを必須要件とする。

Dockerは以下の場合の任意手段とする。

- 環境差分を小さくしたい場合
- 授業で同一環境を配布したい場合
- 本番環境に近い構成を検証したい場合
- 将来的にPostgreSQLやMinIOを含めて検証したい場合

MVPでは、まずローカル起動を優先する。

---

## 18.2 推奨起動方法

Package Managerはpnpmを推奨する。  
ただし、利用者が分かりやすいように、rootのnpm scriptsからも起動できるようにする。

### 初回セットアップ

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
```

### 開発起動

```bash
pnpm dev
```

または

```bash
npm run dev
```

このコマンドで、Next.js frontend と NestJS backend の両方を同時に起動する。

```text
Next.js: http://localhost:3000
NestJS API: http://localhost:4000
Ollama: http://localhost:11434
```

---

## 18.3 本番相当の起動

### Build

```bash
pnpm build
```

または

```bash
npm run build
```

### Start

```bash
pnpm start
```

または

```bash
npm start
```

`pnpm start` / `npm start` は、ビルド済みのNext.js frontend と NestJS backendを起動する。

---

## 18.4 root package.json scripts

（v1.6更新：前回の改訂時点では未確認だったため`apps/api`との整合を仮定して
記載していたが、実物を確認できたので確定版に更新した。実際には`db:generate`
は**root側には存在しない**——スキーマ変更時は`apps/api`ディレクトリに
`cd`してから`pnpm db:generate`を実行する必要がある。18.6参照。）

```json
{
  "scripts": {
    "dev": "concurrently -n web,api -c blue,green \"pnpm --filter web dev\" \"pnpm --filter api start:dev\"",
    "build": "pnpm --filter api build && pnpm --filter web build",
    "start": "concurrently -n api,web -c green,blue \"pnpm --filter api start:prod\" \"pnpm --filter web start\"",
    "lint": "pnpm --recursive lint",
    "test": "pnpm --recursive test",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

`concurrently` を使って、frontend/backendを同時起動する（`-n`でラベル、
`-c`で表示色を指定）。

---

## 18.5 apps/web package.json scripts

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "test": "vitest"
  }
}
```

---

## 18.6 apps/api package.json scripts

（v1.6更新：当初案はPrisma前提の記述だったが、実装はDrizzle ORMで確定して
いる。§4・11参照。以下は実際の内容。）

```json
{
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "echo \"[api] no tests yet\"",
    "db:generate": "node scripts/db-env.js drizzle-kit generate",
    "db:migrate": "node scripts/db-env.js drizzle-kit migrate",
    "db:seed": "node scripts/db-env.js tsx src/db/seed.ts"
  }
}
```

`db:generate`・`db:migrate`・`db:seed`はいずれも`scripts/db-env.js`という
ラッパー経由で実行する。このラッパーは、リポジトリルートの`.env`を読み込み、
`DATABASE_URL`が相対`file:`パスの場合はリポジトリルート基準の絶対パスに
解決してから、実際のコマンド（`drizzle-kit`・`tsx`）を実行する。CLI実行時
（`drizzle-kit`を直接叩いた場合）とアプリ実行時（`pnpm dev`）とでSQLite
ファイルの解決先がずれる不具合を防ぐための設計（§17.2可搬性の一環）。

`db:generate`は`schema.ts`を変更した時にのみ実行する。リポジトリを
クローンしただけの初回セットアップでは、マイグレーションファイルは
既にリポジトリに含まれているため不要（`db:migrate`→`db:seed`のみで
足りる。18.2参照）。`test`は本実装時点ではテストコードが無く、プレース
ホルダーのままである（`vitest`等の導入は将来課題）。

---

## 18.7 Docker Composeの位置づけ

Docker ComposeはMVPの必須要件ではない。  
ただし、将来的な運用・授業配布・PostgreSQL/MinIO検証のために、任意で追加してよい。

Docker Composeを追加する場合でも、以下の条件を満たすこと。

1. Dockerなしで `npm run dev` または `pnpm dev` できる
2. Dockerなしで `npm start` または `pnpm start` できる
3. Docker設定は通常起動の代替であり、唯一の起動方法にしない
4. `.env` による設定管理を維持する

---

## 18.8 本番デプロイ時の注意

本番では、Next.jsとNestJSをReverse Proxyで同一オリジン配下にまとめることが望ましい。  
同一オリジンにすることで、Cookie Session、CSRF、CORS設定を単純化できる。

例:

```text
https://example.local/
  → Next.js frontend

https://example.local/api/
  → NestJS API
```

---

# 19. MVP実装範囲

## 19.1 必須機能

- Node.js 24 LTSで起動
- pnpm workspaces
- Next.js frontend
- NestJS backend
- SQLite永続化
- `.env` 設定
- 管理者ログイン
- 一般ユーザーログイン
- ユーザー管理
- ノートブック作成
- ファイルアップロード
- ローカル指定ディレクトリ保存
- テキスト抽出
- チャンク化
- Embedding
- Ollama接続
- Standard RAG
- HyDE RAG
- RAG方式切替
- 引用付き回答
- 日本語/英語UI
- CSRF対策
- XSS対策
- RBAC
- 所有者チェック
- 監査ログ

## 19.2 MVPでは実装しないもの

- ノートブック共有
- S3本番保存
- PostgreSQL
- Graph RAG
- Reranker
- WebSocketリアルタイム応答
- URL取り込み
- 外部クラウドLLM連携
- 複雑な組織/部署階層
- 課金機能

ただし、将来実装できるように設計を妨げない。

---

# 20. 受け入れ条件

## 20.1 起動

- `pnpm install` で依存関係が入る
- `.env.example` から `.env` を作れる
- `pnpm dev` または `npm run dev` で起動できる
- Next.jsが3000番で起動する
- NestJS APIが4000番で起動する

## 20.2 認証

- 管理者でログインできる
- 一般ユーザーでログインできる
- ログアウトできる
- 未ログインでは保護ページにアクセスできない

## 20.3 マルチユーザー

- ユーザーAのノートブックはユーザーBに見えない
- ユーザーAのファイルはユーザーBに見えない
- ユーザーAのfile_idをユーザーBが直接指定しても403になる
- ユーザーAのnotebook_idをユーザーBが直接指定しても403になる
- RAG検索結果に他ユーザーのチャンクが混入しない

## 20.4 RAG

- Standard RAGで回答できる
- HyDE RAGで回答できる
- HyDE仮想文書は最終回答の根拠に使われない
- 回答に引用元が表示される
- 根拠がない場合は「資料からは確認できません」と回答する

## 20.5 管理画面

- ユーザー一覧を表示できる
- ファイル一覧を表示できる
- Ollama接続確認ができる
- モデル一覧を取得できる
- 既定生成モデルを設定できる
- 既定Embeddingモデルを設定できる
- Standard RAG / HyDE RAGを切り替えられる（ノートブックごとの`PUT
  /api/notebooks/{id}`経由。§15.2参照）
- HyDEプロンプトを編集できる
- 監査ログを確認できる
- 使い方ガイドを編集でき、編集内容がトップページに反映される（v1.6追記）
- （v1.6追加）システム状態画面で、他のタブに表示されていない`.env`値
  （Ollama生成チューニング値等）が確認できる
- （v1.6追加）ファイルの要約を生成・再生成でき、大きいファイルでは
  切り捨てられたことが画面に表示される

## 20.6 セキュリティ

- 状態変更APIにCSRFが必要
- XSSになるHTMLをチャットやMarkdownプレビューに入れても実行されない
- ファイル名に `../` が含まれても保存パスを突破できない
- 実行可能ファイルはアップロード拒否される
- 管理者APIは一般ユーザーから呼べない
- （v1.6追加）`SESSION_SECRET`・`INITIAL_ADMIN_PASSWORD`は、既定では
  画面に生の値が一切表示されず、管理者が明示的に「表示」を要求した時
  だけ表示される
- （v1.6追加）秘匿値を表示するたびに監査ログに記録される（値そのものは
  記録されない）

---


# 21. 外部ソースコード利用禁止ポリシー

## 21.1 基本方針

Local Notebook AIの実装では、外部アプリケーション、OSSアプリケーション、GitHubリポジトリ、商用製品、SaaS、ブログ、記事、サンプル実装等のソースコードを、コピー、改変コピー、貼り付け、または実質的に再利用してはならない。

本プロジェクトでは、仕様書に基づいて独自に実装することを原則とする。

## 21.2 禁止事項

以下を禁止する。

- 外部アプリケーションのソースコードを利用すること
- OSSアプリケーションのソースコードをコピーすること
- GitHub等の公開リポジトリからコードをコピーすること
- 商用製品、SaaS、OSSアプリケーションの実装を流用すること
- Stack Overflow、Qiita、Zenn、ブログ、記事、サンプル実装等のコードを貼り付けること
- ライセンス表記や出典明示を行えば外部コードを使える、という前提で外部コードを取り込むこと
- NotebookLM、Dify、Langflow、AnythingLLM、Open WebUI等の実装コードを引用・流用すること
- 外部リポジトリ由来の長いコード断片をLLMに生成させて採用すること

## 21.3 許可されるもの

以下は「外部ソースコード利用」ではなく、通常の開発行為として許可する。

- 公式ドキュメントを読んでAPI仕様や設定方法を理解すること
- npmパッケージを通常の依存関係として利用すること
- Next.js、NestJS、Prisma、Drizzle等の公式CLIが生成する初期雛形コード
- フレームワークの標準的な書き方に従って、仕様書に基づき独自にコードを書くこと
- 一般的・短小・定型的なコードパターンを自分で記述すること

ただし、外部アプリケーションの実装コードそのものをコピーしてはならない。

## 21.4 外部コードが必要に見える場合

実装中に外部コード利用が必要だと判断した場合でも、コードを取り込んではならない。

その場合は作業を停止し、以下を提示する。

- 外部コードを使わずに独自実装する代替案
- 利用しようとしていた機能の要件整理
- npmパッケージとして通常利用できるライブラリがあるか
- 公式ドキュメントに基づく実装方針

---

# 22. 実装成果物の個別ファイル出力ルール

## 22.1 基本方針

Phase 1〜Phase 18で生成・変更する実装成果物は、Zipやtar.gzなどのアーカイブにまとめてはならない。

生成・変更したソースコード、設定ファイル、README、テストファイル、i18n JSON、Prisma/Drizzleスキーマ等は、ファイル1つ1つを個別に出力する。

## 22.2 Phase完了時の必須出力

各Phaseの完了時には、以下を必ず行う。

1. 生成・変更したファイル一覧を表示する
2. 各ファイルのプロジェクト内パスを明示する
3. 各ファイルを個別にダウンロード可能な形で出力する
4. 既存ファイルを変更した場合は、差分ではなく変更後の完全なファイル内容を出力する
5. 複数ファイルを1つのMarkdownファイルにまとめない
6. Zip、tar.gz、その他のまとめアーカイブを作成しない

## 22.3 禁止事項

以下を禁止する。

- 実装成果物をZipでまとめること
- tar.gz等のアーカイブでまとめること
- 複数ファイルを1つのMarkdownにまとめること
- 差分だけを出して完全なファイル内容を出さないこと
- ファイルパス不明のコードブロックだけを出すこと
- 生成・変更したファイルを省略すること

## 22.4 Phase完了報告形式

各Phase完了時は、以下の形式で報告する。

```text
## Phase X 完了報告

### 実行した内容
- ...

### 生成・変更したファイル
1. package.json
2. pnpm-workspace.yaml
3. apps/web/package.json
4. apps/api/package.json

### 個別ダウンロード
- package.json
- pnpm-workspace.yaml
- apps/web/package.json
- apps/api/package.json

### 実行したコマンド
- pnpm install
- pnpm dev

### 確認結果
- ...

### 未実装事項
- ...

### 次のPhase
- Phase X+1: ...
```

---

# 23. 実装時の禁止事項

- Next.jsからOllamaへ直接アクセスしてはいけない
- Frontendだけで認可判断してはいけない
- ユーザー入力をファイル保存パスに使ってはいけない
- LLM出力をHTMLとして直接描画してはいけない
- HyDE仮想文書を回答根拠にしてはいけない
- 一般ユーザーのRAG検索で他ユーザーのチャンクを検索対象にしてはいけない
- `.env` をGitにコミットしてはいけない
- SQL文字列結合でクエリを作ってはいけない
- 初期MVPでURL取り込み機能を実装してはいけない
- 外部アプリケーション、OSSアプリケーション、GitHubリポジトリ、商用製品、SaaS、ブログ、記事、サンプル実装等のソースコードをコピー、改変コピー、貼り付け、または実質的に再利用してはいけない
- ライセンス表記や出典明示を行う場合でも、外部アプリケーションのソースコード利用は禁止する
- Phaseごとの実装成果物をZip、tar.gz、まとめMarkdownで出力してはいけない
- 生成・変更したファイルは、ファイル1つ1つを個別に出力しなければならない
- 変更ファイルは差分ではなく、変更後の完全なファイル内容として出力しなければならない

---

# 24. 実装順序

## Phase 1: 基盤

1. Monorepo作成
2. Next.js作成
3. NestJS作成
4. `.env` 読み込み
5. SQLite接続
6. Prisma/Drizzle設定
7. 初期管理者作成

## Phase 2: 認証・認可

1. ログイン
2. ログアウト
3. セッション
4. CSRF
5. RBAC
6. 所有者チェック

## Phase 3: ノートブック・ファイル

1. ノートブックCRUD
2. ファイルアップロード
3. LocalStorageAdapter
4. ファイル一覧
5. テキスト抽出
6. チャンク化

## Phase 4: Ollama・RAG

1. Ollama接続確認
2. モデル一覧取得
3. Embedding
4. Standard RAG
5. HyDE RAG
6. 引用付き回答
7. RAG実行ログ

## Phase 5: 管理画面

1. Dashboard
2. Users
3. Files
4. Models
5. RAG Settings
6. Ollama Connection
7. Storage
8. Security
9. Audit Logs

## Phase 6: i18n・仕上げ

1. 日本語/英語JSON
2. 言語切替
3. UI調整
4. E2Eテスト
5. セキュリティテスト
6. README整備

---

# 25. READMEに含める内容

READMEには以下を含める。

- アプリ概要
- NotebookLMとの違い
- マルチユーザー前提
- 技術スタック
- 必要環境
- `.env` 作成方法
- Ollama起動方法
- Node.js 24 LTS前提
- pnpm install
- 開発起動
- `npm run dev` / `pnpm dev` による開発起動
- `npm start` / `pnpm start` による本番相当起動
- Docker Composeは任意であること
- 初期管理者
- 対応ファイル形式
- ファイル要約機能（v1.6追加）
- RAG方式
- パスワード変更・使い方ガイド編集の手順（v1.6追記：Phase 15直後の実装追加）
- セキュリティ注意事項（v1.6追記：秘匿値の表示ボタン方式を含める）
- 既知の未解決事象（v1.6追記）
- 外部ソースコード利用禁止ポリシー
- Phase成果物の個別ファイル出力方針
- バックアップ方法

---

# 26. 将来拡張

## 24.1 Storage

- S3
- MinIO
- IBM Cloud Object Storage

## 24.2 DB

- PostgreSQL
- pgvector

## 24.3 RAG

- Rerank RAG
- Hybrid Search
- Multi-query RAG
- Graph RAG
- LLM-as-a-Judge評価

## 24.4 組織機能

- ノートブック共有
- グループ
- 部署
- 授業クラス
- 権限テンプレート

## 24.5 外部連携

- LDAP / SSO
- Google Workspace
- Microsoft Entra ID
- S3互換オブジェクトストレージ
- 外部LLM API

---

# 27. 実装依頼用プロンプト例

以下の仕様書を厳密に読み、MVPを実装してください。

条件:

1. Node.js 24 LTSを使う
2. pnpm workspacesのmonorepoにする
3. FrontendはNext.js、BackendはNestJSにする
4. DBはSQLiteから始める
5. ファイル実体は指定ディレクトリに保存する
6. StorageAdapterを実装し、将来S3に移行可能にする
7. 複数ユーザー利用を前提にする
8. 一般ユーザーは自分のノートブックとファイルだけ操作できる
9. 管理者はユーザー、ファイル、モデル、RAG設定、監査ログを管理できる
10. Standard RAGとHyDE RAGを実装する
11. HyDE仮想文書は回答根拠にしない
12. UIは日本語/英語のi18n形式にする
13. XSS、CSRF、RBAC、ファイルアップロード制限を実装する
14. Dockerなしで `npm run dev` / `pnpm dev` と `npm start` / `pnpm start` が動くようにする
15. `.env.example` とREADMEを作る
16. 受け入れ条件を満たすテストを用意する
17. 外部アプリケーション等のソースコードをコピー、改変コピー、貼り付け、実質的に再利用しない
18. Phaseごとの実装成果物はZipではなく、ファイル1つ1つを個別に出力する

実装中に仕様が曖昧な場合は、セキュリティ、マルチユーザー分離、外部ソースコード利用禁止、個別ファイル出力方針を優先して判断してください。
