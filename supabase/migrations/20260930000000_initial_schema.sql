-- SAIKAI AWAITS initial schema.
-- Members sign in with Supabase anonymous auth, then redeem an invite code to become a member.
-- All access is controlled by RLS; admins are members with role = 'admin'.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  role text not null default 'member' check (role in ('member','admin')),
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  note text not null default '',
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index invites_code_uidx on public.invites (lower(code));

create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  invite_id uuid references public.invites(id) on delete set null,
  role text not null default 'member' check (role in ('member','admin')),
  name text not null default '' check (char_length(name) <= 80),
  area text not null default '' check (char_length(area) <= 80),
  organization text not null default '' check (char_length(organization) <= 120),
  bio text not null default '' check (char_length(bio) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  skills text[] not null default '{}' check (cardinality(skills) <= 8),
  avatar_url text not null default '',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invites
  add constraint invites_created_by_fkey foreign key (created_by) references public.members(id) on delete set null;

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','news','work','community','challenge')),
  status text not null default 'pending' check (status in ('pending','published','rejected','archived')),
  origin text not null default 'member' check (origin in ('member','admin','ingest')),
  title text not null check (char_length(title) between 3 and 140),
  summary text not null default '' check (char_length(summary) <= 500),
  body text not null default '' check (char_length(body) <= 5000),
  area text not null default '' check (char_length(area) <= 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  details jsonb not null default '{}'::jsonb,
  image_url text not null default '',
  source_name text not null default '',
  source_url text not null default '',
  submitted_by uuid references public.members(id) on delete set null,
  review_note text not null default '',
  reviewed_by uuid references public.members(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entries_status_kind_idx on public.entries (status, kind, published_at desc);
create index entries_submitted_by_idx on public.entries (submitted_by);

create table public.member_entry_actions (
  member_id uuid not null references public.members(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  action text not null check (action in ('saved','interested','going','joined','work_interest','challenge_interest')),
  created_at timestamptz not null default now(),
  primary key (member_id, entry_id, action)
);
create index member_entry_actions_entry_idx on public.member_entry_actions (entry_id, action);

-- Automatic ingestion (written by the ingest-saikai-news Edge Function with the service role)
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  connector text not null default 'web' check (connector in ('web')),
  status text not null default 'approved' check (status in ('approved','paused')),
  rights_note text not null default '',
  frequency_hours integer not null default 12,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  external_key text not null,
  content_hash text not null default '',
  original_url text not null default '',
  original_title text not null default '',
  raw_excerpt text not null default '',
  classification jsonb not null default '{}'::jsonb,
  entry_id uuid references public.entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, external_key)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- Keep published_at in sync with status changes.
create or replace function public.entries_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger entries_published_at before insert or update on public.entries
  for each row execute function public.entries_set_published_at();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Redeem an invite code for the current (anonymous) auth user.
create or replace function public.redeem_invite(p_code text)
returns public.members
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invites;
  m public.members;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into m from public.members where id = uid;
  if found then return m; end if;

  select * into inv from public.invites
  where lower(code) = lower(trim(coalesce(p_code, '')))
  for update;

  if not found or inv.revoked or inv.used_count >= inv.max_uses
     or (inv.expires_at is not null and inv.expires_at <= now()) then
    raise exception 'invalid_invite';
  end if;

  update public.invites set used_count = used_count + 1 where id = inv.id;
  insert into public.members (id, invite_id, role) values (uid, inv.id, inv.role)
  returning * into m;
  return m;
end;
$$;

-- Aggregate action counts for published entries (members cannot read others' actions directly).
create or replace function public.get_entry_action_counts()
returns table (entry_id uuid, action text, count bigint)
language sql stable security definer
set search_path = ''
as $$
  select a.entry_id, a.action, count(*)
  from public.member_entry_actions a
  join public.entries e on e.id = a.entry_id and e.status = 'published'
  where public.is_member()
  group by a.entry_id, a.action;
$$;

-- Admin: approve / reject / archive an entry.
create or replace function public.review_entry(p_entry uuid, p_status text, p_note text default '')
returns public.entries
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.entries;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('pending','published','rejected','archived') then raise exception 'invalid_status'; end if;

  update public.entries
  set status = p_status, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_entry
  returning * into e;
  if not found then raise exception 'not_found'; end if;
  return e;
end;
$$;

-- Admin: issue invite codes. Codes are random unless p_code is given.
create or replace function public.create_invite(
  p_code text default null,
  p_role text default 'member',
  p_max_uses integer default 1,
  p_note text default '',
  p_expires_at timestamptz default null
)
returns public.invites
language plpgsql security definer
set search_path = ''
as $$
declare
  inv public.invites;
  c text := nullif(lower(trim(coalesce(p_code, ''))), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if c is null then
    c := 'saikai-' || substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8);
  end if;
  insert into public.invites (code, role, max_uses, note, expires_at, created_by)
  values (c, p_role, p_max_uses, coalesce(p_note, ''), p_expires_at, auth.uid())
  returning * into inv;
  return inv;
end;
$$;

revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.get_entry_action_counts() from public, anon;
revoke execute on function public.review_entry(uuid, text, text) from public, anon;
revoke execute on function public.create_invite(text, text, integer, text, timestamptz) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.get_entry_action_counts() to authenticated;
grant execute on function public.review_entry(uuid, text, text) to authenticated;
grant execute on function public.create_invite(text, text, integer, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- Anonymous auth users have the "authenticated" role; membership is checked via is_member().
-- ---------------------------------------------------------------------------

alter table public.invites enable row level security;
alter table public.members enable row level security;
alter table public.entries enable row level security;
alter table public.member_entry_actions enable row level security;
alter table public.sources enable row level security;
alter table public.source_items enable row level security;

revoke all on public.invites, public.members, public.entries, public.member_entry_actions,
  public.sources, public.source_items from anon, authenticated;

-- invites: admins only (redemption goes through redeem_invite)
grant select, update on public.invites to authenticated;
create policy invites_admin_select on public.invites for select to authenticated using (public.is_admin());
create policy invites_admin_update on public.invites for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- members: members see visible members and themselves; they edit only their own profile fields
grant select on public.members to authenticated;
grant update (name, area, organization, bio, tags, skills, avatar_url, visible) on public.members to authenticated;
create policy members_select on public.members for select to authenticated
  using (id = auth.uid() or (public.is_member() and visible) or public.is_admin());
create policy members_update_self on public.members for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- entries: members read published entries and their own submissions; submit as pending; admins manage all
grant select, insert, update on public.entries to authenticated;
create policy entries_select on public.entries for select to authenticated
  using ((public.is_member() and status = 'published') or submitted_by = auth.uid() or public.is_admin());
create policy entries_member_insert on public.entries for insert to authenticated
  with check (
    public.is_member()
    and submitted_by = auth.uid()
    and status = 'pending'
    and origin = 'member'
    and kind in ('event','community','work','challenge')
  );
create policy entries_admin_insert on public.entries for insert to authenticated
  with check (public.is_admin());
create policy entries_admin_update on public.entries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- member_entry_actions: own rows only, on published entries
grant select, insert, delete on public.member_entry_actions to authenticated;
create policy actions_select_own on public.member_entry_actions for select to authenticated
  using (member_id = auth.uid());
create policy actions_insert_own on public.member_entry_actions for insert to authenticated
  with check (
    member_id = auth.uid()
    and public.is_member()
    and exists (select 1 from public.entries e where e.id = entry_id and e.status = 'published')
  );
create policy actions_delete_own on public.member_entry_actions for delete to authenticated
  using (member_id = auth.uid());

-- sources / source_items: admins read; the Edge Function writes with the service role
grant select on public.sources, public.source_items to authenticated;
grant update (status) on public.sources to authenticated;
create policy sources_admin_select on public.sources for select to authenticated using (public.is_admin());
create policy sources_admin_update on public.sources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy source_items_admin_select on public.source_items for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Ingestion sources
-- ---------------------------------------------------------------------------

insert into public.sources (name, url, rights_note) values
  ('西海市公式サイト 新着情報', 'https://www.city.saikai.nagasaki.jp/',
   '公開ページの見出し・URL・短い要約のみを候補化。公開前に確認。'),
  ('西海市公式サイト イベント・募集', 'https://www.city.saikai.nagasaki.jp/event/index.html',
   '公開ページのイベント・募集情報を候補化。公開前に確認。')
on conflict (url) do nothing;
