-- Attribute tag list (SPEC 4-2): tags prepared by 運営 plus tags added by members.
-- A tag a member saves on their profile is added to the list automatically, so others can pick it.
-- No spelling normalization ("犬" and "いぬ" stay separate), as the spec says; only exact duplicates merge.

create table public.tags (
  label text primary key check (char_length(label) between 1 and 40),
  is_official boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;
grant select on public.tags to authenticated;
create policy tags_select on public.tags for select to authenticated using (public.is_member());

create or replace function public.register_member_tags()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.tags (label, created_by)
  select distinct trim(t), new.id
  from unnest(new.tags) as t
  where trim(t) <> '' and char_length(trim(t)) <= 40
  on conflict (label) do nothing;
  return new;
end;
$$;

create trigger members_register_tags
  after insert or update of tags on public.members
  for each row execute function public.register_member_tags();

-- Tags prepared by 運営 (approved by the client on 2026-11-05).
insert into public.tags (label, is_official)
select label, true from unnest(array[
  '釣り','犬を飼っている','猫を飼っている','元野球部','元サッカー部','吹奏楽経験','お酒好き','コーヒー好き',
  '料理好き','キャンプ','登山','サーフィン','ランニング','音楽','写真','絵を描く',
  '映画好き','読書','ゲーム','子育て中','西海生まれ','Uターン','移住してきた','農業'
]) as label
on conflict (label) do update set is_official = true;

-- Tags members already use.
insert into public.tags (label, created_by)
select distinct on (trim(t)) trim(t), m.id
from public.members m, unnest(m.tags) as t
where trim(t) <> '' and char_length(trim(t)) <= 40
on conflict (label) do nothing;
