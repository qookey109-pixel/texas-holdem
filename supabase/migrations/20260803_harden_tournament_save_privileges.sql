revoke all on table public.tournament_saves from authenticated;

grant select, insert, update, delete
on table public.tournament_saves
to authenticated;
