# 設計書: sujigaki（業務設計 SSOT ツール）

| 項目 | 内容 |
|---|---|
| ステータス | Draft |
| 作成日 | 2026-11-19 |
| 要件定義書 | [docs/requirements/business-design-ssot.md](../requirements/business-design-ssot.md) |

## 1. 設計概要

TypeScript のモノレポで、画面・API・ドメインの規則を1つの言語で書く。ドメインの規則（要素の種類、つながりの規則、確認状態の遷移、検証、差分）は I/O を持たないパッケージにまとめ、ブラウザとサーバーの両方で使う。サーバーモードは AWS の Lambda と RDS for PostgreSQL で動かし、ローカルモードは同じサーバーを手元で起動して YAML ファイルを読み書きする。保存先の違いはリポジトリの実装の差し替えで吸収し、ドメインとアプリケーション層は保存先を知らない。

### 1.1 システム構成

```mermaid
graph LR
    subgraph ブラウザ
        W[画面（React）]
    end
    subgraph AWS
        CF[CloudFront]
        S3[S3（画面の配信）]
        GW[API Gateway（HTTP API）]
        L[Lambda（API）]
        DB[(RDS for PostgreSQL)]
        NAT[NAT インスタンス]
        SSM[SSM Parameter Store]
    end
    IdP[ID プロバイダー（標準は Cognito）]
    W --> CF
    CF -->|/| S3
    CF -->|/api, /auth| GW --> L
    L --> DB
    L --> SSM
    L --> NAT --> IdP
```

- 画面と API は CloudFront で同じオリジンにまとめる。ログインのセッションは暗号化した HttpOnly の Cookie に、利用者の ID と有効期限だけを入れて持つ。ロールはリクエストのたびにデータベースで確かめる。
- ID プロバイダーのクライアントシークレットと、Cookie の暗号化の鍵は、SSM Parameter Store に置く（NFR-007）。
- Lambda は VPC のプライベートサブネットに置く。ID プロバイダーとの通信は NAT インスタンスを経由する（ADR-002）。
- ローカルモードは、`sujigaki` コマンドが手元で API と画面を配信する。データベースと ID プロバイダーは使わない（ADR-003）。
- 開発環境は `docker compose` で、API・画面・PostgreSQL・Keycloak（OIDC プロバイダー）を起動する。AWS アカウントは要らない（NFR-013）。

### 1.2 モジュール構成

| パッケージ | 役割 | 依存してよい先 |
|---|---|---|
| `packages/domain` | モデル・合意・権限の型と規則。I/O を持たない | なし |
| `packages/interchange` | YAML・RDRA 関連データ・AI 向けテキストの変換と、取り込みの差分 | `domain` |
| `apps/server` | API（Hono）。アプリケーション層、保存先の実装（PostgreSQL・ファイル）、OIDC | `domain`, `interchange` |
| `apps/web` | 画面（React、React Flow） | `domain`, `interchange` |
| `apps/cli` | ローカルモードの起動 | `apps/server` |
| `infra` | AWS の環境（AWS CDK） | なし |

依存は表の上から下への一方向とし、`domain` はどこにも依存しない。パッケージをまたぐ循環は、lint の規則で検出する。

### 1.3 主な技術

| 用途 | 技術 |
|---|---|
| 言語 | TypeScript |
| 画面 | React、React Flow（図の描画）、elkjs（自動レイアウト） |
| API | Hono（Lambda と Node.js の両方で動かす） |
| データベース | PostgreSQL、Kysely（SQL の組み立てとマイグレーション） |
| スキーマ | Zod。YAML の形式を公開する JSON Schema も Zod から生成する（FR-050） |
| 認証 | OIDC の認可コードフロー（PKCE 付き）。サーバー側でトークンを交換する |
| IaC | AWS CDK |
| テスト | Vitest、Playwright |

## 2. コンテキストマップ

```mermaid
graph LR
    subgraph 中心
        M[モデル]
    end
    A[合意] -->|要素ID参照| M
    X[受け渡し] -->|変更操作の呼び出し| M
    M -.->|操作（ドメインイベント）| H[変更記録]
    A -.->|操作（ドメインイベント）| H
    P[利用者と権限] -.->|操作（ドメインイベント）| H
    APP[アプリケーション層] -->|ロールの判定| P
    APP --> M
    APP --> A
```

