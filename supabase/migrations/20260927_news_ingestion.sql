-- Source-controlled snapshot of the automatic Saikai news ingestion foundation.
-- Production has already received equivalent changes.

create schema if not exists private;

create table if not exists private.ingest_config (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now()
);
insert into private.ingest_config(id) values(true) on conflict (id) do nothing;

create unique index if not exists source_items_source_external_key_uidx
  on public.source_items(source_id, external_key);

create unique index if not exists reviews_source_item_unique_idx
  on public.reviews(source_item_id)
  where source_item_id is not null;

insert into public.sources(name,url,connector,status,rights_note,frequency_hours)
select * from (values
  ('西海市公式サイト 新着情報','https://www.city.saikai.nagasaki.jp/','web','approved','公開ページの見出し・URL・短い要約のみを候補化。公開前に確認。',12),
  ('西海市公式サイト イベント・募集','https://www.city.saikai.nagasaki.jp/event/index.html','web','approved','公開ページのイベント・募集情報を候補化。公開前に確認。',12)
) as v(name,url,connector,status,rights_note,frequency_hours)
where not exists (select 1 from public.sources s where s.url=v.url);

create or replace function public.check_ingest_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=public,private,extensions,pg_temp
as $$
  select exists(
    select 1 from private.ingest_config
    where encode(extensions.digest(coalesce(p_secret,''),'sha256'),'hex')
        = encode(extensions.digest(secret,'sha256'),'hex')
  );
$$;

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'saikai-news-ingest-12h',
  '0 */12 * * *',
  $cron$
  select net.http_post(
    url:='https://lrhwyblhykikogevwggc.supabase.co/functions/v1/ingest-saikai-news',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-ingest-key',(select secret from private.ingest_config where id=true)
    ),
    body:=jsonb_build_object('scheduled_at',now()),
    timeout_milliseconds:=15000
  );
  $cron$
);
