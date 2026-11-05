-- Spots ("出没スポット") and contacts on profiles (SPEC 4-2), with the minor rules of SPEC 5.
-- Minors cannot have either: whenever a member is (or becomes) a minor, both are emptied.
-- (Approved by the client on 2026-11-05, including the automatic erase when 運営 sets the minor mark.)

alter table public.members
  add column spot_districts text[] not null default '{}'
    check (cardinality(spot_districts) <= 6
           and spot_districts <@ array['西彼町','西海町','大島町','崎戸町','大瀬戸町','市外・西海に関わる']::text[]),
  add column spot_places text[] not null default '{}' check (cardinality(spot_places) <= 3),
  -- [{"type": "line|instagram|x|facebook|email|url", "value": "..."}]
  add column contacts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 5);

create or replace function public.member_spots_contacts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c jsonb;
  p text;
begin
  if new.is_minor then
    new.spot_districts := '{}';
    new.spot_places := '{}';
    new.contacts := '[]'::jsonb;
    return new;
  end if;
  foreach p in array new.spot_places loop
    if char_length(trim(p)) = 0 or char_length(p) > 60 then raise exception 'invalid_places'; end if;
  end loop;
  for c in select * from jsonb_array_elements(new.contacts) loop
    if jsonb_typeof(c) <> 'object'
       or coalesce(c->>'type', '') not in ('line','instagram','x','facebook','email','url')
       or char_length(trim(coalesce(c->>'value', ''))) = 0
       or char_length(c->>'value') > 200 then
      raise exception 'invalid_contacts';
    end if;
  end loop;
  return new;
end;
$$;

create trigger members_spots_contacts_guard
  before insert or update on public.members
  for each row execute function public.member_spots_contacts_guard();

grant update (spot_districts, spot_places, contacts) on public.members to authenticated;
