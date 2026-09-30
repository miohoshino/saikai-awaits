-- Member-to-member "興味あり" marks. The recipient can see who marked them; no messaging.

create table public.member_interests (
  from_member uuid not null references public.members(id) on delete cascade,
  to_member uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_member, to_member),
  check (from_member <> to_member)
);
create index member_interests_to_idx on public.member_interests (to_member, created_at desc);

alter table public.member_interests enable row level security;
revoke all on public.member_interests from anon, authenticated;
grant select, insert, delete on public.member_interests to authenticated;

create policy interests_select_involved on public.member_interests for select to authenticated
  using (from_member = auth.uid() or to_member = auth.uid());
create policy interests_insert_own on public.member_interests for insert to authenticated
  with check (
    from_member = auth.uid()
    and public.is_member()
    and exists (select 1 from public.members m where m.id = to_member and m.visible and m.name <> '')
  );
create policy interests_delete_own on public.member_interests for delete to authenticated
  using (from_member = auth.uid());

-- Members who marked the current user, with their public profile.
-- Security definer so the name is shown even if that member later hides their profile.
create or replace function public.get_received_interests()
returns table (id uuid, name text, area text, organization text, bio text, tags text[], skills text[], avatar_url text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.name, m.area, m.organization, m.bio, m.tags, m.skills, m.avatar_url, i.created_at
  from public.member_interests i
  join public.members m on m.id = i.from_member
  where i.to_member = auth.uid()
  order by i.created_at desc;
$$;

revoke execute on function public.get_received_interests() from public, anon;
grant execute on function public.get_received_interests() to authenticated;
