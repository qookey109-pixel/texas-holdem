create table if not exists public.tournament_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_version integer not null default 1 check (save_version = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_saves enable row level security;

revoke all on table public.tournament_saves from anon;
grant select, insert, update, delete on table public.tournament_saves to authenticated;

drop policy if exists "users_select_own_tournament_save" on public.tournament_saves;
create policy "users_select_own_tournament_save"
on public.tournament_saves
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_insert_own_tournament_save" on public.tournament_saves;
create policy "users_insert_own_tournament_save"
on public.tournament_saves
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users_update_own_tournament_save" on public.tournament_saves;
create policy "users_update_own_tournament_save"
on public.tournament_saves
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_tournament_save" on public.tournament_saves;
create policy "users_delete_own_tournament_save"
on public.tournament_saves
for delete
to authenticated
using (auth.uid() = user_id);
