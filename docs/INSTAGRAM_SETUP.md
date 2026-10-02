# Instagram（Varygood）自動取り込みの設定手順

Varygood（@varygood_saikai）の投稿を、AWAITSニュースに自動で掲載するための設定です。
Edge Function `ingest-instagram` が定期的に投稿を取得し、画像を Supabase Storage にコピーして、ニュースとして自動公開します。

- 使う API: Instagram API with Instagram Login（Facebook ページとの連携は不要）
- 必要な権限: `instagram_business_basic`
- アクセストークンは 60 日有効。Function が 7 日ごとに自動更新し、最新のトークンを `integration_tokens` テーブルに保存します

## 1. Instagram アカウントの確認

Instagram アプリで Varygood にログインし、「設定」→「アカウントの種類とツール」で **プロアカウント（ビジネス or クリエイター）** になっていることを確認します。

## 2. Meta のアプリを作成してトークンを発行

1. https://developers.facebook.com/ にログインし、「マイアプリ」→「アプリを作成」
2. ユースケースで **「Instagramでメッセージとコンテンツを管理」** を選ぶ（名称は変わることがあります。Instagram API を使うものを選択）
3. アプリ名（例: `SAIKAI AWAITS`）を入れて作成
4. 左メニューの「Instagram」→ **「Instagramログインによる API 設定」** を開く
5. 「アクセストークンを生成する」で **「アカウントを追加」** → Varygood のアカウントでログインして許可
6. 表示された **アクセストークン** をコピー（このトークンは秘密情報です。チャットには貼らないでください）

アプリは「開発モード」のままで構いません（自分のアカウントの投稿を読むだけのため）。

## 3. Supabase に秘密情報を登録

このリポジトリのフォルダで実行します（`<...>` は置き換え）。

```bash
npx supabase secrets set INSTAGRAM_ACCESS_TOKEN=<手順2のトークン>
npx supabase secrets set INGEST_SECRET=<ランダムな長い文字列>
```

`INGEST_SECRET` は定期実行の呼び出しを認証するための合言葉です。パスワード生成ツールなどで 40 文字程度のランダムな文字列を作ってください。手順5でも使うので控えておきます。

## 4. Function をデプロイ

```bash
npx supabase functions deploy ingest-instagram
```

## 5. 動作確認（手動で1回実行）

PowerShell の場合:

```powershell
curl.exe -X POST https://czuaxdkndonhyqxqjlzs.supabase.co/functions/v1/ingest-instagram -H "x-ingest-key: <INGEST_SECRET>"
```

`{"ok":true,"fetched":25,"inserted":25,...}` のように返れば成功です。アプリの「みつける」→「AWAITSニュース」に投稿が並びます。

## 6. 定期実行（6時間ごと）

Supabase ダッシュボードの **Database → Extensions** で `pg_cron` と `pg_net` を有効化してから、**SQL Editor** で実行します。

```sql
-- 合言葉を Vault に保存（手順3の INGEST_SECRET と同じ値）
select vault.create_secret('<INGEST_SECRET>', 'ingest_secret');

select cron.schedule(
  'instagram-ingest-6h',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := 'https://czuaxdkndonhyqxqjlzs.supabase.co/functions/v1/ingest-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

## 運用メモ

- 取り込んだ投稿は運営メニューの「公開中」に「自動収集」として表示され、編集・終了ができます
- 自動公開をやめて確認制にしたい場合は `sources` テーブルの Varygood 行の `auto_publish` を `false` に変更
- 本番環境を作るときは、本番の Supabase プロジェクトで手順3〜6をやり直します（URL のプロジェクト ID も本番のものに置き換え）