利用者と権限は、アプリケーション層が操作の前に呼ぶ。モデルと合意は、「誰が、どのロールで操作したか」を値として受け取るだけで、利用者と権限のコンテキストを知らない。

### コンテキスト間の連携一覧

| 発信元 | 宛先 | 経路 | 内容 |
|---|---|---|---|
| 合意 | モデル | 型付き ID | 問い・決定記録・コメントが、対象の要素を `ElementId` で参照する |
| 受け渡し | モデル | 型付き ID と変更操作 | 読み込みや AI の提案から作った変更の一式を、モデルの変更操作として渡す |
| モデル | 変更記録 | ドメインイベント | 要素とつながりの変更、確認状態の変更 |
| 合意 | 変更記録 | ドメインイベント | 問いの状態の変更、決定の記録 |
| 利用者と権限 | 変更記録 | ドメインイベント | 招待、ロールの変更、メンバーの除外 |
| アプリケーション層 | 利用者と権限 | 呼び出し | 操作ごとに、権限の表（FR-081）でロールを判定する |

ドメインイベントは発生した操作と同じトランザクションで操作の記録（`operations` テーブル）に書く。別のプロセスに非同期で渡す処理は、今の要件にはない。

## 3. ドメインモデル

### 要素の種類

要素の種類は次の18種類とする。コードでは RDRA の用語をもとにした識別子を使い、画面では要件定義書 4.1 節の表示名を使う。

| 識別子 | 表示名 | 識別子 | 表示名 |
|---|---|---|---|
| `requirement` | 要求 | `event` | イベント |
| `actor` | 登場人物 | `timer` | 定期処理 |
| `actorGroup` | 登場人物のグループ | `context` | 分類 |
| `externalSystem` | 外部システム | `information` | 情報 |
| `externalSystemGroup` | 外部システムのグループ | `stateModel` | 状態の流れ |
| `business` | 業務 | `state` | 状態 |
| `buc` | 業務フロー | `condition` | 業務ルール |
| `activity` | 活動 | `variation` | 区分 |
| `usecase` | システム操作 | | |
| `screen` | 画面 | | |

項目（属性）は情報の、区分の値はバリエーションの、値オブジェクトとして持つ。関連データでも、この2つは `#attribute` の行として要素の下に置かれるためである。項目や区分の値を変えると、持ち主の情報や区分の内容の編集になる（FR-013）。

### つながりの種類

つながりの種類は、元の要素の種類・先の要素の種類・関連データのタグの組で定義する。定義は [RDRA の関連データ形式の調査](../research/rdra-related-data-format.md) の関係の一覧から、`#attribute`・`#comment`・`#stereotype` の行を除いたものに、次の2つを加える。

- 要求 → 業務（このツール独自の関係）
- 要求 → 登場人物（定義・分析シートの「機能要求」シートの列に合わせる）

定義は `packages/domain` の表として持ち、関連データの読み込み・書き出しと、つながりを作るときの検査の両方で使う。

### 集約一覧

| 集約 | 集約ルート | 含まれるエンティティ/VO | 不変条件 |
|---|---|---|---|
| 要素 | `Element` | 種類ごとの属性（VO）、確認状態（VO）、作成の情報（VO）、外部リンク（エンティティ）、元として持つつながり（エンティティ） | 属性が種類ごとの定義に合う。つながりの種類が元と先の種類の組として定義されている。同じ種類で同じ先へのつながりは1つだけ。内容を編集すると確認状態が未レビューに戻る（FR-013）。確認状態の遷移は要件定義書 7.1 節に従う。削除済みの要素は編集できない |
| 図の配置 | `Layout` | 要素ごとの位置（VO） | 1つの業務フローに1つだけ |
| プロジェクト | `Project` | 設定（VO。システム名、要約の上限） | 要約の上限は1以上 |
| 問い | `Question` | 推奨案（VO）、回答（VO） | 状態の遷移は要件定義書 7.2 節に従う |
| 決定記録 | `Decision` | 関係する要素の ID（VO） | 結論と理由が空でない |
| コメント | `Comment` | なし | 本文が空でない |
| メンバー構成 | `ProjectMembers` | メンバー（エンティティ）、招待（エンティティ）、ロール（VO） | 管理者が1人以上いる。1人の利用者が持つロールは1つ |
| 利用者 | `User` | なし | ID プロバイダーと利用者の識別子の組が一意 |
| 操作 | `Operation` | 変更前と変更後の内容（VO） | 追記だけで、変更も削除もしない |

