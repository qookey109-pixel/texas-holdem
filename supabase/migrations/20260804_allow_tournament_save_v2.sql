alter table public.tournament_saves
  alter column save_version set default 2;

alter table public.tournament_saves
  drop constraint if exists tournament_saves_save_version_check;

alter table public.tournament_saves
  add constraint tournament_saves_save_version_check
  check (save_version in (1, 2));
