# SAIKAI AWAITS implementation status

## Live stack
- Next.js / Vercel
- Supabase Postgres
- Supabase Edge Functions
- Invite-code-only member entry

## DB-backed user features
- Invite code creates a persistent app member
- First-login profile onboarding
- Member directory
- Event interest / attendance
- Community join
- Work interest
- Challenge interest
- Saved entries
- My Page activity history
- Member event submission to draft / review

## Automatic Saikai information ingestion
- Edge Function: `ingest-saikai-news`
- Sources currently configured:
  - Saikai City official website
  - Saikai City event / recruitment page
- Runs every 12 hours with Supabase Cron
- Extracted items go to `source_items`
- Candidate items go to `reviews`
- Human approval is still required before publication
- OpenAI classification is supported when `OPENAI_API_KEY` is configured; otherwise rules are used as fallback

## Important
The production database has already received the migrations. The SQL under `supabase/migrations/` is kept in GitHub so the implementation is reproducible and auditable.
