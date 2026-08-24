create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_kind text not null default 'preset' check (avatar_kind in ('preset', 'provider', 'custom')),
  avatar_value text not null default 'owl' check (char_length(avatar_value) between 1 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;

revoke all on table public.player_profiles from anon;
grant select, insert, update, delete on table public.player_profiles to authenticated;

drop policy if exists "users_select_own_player_profile" on public.player_profiles;
create policy "users_select_own_player_profile"
on public.player_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_insert_own_player_profile" on public.player_profiles;
create policy "users_insert_own_player_profile"
on public.player_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users_update_own_player_profile" on public.player_profiles;
create policy "users_update_own_player_profile"
on public.player_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_player_profile" on public.player_profiles;
create policy "users_delete_own_player_profile"
on public.player_profiles
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-avatars',
  'player-avatars',
  true,
  1048576,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users_select_own_player_avatar" on storage.objects;
create policy "users_select_own_player_avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users_insert_own_player_avatar" on storage.objects;
create policy "users_insert_own_player_avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users_update_own_player_avatar" on storage.objects;
create policy "users_update_own_player_avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "users_delete_own_player_avatar" on storage.objects;
create policy "users_delete_own_player_avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