要素の集約について、次の3つを補足する。

- **つながりは元の要素が持つ**: つながりを追加・削除すると、元の要素のバージョンが上がり、確認状態が未レビューに戻る。FR-013 と FR-070 の要件を、1つの集約の中で守れる（ADR-004）。
- **先の要素を削除してもつながりは残す**: 先の要素が削除済みになったつながりは、表示と検証では切れたものとして扱う。削除と同じトランザクションで、そのつながりの元の要素を未レビューに戻す。復元すると、つながりは元どおりに見える（FR-012）。
- **図の配置は要素に含めない**: 位置を動かしても要素のバージョンは上がらず、確認状態も変わらない。内容の編集と、配置の変更が衝突しない。

`activity` の属性（担当者・開始のきっかけ・入力・手順の概要・例外・終了状態・区分）と、`requirement` の属性（根拠・発生源・優先度・要望の原文）は、種類ごとの属性として持つ（ADR-005）。担当者は登場人物へのつながりで表し、文字列では持たない。

### 未解決の問いの自動作成

FR-035 の問いは検証（FR-040）と同じく、モデルから毎回計算して確認ボードに出す。保存はしない。利用者が回答したときに、問いの集約として保存する。空欄が埋まれば、計算した問いは消える。

### ドメインイベント

| イベント名（過去形） | 発生タイミング | 購読者 |
|---|---|---|
| `ElementCreated` | 要素を作成した | 変更記録 |
| `ElementEdited` | 名前・要約・属性・外部リンクを変えた | 変更記録 |
| `RelationAdded` / `RelationRemoved` | つながりを追加・削除した | 変更記録 |
| `ReviewStateChanged` | 確認状態が変わった（自動で未レビューに戻った場合を含む） | 変更記録 |
| `ElementDeleted` | 要素を論理削除した | モデル（切れたつながりの元の要素を未レビューに戻す）、変更記録 |
| `ElementRestored` / `ElementPurged` | 要素を復元した／完全に削除した | 変更記録 |
| `LayoutChanged` | 図の配置を保存した | 変更記録 |
| `QuestionAsked` / `QuestionAnswered` / `QuestionResolved` / `QuestionWithdrawn` | 問いを作成した、回答した、解決した、取り下げた | 変更記録 |
| `DecisionRecorded` | 決定を記録した | 変更記録 |
| `MemberInvited` / `MemberRoleChanged` / `MemberRemoved` | 招待した、ロールを変えた、除外した | 変更記録 |

## 4. DB設計

サーバーモードのデータベースは PostgreSQL とする（ADR-001）。ローカルモードはデータベースを使わず、5.4 節の YAML ファイルに保存する。

```mermaid
erDiagram
    PROJECTS ||--o{ ELEMENTS : contains
    ELEMENTS ||--o{ RELATIONS : "元として持つ"
    ELEMENTS ||--o{ RELATIONS : "先になる"
    ELEMENTS ||--o{ EXTERNAL_LINKS : has
    PROJECTS ||--o{ LAYOUTS : contains
    PROJECTS ||--o{ QUESTIONS : contains
    PROJECTS ||--o{ DECISIONS : contains
    DECISIONS ||--o{ DECISION_ELEMENTS : "関係する要素"
    PROJECTS ||--o{ COMMENTS : contains
    PROJECTS ||--o{ MEMBERSHIPS : has
    USERS ||--o{ MEMBERSHIPS : has
    PROJECTS ||--o{ INVITATIONS : has
    PROJECTS ||--o{ OPERATIONS : records
```

### テーブル定義

ID は、プロジェクトと利用者は UUID、それ以外は ULID（26文字の文字列）とする。要素とつながりの ID は、ローカルモードやブラウザでの取り込みでも作るため、サーバーに頼らずに作れる ULID にした。日時はすべて `timestamptz` とする。

`projects`

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK |
| name | text | NOT NULL |
| system_name | text | NOT NULL。関連データの1行目に書き出す |
| summary_max_length | integer | NOT NULL, DEFAULT 100, CHECK (summary_max_length > 0)（FR-005） |
| created_at | timestamptz | NOT NULL |

