-- Instagram (Varygood) ingestion: auto-published AWAITS news with images copied to Storage.

-- Sources can be web pages or Instagram accounts, and may publish without review.
alter table public.sources drop constraint if exists sources_connector_check;
alter table public.sources add constraint sources_connector_check check (connector in ('web','instagram'));
alter table public.sources add column if not exists auto_publish boolean not null default false;

insert into public.sources (name, url, connector, status, auto_publish, rights_note, frequency_hours)
values ('Varygood（Instagram）', 'https://www.instagram.com/varygood_saikai/', 'instagram', 'approved', true,
        '自社メディアの投稿。キャプション・画像を自動公開。', 12)
on conflict (url) do nothing;

-- Long-lived access tokens that the Edge Function refreshes itself.
-- No grants for anon/authenticated: only the service role can read or write.
create table if not exists public.integration_tokens (
  provider text primary key,
  access_token text not null,
  expires_at timestamptz,
  refreshed_at timestamptz not null default now()
);
alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;

-- Public bucket for images attached to entries (Instagram CDN URLs expire, so images are copied here).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entry-images', 'entry-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
