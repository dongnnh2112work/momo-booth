-- One shared queue for every Vercel instance. Service role only.
-- Anon and authenticated have no policies, so the browser cannot read or write this row.

create table if not exists public.live_state (
  id text primary key,
  revision bigint not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.live_state enable row level security;

revoke all on table public.live_state from anon, authenticated;
grant select, insert, update on table public.live_state to service_role;

insert into public.live_state (id, revision, state)
values (
  'live',
  0,
  jsonb_build_object(
    'revision', 0,
    'booths', jsonb_build_object(
      '5-10', jsonb_build_object('spotlight', null, 'queue', '[]'::jsonb, 'cooldowns', '{}'::jsonb),
      '3-5', jsonb_build_object('spotlight', null, 'queue', '[]'::jsonb, 'cooldowns', '{}'::jsonb)
    )
  )
)
on conflict (id) do nothing;
