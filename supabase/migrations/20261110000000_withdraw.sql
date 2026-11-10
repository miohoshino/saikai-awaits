-- 退会 (SPEC 4-6), approved by the client on 2026-11-10.
-- Everything happens in one transaction: if any part fails, nothing changes.
--   1. Clubs where the caller is the only admin and other members remain: the chosen member
--      (p_handover = {"<club id>": "<member id>", ...}) becomes admin. Minors may be chosen.
--      A hidden club needs no choice (運営 manages it); a visible one without a choice is refused.
--   2. Clubs where the caller is the only member are deleted.
--   3. The caller's sign-in account is deleted; profile, tags, spots, contacts and memberships
--      go with it (cascade). Clubs and tags they created stay, with the creator left empty.

create or replace function public.withdraw(p_handover jsonb default '{}'::jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c record;
  v_new uuid;
begin
  if me is null or not public.is_member() then raise exception 'forbidden'; end if;
  if p_handover is not null and jsonb_typeof(p_handover) <> 'object' then raise exception 'invalid_handover'; end if;

  for c in
    select cl.id, cl.hidden,
      exists (select 1 from public.club_members o where o.club_id = cl.id and o.member_id <> me) as has_others,
      exists (select 1 from public.club_members o where o.club_id = cl.id and o.member_id <> me and o.is_admin) as has_other_admin,
      cm.is_admin as i_am_admin
    from public.club_members cm
    join public.clubs cl on cl.id = cm.club_id
    where cm.member_id = me
    for update of cl
  loop
    if not c.has_others then
      delete from public.clubs where id = c.id;
    elsif c.i_am_admin and not c.has_other_admin then
      begin
        v_new := nullif(coalesce(p_handover ->> c.id::text, ''), '')::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_handover';
      end;
      if v_new is null then
        if not c.hidden then raise exception 'handover_required'; end if;
      else
        update public.club_members set is_admin = true
        where club_id = c.id and member_id = v_new and member_id <> me;
        if not found then raise exception 'invalid_handover'; end if;
      end if;
    end if;
  end loop;

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.withdraw(jsonb) from public, anon;
grant execute on function public.withdraw(jsonb) to authenticated;
