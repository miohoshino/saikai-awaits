-- 運営 (role = admin) moderation tools (SPEC 4-7), approved by the client on 2026-11-09:
-- hide / delete clubs, hide / delete members, add / delete attribute tags.

create or replace function public.admin_set_club_hidden(p_club uuid, p_hidden boolean)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare c public.clubs;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.clubs set hidden = coalesce(p_hidden, false) where id = p_club returning * into c;
  if c.id is null then raise exception 'not_found'; end if;
  return c;
end;
$$;

-- Deletes the club and (by cascade) its memberships.
create or replace function public.admin_delete_club(p_club uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.clubs where id = p_club;
end;
$$;

create or replace function public.admin_set_member_visible(p_member uuid, p_visible boolean)
returns public.members
language plpgsql security definer
set search_path = ''
as $$
declare m public.members;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.members set visible = coalesce(p_visible, true) where id = p_member returning * into m;
  if m.id is null then raise exception 'not_found'; end if;
  return m;
end;
$$;

-- Deletes the sign-in account; profile, memberships and other member data go with it (cascade).
-- Clubs the member managed stay (without that admin; 運営 manages them).
create or replace function public.admin_delete_member(p_member uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_member = auth.uid() then raise exception 'self'; end if;
  delete from auth.users where id = p_member;
end;
$$;

create or replace function public.admin_add_tag(p_label text)
returns public.tags
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.tags;
  l text := trim(coalesce(p_label, ''));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if l = '' or char_length(l) > 40 then raise exception 'invalid_label'; end if;
  insert into public.tags (label, is_official, created_by) values (l, true, auth.uid())
  on conflict (label) do update set is_official = true
  returning * into t;
  return t;
end;
$$;

-- Removes the tag from the list and from every profile that has it
-- (otherwise it would come back the next time that member saves).
create or replace function public.admin_delete_tag(p_label text)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.members set tags = array_remove(tags, p_label) where p_label = any(tags);
  get diagnostics n = row_count;
  delete from public.tags where label = p_label;
  return n;
end;
$$;

revoke execute on function public.admin_set_club_hidden(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_club(uuid) from public, anon;
revoke execute on function public.admin_set_member_visible(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_member(uuid) from public, anon;
revoke execute on function public.admin_add_tag(text) from public, anon;
revoke execute on function public.admin_delete_tag(text) from public, anon;
grant execute on function public.admin_set_club_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_club(uuid) to authenticated;
grant execute on function public.admin_set_member_visible(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;
grant execute on function public.admin_add_tag(text) to authenticated;
grant execute on function public.admin_delete_tag(text) to authenticated;
