-- Joining and leaving clubs ("所属", SPEC 4-1). Anyone can leave, including the last admin
-- (a club without an admin is then managed by 運営). Minors may only join clubs that allow minors (SPEC 5-5).

create or replace function public.join_club(p_club uuid)
returns public.club_members
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members;
  c public.clubs;
  row public.club_members;
begin
  select * into me from public.members where id = auth.uid();
  if me.id is null then raise exception 'forbidden'; end if;
  select * into c from public.clubs where id = p_club and not hidden;
  if c.id is null then raise exception 'not_found'; end if;
  if me.is_minor and not c.minors_ok then raise exception 'adults_only'; end if;
  insert into public.club_members (club_id, member_id) values (c.id, me.id)
  on conflict (club_id, member_id) do nothing;
  select * into row from public.club_members where club_id = c.id and member_id = me.id;
  return row;
end;
$$;

create or replace function public.leave_club(p_club uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'forbidden'; end if;
  delete from public.club_members where club_id = p_club and member_id = auth.uid();
end;
$$;

revoke execute on function public.join_club(uuid) from public, anon;
revoke execute on function public.leave_club(uuid) from public, anon;
grant execute on function public.join_club(uuid) to authenticated;
grant execute on function public.leave_club(uuid) to authenticated;
