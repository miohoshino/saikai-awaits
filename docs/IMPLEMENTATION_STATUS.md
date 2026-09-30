# SAIKAI AWAITS implementation status

## Stack
- Next.js / Vercel（未公開）
- Supabase Postgres（開発用プロジェクト）
- Supabase 匿名ログイン + 招待コード（`redeem_invite`）
- アクセス制御は RLS。管理者は `members.role = 'admin'`

## Schema (`supabase/migrations/20260930000000_initial_schema.sql`)
- `invites` 招待コード（role / 使用回数上限 / 期限 / 無効化）
- `members` 会員プロフィール（`auth.users` と 1:1）
- `entries` イベント・ニュース・仕事・コミュニティ・チャレンジ。`status`: pending → published / rejected / archived
- `member_entry_actions` 参加・興味・保存など
- `sources` / `source_items` 自動収集の取得元と取得済みURL

## User features
- 招待コードで入会 → 初回プロフィール登録
- メンバー一覧、イベント参加・興味、コミュニティ参加、仕事・チャレンジへの興味、保存
- マイページ（活動履歴、自分の投稿）
- 会員のイベント投稿（pending → 運営承認で公開）

## Automatic Saikai information ingestion
- Edge Function: `ingest-saikai-news`
- 取得元: 西海市公式サイト（新着 / イベント・募集）
- 候補は `entries` に `status = 'pending'`, `origin = 'ingest'` で登録。公開には管理者の承認が必要
- `OPENAI_API_KEY` があればAI分類、なければキーワードルール
- 呼び出しには `x-ingest-key` ヘッダー（Function の secret `INGEST_SECRET`）が必要
- 定期実行（Cron）は未設定

## TODO
- 管理画面（投稿・自動収集候補の承認、招待コード発行）
- 画面上の固定値・ダミーデータの整理
- Vercel への公開