`elements`

| カラム | 型 | 制約 |
|---|---|---|
| id | text | PK。ULID |
| project_id | uuid | NOT NULL, FK projects |
| kind | text | NOT NULL, CHECK（3章の18種類） |
| name | text | NOT NULL, CHECK (length(name) BETWEEN 1 AND 200) |
| summary | text | NOT NULL, DEFAULT ''。上限を超えても保存できる（FR-005） |
| attributes | jsonb | NOT NULL, DEFAULT '{}'。種類ごとの属性（ADR-005） |
| review_state | text | NOT NULL, CHECK (review_state IN ('unreviewed', 'needs_check', 'needs_fix', 'approved')) |
| author_type | text | NOT NULL, CHECK (author_type IN ('human', 'ai', 'import')) |
| source | text | NULL。出所（「AI 提案」「RDRA 読み込み」と、取り込みの日時） |
| version | integer | NOT NULL, DEFAULT 1。楽観ロックのバージョン（FR-070） |
| deleted_at | timestamptz | NULL。論理削除（FR-012） |
| deleted_by | uuid | NULL, FK users |
| created_at / updated_at | timestamptz | NOT NULL |
| created_by / updated_by | uuid | NULL, FK users |

要素の名前は一意にしない。業務フローが違えば、同じ名前の活動がありうるためである。関連データに書き出すときに名前が重なる場合は、書き出しの前に警告する。

`relations`

| カラム | 型 | 制約 |
|---|---|---|
| id | text | PK。ULID |
| project_id | uuid | NOT NULL, FK projects |
| type | text | NOT NULL。つながりの種類（例: `activity-usecase`） |
| from_element_id | text | NOT NULL, FK elements ON DELETE CASCADE |
| to_element_id | text | NOT NULL, FK elements ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL |
| created_by | uuid | NULL, FK users |
| | | UNIQUE (from_element_id, to_element_id, type) |

元と先の要素の種類の組がつながりの種類に合うかは、要素の集約で検査する。データベースでは検査しない。

`external_links`

| カラム | 型 | 制約 |
|---|---|---|
| id | text | PK |
| element_id | text | NOT NULL, FK elements ON DELETE CASCADE |
| kind | text | NOT NULL, CHECK (kind IN ('manual', 'spec', 'design', 'ticket', 'other')) |
| url | text | NOT NULL, CHECK (url ~ '^https?://') |
| label | text | NULL |
| position | integer | NOT NULL。表示の順 |

`layouts`

| カラム | 型 | 制約 |
|---|---|---|
| project_id | uuid | NOT NULL, FK projects |
| buc_id | text | NOT NULL, FK elements ON DELETE CASCADE |
| positions | jsonb | NOT NULL。要素 ID ごとの座標 |
| version | integer | NOT NULL |
| updated_at | timestamptz | NOT NULL |
| | | PK (project_id, buc_id) |

`questions`

| カラム | 型 | 制約 |
|---|---|---|
| id | text | PK |
| project_id | uuid | NOT NULL, FK projects |
| element_id | text | NOT NULL。モデルのコンテキストへの ID 参照のため、FK は張らない |
| body | text | NOT NULL |
| recommendation | text | NULL。推奨案 |
| state | text | NOT NULL, CHECK (state IN ('open', 'answered', 'resolved', 'withdrawn')) |
| answer | text | NULL |
| answered_by / answered_at | uuid / timestamptz | NULL |
| author_type | text | NOT NULL, CHECK (author_type IN ('human', 'ai', 'auto')) |
| created_at / created_by | timestamptz / uuid | NOT NULL / NULL |
| | | CHECK (state IN ('open', 'withdrawn') OR answer IS NOT NULL) |

`decisions` と `decision_elements`

| テーブル | カラム | 型 | 制約 |
|---|---|---|---|
| decisions | id | text | PK |
| | project_id | uuid | NOT NULL, FK projects |
| | question_id | text | NULL, FK questions |
| | topic | text | NOT NULL。何についての決定か |
| | conclusion / reason | text | NOT NULL |
| | decided_by | uuid | NOT NULL, FK users |
| | decided_at | timestamptz | NOT NULL |
| decision_elements | decision_id | text | NOT NULL, FK decisions ON DELETE CASCADE |
| | element_id | text | NOT NULL。ID 参照のため FK は張らない |
| | | | PK (decision_id, element_id) |

