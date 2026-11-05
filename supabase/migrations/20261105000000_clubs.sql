-- Clubs (SPEC 4-1) and club membership ("所属"), plus migration of the existing communities.
-- Old community entries and their "joined" actions are kept untouched (hidden from the UI only).

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  activity text not null default '' check (char_length(activity) <= 300),      -- 活動内容
  description text not null default '' check (char_length(description) <= 1000), -- 説明
  district text not null default '' check (district in ('', '西彼町', '西海町', '大島町', '崎戸町', '大瀬戸町', '市外・西海に関わる')), -- '' = 未設定
  venue text not null default '' check (char_length(venue) <= 120),            -- 活動場所
  frequency text not null default '' check (char_length(frequency) <= 80),     -- 頻度
  -- 連絡・参加の方法: [{"label": "...", "url": "https://...", "note": "..."}]
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 10),
  is_paid boolean not null default false,
  minors_ok boolean not null default false,
  image_url text not null default '',
  hidden boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  legacy_entry_id uuid unique references public.entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clubs_touch before update on public.clubs
  for each row execute function public.touch_updated_at();

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (club_id, member_id)
);

create index club_members_member_idx on public.club_members (member_id);

-- Read access: every member sees all (non-hidden) clubs and all memberships (SPEC 3-2, 4-1: 所属は隠せない).
-- Writes come in later steps (club creation, "参加したい").
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;

create policy clubs_select on public.clubs for select to authenticated
  using ((public.is_member() and not hidden) or public.is_admin());
create policy club_members_select on public.club_members for select to authenticated
  using (public.is_member());

-- Migrate the existing published communities with provisional values:
-- free, minors not allowed, no contacts, no admin; district kept only if it is in the list.
insert into public.clubs (name, activity, description, district, image_url, legacy_entry_id, created_at)
select
  regexp_replace(e.title, '^【デモ】', ''),
  left(e.summary, 300),
  left(e.body, 1000),
  case when e.area in ('西彼町', '西海町', '大島町', '崎戸町', '大瀬戸町', '市外・西海に関わる') then e.area else '' end,
  coalesce(e.image_url, ''),
  e.id,
  e.created_at
from public.entries e
where e.kind = 'community' and e.status = 'published'
on conflict (legacy_entry_id) do nothing;

insert into public.club_members (club_id, member_id, created_at)
select c.id, a.member_id, min(a.created_at)
from public.member_entry_actions a
join public.clubs c on c.legacy_entry_id = a.entry_id
where a.action = 'joined'
group by c.id, a.member_id
on conflict do nothing;
