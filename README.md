# SAIKAI AWAITS

西海市民のための会員制ローカルネットワーク。

## Concept

人・仕事・イベント・コミュニティ・地域のいい話を横断して探せる、現代版タウンページ。

## Stack

- Next.js
- Supabase（Postgres / 匿名ログイン + 招待コード / RLS / Edge Functions）
- Vercel

## ローカル開発

1. `npm install`
2. `.env.example` を `.env.local` にコピーし、Supabase の Project URL と Publishable key を設定
3. Supabase のダッシュボードで Authentication > Sign In / Providers の「Allow anonymous sign-ins」を有効化
4. スキーマ適用（初回はブラウザでログイン、DBパスワードを聞かれます）
   ```
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push --include-seed
   ```
   `--include-seed` は開発用DBのみ。本番には付けないこと。開発用の招待コードは `supabase/seed.sql` を参照。
5. `npm run dev`

## Status

Alpha implementation in progress.
