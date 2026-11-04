-- Minor mark (SPEC 4-7, 5): admins set it; members cannot change it themselves.
-- Only a yes/no flag is stored; no age or birth date.

alter table public.members
  add column is_minor boolean not null default false;

-- is_minor is deliberately NOT added to the member update grant,
-- so members cannot change it through the members_update_self policy.

create or replace function public.set_member_minor(p_member uuid, p_is_minor boolean)
returns public.members
language plpgsql security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.members set is_minor = coalesce(p_is_minor, false)
  where id = p_member
  returning * into m;
  if m.id is null then raise exception 'not found'; end if;
  return m;
end;
$$;

revoke execute on function public.set_member_minor(uuid, boolean) from public, anon;
grant execute on function public.set_member_minor(uuid, boolean) to authenticated;