`comments`

| カラム | 型 | 制約 |
|---|---|---|
| id | text | PK |
| project_id | uuid | NOT NULL, FK projects |
| element_id | text | NOT NULL。ID 参照のため FK は張らない |
| body | text | NOT NULL, CHECK (length(body) > 0) |
| author_id | uuid | NOT NULL, FK users |
| created_at | timestamptz | NOT NULL |

`users`、`memberships`、`invitations`

| テーブル | カラム | 型 | 制約 |
|---|---|---|---|
| users | id | uuid | PK |
| | issuer / subject | text | NOT NULL, UNIQUE (issuer, subject) |
| | email | text | NOT NULL |
| | display_name | text | NOT NULL |
| memberships | project_id | uuid | NOT NULL, FK projects |
| | user_id | uuid | NOT NULL, FK users |
| | role | text | NOT NULL, CHECK (role IN ('viewer', 'editor', 'owner', 'admin')) |
| | | | PK (project_id, user_id) |
| invitations | id | uuid | PK |
| | project_id | uuid | NOT NULL, FK projects |
| | email | text | NOT NULL |
| | role | text | NOT NULL, CHECK（memberships と同じ） |
| | invited_by | uuid | NOT NULL, FK users |
| | created_at / accepted_at | timestamptz | NOT NULL / NULL |
| | | | 未受諾の招待は、プロジェクトとメールアドレス（小文字にしたもの）の組で一意 |

ロールの `owner` は業務責任者を表す。

`operations`

| カラム | 型 | 制約 |
|---|---|---|
| id | bigint | PK, GENERATED ALWAYS AS IDENTITY。プロジェクトのリビジョンとしても使う |
| project_id | uuid | NOT NULL, FK projects |
| batch_id | text | NOT NULL。1回の保存や取り込みでまとめて行った操作に同じ値を付ける |
| actor_id | uuid | NULL, FK users |
| occurred_at | timestamptz | NOT NULL |
| type | text | NOT NULL。ドメインイベントの名前 |
| target_type / target_id | text | NOT NULL |
| before / after | jsonb | NULL。変更前と変更後の内容 |

アプリケーションがデータベースに接続するユーザーには、`operations` への INSERT と SELECT だけを許可し、UPDATE と DELETE は許可しない（NFR-008）。変更履歴（FR-072）と監査（NFR-008）は、どちらもこのテーブルから取り出す。要素を完全に削除しても、操作の記録は残す。

### 保持期間

- 操作の記録（変更履歴と監査）は、期限を設けずに残す。編集の頻度が低く、10人が毎日編集しても年に数万行にとどまる見込みのためである。保持期間を短くする設定は、必要になってから追加する。
- データベースの自動バックアップは7日分残す（NFR-010）。
- アプリケーションのログは CloudWatch Logs に90日残す（NFR-012）。

### インデックス

| テーブル | インデックス | 根拠となる想定クエリ |
|---|---|---|
| elements | (project_id) | プロジェクトを開くときに、全要素を取り出す（NFR-001）。削除済みの一覧（FR-012）も同じインデックスで絞る |
| relations | (project_id) | プロジェクトを開くときに、全つながりを取り出す |
| relations | (to_element_id) | 要素を削除するときに、その要素を先とするつながりの元の要素を探す（FR-012、FR-013） |
| relations | UNIQUE (from_element_id, to_element_id, type) | 重複したつながりを防ぐ。元の要素のつながりの取り出しにも使う |
| external_links | (element_id) | 要素と一緒に外部リンクを取り出す |
| operations | (project_id, id) | 指定したリビジョンより後の変更を取り出す（FR-071）。プロジェクトの変更履歴を新しい順に見る |
| operations | (target_id, id) | 要素ごとの変更履歴を見る（FR-072） |
| questions | (project_id) | プロジェクトを開くときに、問いを取り出す |
| decision_elements | (element_id) | 要素に結び付いた決定記録を見る |
| comments | (element_id, created_at) | 要素のコメントを古い順に見る |
| memberships | (user_id) | ログインした利用者が参加しているプロジェクトの一覧を出す（FR-060） |
