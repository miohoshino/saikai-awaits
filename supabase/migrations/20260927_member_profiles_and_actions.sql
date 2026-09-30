-- Source-controlled snapshot of the member/profile/action features applied on 2026-09-27.
-- This migration is intended for fresh environments. Production has already received these changes.

create table if not exists public.app_members (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid unique references public.invites(id) on delete set null,
  name text not null default '',
  area text not null default '',
  organization text not null default '',
  bio text not null default '',
  tags text[] not null default '{}',
  skills text[] not null default '{}',
  avatar_url text not null default '',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invite_sessions
  add column if not exists member_id uuid references public.app_members(id) on delete cascade;

create table if not exists public.member_entry_actions (
  member_id uuid not null references public.app_members(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  action text not null check (action in ('saved','interested','going','joined','work_interest','challenge_interest')),
  created_at timestamptz not null default now(),
  primary key (member_id, entry_id, action)
);

alter table public.entries
  add column if not exists submitted_by_member_id uuid references public.app_members(id) on delete set null;

alter table public.app_members enable row level security;
alter table public.member_entry_actions enable row level security;

revoke all on public.app_members from anon, authenticated;
revoke all on public.member_entry_actions from anon, authenticated;

create or replace function public.session_member_id(p_session text)
returns uuid
language sql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
  select s.member_id
  from public.invite_sessions s
  where s.session_hash=encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex')
    and s.expires_at>now()
  limit 1;
$$;

create or replace function public.get_member_profile(p_session text)
returns jsonb
language sql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
  select to_jsonb(m)
  from public.app_members m
  where m.id=public.session_member_id(p_session);
$$;

create or replace function public.update_member_profile(
  p_session text,
  p_name text,
  p_area text,
  p_organization text default '',
  p_bio text default '',
  p_tags text[] default '{}',
  p_skills text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  mid uuid;
  result jsonb;
begin
  mid:=public.session_member_id(p_session);
  if mid is null then raise exception 'invalid_session'; end if;

  update public.app_members
  set name=left(trim(coalesce(p_name,'')),80),
      area=left(trim(coalesce(p_area,'')),80),
      organization=left(trim(coalesce(p_organization,'')),120),
      bio=left(trim(coalesce(p_bio,'')),500),
      tags=(coalesce(p_tags,'{}'::text[]))[1:8],
      skills=(coalesce(p_skills,'{}'::text[]))[1:8],
      updated_at=now()
  where id=mid
  returning to_jsonb(app_members.*) into result;

  return result;
end;
$$;

create or replace function public.get_member_directory(p_session text)
returns table(
  id uuid,
  name text,
  area text,
  organization text,
  bio text,
  tags text[],
  skills text[],
  avatar_url text
)
language sql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
  select m.id,m.name,m.area,m.organization,m.bio,m.tags,m.skills,m.avatar_url
  from public.app_members m
  where public.session_member_id(p_session) is not null
    and m.visible=true
    and length(trim(m.name))>0
  order by m.updated_at desc;
$$;

create or replace function public.toggle_member_action(
  p_session text,
  p_entry uuid,
  p_action text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  mid uuid;
begin
  mid:=public.session_member_id(p_session);
  if mid is null then raise exception 'invalid_session'; end if;

  if p_action not in ('saved','interested','going','joined','work_interest','challenge_interest') then
    raise exception 'invalid_action';
  end if;

  if not exists(select 1 from public.entries where id=p_entry and status='published') then
    raise exception 'invalid_entry';
  end if;

  if p_enabled then
    insert into public.member_entry_actions(member_id,entry_id,action)
    values(mid,p_entry,p_action)
    on conflict do nothing;
  else
    delete from public.member_entry_actions
    where member_id=mid and entry_id=p_entry and action=p_action;
  end if;

  return jsonb_build_object('ok',true,'enabled',p_enabled,'action',p_action,'entry_id',p_entry);
end;
$$;

create or replace function public.get_member_actions(p_session text)
returns table(entry_id uuid, action text, created_at timestamptz)
language sql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
  select a.entry_id,a.action,a.created_at
  from public.member_entry_actions a
  where a.member_id=public.session_member_id(p_session)
  order by a.created_at desc;
$$;

create or replace function public.submit_member_entry(
  p_session text,
  p_kind text,
  p_title text,
  p_summary text,
  p_area text default '',
  p_details jsonb default '{}'::jsonb,
  p_tags text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  mid uuid;
  eid uuid;
begin
  mid:=public.session_member_id(p_session);
  if mid is null then raise exception 'invalid_session'; end if;
  if p_kind not in ('event','community','work','challenge') then raise exception 'invalid_kind'; end if;
  if length(trim(coalesce(p_title,''))) < 3 then raise exception 'title_required'; end if;

  insert into public.entries(kind,title,summary,area,tags,details,status,submitted_by_member_id,source_name,updated_at)
  values(
    p_kind,left(trim(p_title),140),left(trim(coalesce(p_summary,'')),500),
    left(trim(coalesce(p_area,'')),80),(coalesce(p_tags,'{}'::text[]))[1:8],
    coalesce(p_details,'{}'::jsonb),'draft',mid,'会員投稿',now()
  )
  returning id into eid;

  return jsonb_build_object('ok',true,'entry_id',eid,'status','draft');
end;
$$;

create or replace function public.get_my_submissions(p_session text)
returns setof public.entries
language sql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
  select e.*
  from public.entries e
  where e.submitted_by_member_id=public.session_member_id(p_session)
  order by e.updated_at desc;
$$;
