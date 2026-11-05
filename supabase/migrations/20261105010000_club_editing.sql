-- Club creation and editing (SPEC 4-1), and a members-only photo bucket.
-- Anyone who is a member can create a club (published immediately; creator becomes the club admin).
-- Club admins edit their own clubs; 運営 (role = admin) can edit every club.
-- Minors (SPEC 5-5) may only belong to clubs that allow minors.

-- Validates a club payload and returns it normalized. Raises an exception with a short code on bad input.
create or replace function public.club_payload(p jsonb)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  name text := trim(coalesce(p->>'name', ''));
  activity text := trim(coalesce(p->>'activity', ''));
  district text := coalesce(p->>'district', '');
  contacts jsonb := coalesce(p->'contacts', '[]'::jsonb);
  cleaned jsonb := '[]'::jsonb;
  c jsonb;
  label text; url text; note text;
begin
  if name = '' or char_length(name) > 80 then raise exception 'invalid_name'; end if;
  if activity = '' or char_length(activity) > 300 then raise exception 'invalid_activity'; end if;
  if district not in ('西彼町', '西海町', '大島町', '崎戸町', '大瀬戸町', '市外・西海に関わる') then raise exception 'invalid_district'; end if;
  if jsonb_typeof(contacts) <> 'array' then raise exception 'invalid_contacts'; end if;
  for c in select * from jsonb_array_elements(contacts) loop
    label := trim(coalesce(c->>'label', ''));
    url := trim(coalesce(c->>'url', ''));
    note := trim(coalesce(c->>'note', ''));
    continue when label = '' and url = '' and note = '';
    if char_length(label) > 60 or char_length(url) > 300 or char_length(note) > 120 then raise exception 'invalid_contacts'; end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object('label', label, 'url', url, 'note', note));
  end loop;
  if jsonb_array_length(cleaned) = 0 or jsonb_array_length(cleaned) > 10 then raise exception 'invalid_contacts'; end if;
  if char_length(coalesce(p->>'description', '')) > 1000
     or char_length(coalesce(p->>'venue', '')) > 120
     or char_length(coalesce(p->>'frequency', '')) > 80
     or char_length(coalesce(p->>'image_url', '')) > 300 then
    raise exception 'too_long';
  end if;
  return jsonb_build_object(
    'name', name,
    'activity', activity,
    'description', trim(coalesce(p->>'description', '')),
    'district', district,
    'venue', trim(coalesce(p->>'venue', '')),
    'frequency', trim(coalesce(p->>'frequency', '')),
    'contacts', cleaned,
    'is_paid', coalesce((p->>'is_paid')::boolean, false),
    'minors_ok', coalesce((p->>'minors_ok')::boolean, false),
    'image_url', coalesce(p->>'image_url', '')
  );
end;
$$;

-- A photo path must be in the caller's own upload folder ("<uid>/...") unless it is unchanged.
create or replace function public.club_image_ok(p_path text, p_current text)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_path = '' or p_path = coalesce(p_current, '') or p_path like auth.uid()::text || '/%';
$$;

create or replace function public.create_club(p jsonb)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare
  v jsonb;
  me public.members;
  c public.clubs;
begin
  select * into me from public.members where id = auth.uid();
  if me.id is null then raise exception 'forbidden'; end if;
  v := public.club_payload(p);
  if not public.club_image_ok(v->>'image_url', '') then raise exception 'invalid_image'; end if;
  insert into public.clubs (name, activity, description, district, venue, frequency, contacts, is_paid, minors_ok, image_url, created_by)
  values (v->>'name', v->>'activity', v->>'description', v->>'district', v->>'venue', v->>'frequency', v->'contacts',
          (v->>'is_paid')::boolean,
          (v->>'minors_ok')::boolean or me.is_minor,   -- a minor can only belong to a club that allows minors
          v->>'image_url', me.id)
  returning * into c;
  insert into public.club_members (club_id, member_id, is_admin) values (c.id, me.id, true);
  return c;
end;
$$;

create or replace function public.update_club(p_id uuid, p jsonb)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare
  v jsonb;
  me public.members;
  cur public.clubs;
  c public.clubs;
  v_minors_ok boolean;
begin
  select * into me from public.members where id = auth.uid();
  if me.id is null then raise exception 'forbidden'; end if;
  select * into cur from public.clubs where id = p_id;
  if cur.id is null then raise exception 'not_found'; end if;
  if not (me.role = 'admin' or exists (
    select 1 from public.club_members m where m.club_id = p_id and m.member_id = me.id and m.is_admin
  )) then raise exception 'forbidden'; end if;
  v := public.club_payload(p);
  if not public.club_image_ok(v->>'image_url', cur.image_url) then raise exception 'invalid_image'; end if;
  v_minors_ok := (v->>'minors_ok')::boolean or me.is_minor;
  if not v_minors_ok and exists (
    select 1 from public.club_members m join public.members x on x.id = m.member_id
    where m.club_id = p_id and x.is_minor
  ) then raise exception 'has_minor_members'; end if;
  update public.clubs set
    name = v->>'name', activity = v->>'activity', description = v->>'description', district = v->>'district',
    venue = v->>'venue', frequency = v->>'frequency', contacts = v->'contacts',
    is_paid = (v->>'is_paid')::boolean, minors_ok = v_minors_ok, image_url = v->>'image_url'
  where id = p_id
  returning * into c;
  return c;
end;
$$;

revoke execute on function public.create_club(jsonb) from public, anon;
revoke execute on function public.update_club(uuid, jsonb) from public, anon;
grant execute on function public.create_club(jsonb) to authenticated;
grant execute on function public.update_club(uuid, jsonb) to authenticated;

-- Members-only photo bucket: not public; the app shows photos through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-images', 'club-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy club_images_member_read on storage.objects for select to authenticated
  using (bucket_id = 'club-images' and public.is_member());
create policy club_images_own_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'club-images' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);
