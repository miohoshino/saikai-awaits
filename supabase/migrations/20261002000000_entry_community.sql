-- Link events to the community (or challenge) that hosts them.

alter table public.entries
  add column community_id uuid references public.entries(id) on delete set null;

create index entries_community_idx on public.entries (community_id) where community_id is not null;
