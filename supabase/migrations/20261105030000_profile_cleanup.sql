-- Profile cleanup (SPEC 4-2), approved by the client on 2026-11-05:
-- * "できること" (skills) is merged into the attribute tags; duplicates (case/width-insensitive) are dropped.
-- * The free-text "所属" (organization) is deleted. Club membership (club_members) is unaffected.
-- * Members can no longer write either column.

alter table public.members drop constraint members_tags_check;
alter table public.members add constraint members_tags_check check (cardinality(tags) <= 20);

update public.members m
set tags = coalesce((
  select array_agg(t order by first_pos)
  from (
    select min(x.t) filter (where x.pos = x.first_pos) as t, x.first_pos
    from (
      select trim(u.t) as t, u.pos,
             min(u.pos) over (partition by lower(normalize(trim(u.t), NFKC))) as first_pos
      from unnest(m.tags || m.skills) with ordinality as u(t, pos)
      where trim(u.t) <> ''
    ) x
    group by x.first_pos
  ) d
), '{}')
where cardinality(m.skills) > 0;

update public.members set skills = '{}' where cardinality(skills) > 0;
update public.members set organization = '' where organization <> '';

revoke update (organization, skills) on public.members from authenticated;
