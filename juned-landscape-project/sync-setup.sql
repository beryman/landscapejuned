-- ============================================================
-- Juned Landscape Project: penyiapan sinkron antar perangkat
-- Jalankan SEKALI di Supabase: SQL Editor > New query > tempel > Run
-- ============================================================

create table if not exists public.jlp_docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  coll       text        not null,            -- jenis data (proyek, tanaman, transaksi, dst.)
  id         text        not null,            -- id data
  data       jsonb,                           -- isi data (null bila sudah dihapus)
  deleted    boolean     not null default false,
  device     text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, coll, id)
);

create index if not exists jlp_docs_pull_idx on public.jlp_docs (user_id, updated_at);

-- Waktu perubahan selalu diisi server (tidak bergantung jam perangkat)
create or replace function public.jlp_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists jlp_docs_touch on public.jlp_docs;
create trigger jlp_docs_touch
before insert or update on public.jlp_docs
for each row execute function public.jlp_set_updated_at();

-- Keamanan: setiap akun hanya bisa membaca/menulis barisnya sendiri
alter table public.jlp_docs enable row level security;

drop policy if exists "jlp_select_own" on public.jlp_docs;
drop policy if exists "jlp_insert_own" on public.jlp_docs;
drop policy if exists "jlp_update_own" on public.jlp_docs;
drop policy if exists "jlp_delete_own" on public.jlp_docs;

create policy "jlp_select_own" on public.jlp_docs for select to authenticated using (auth.uid() = user_id);
create policy "jlp_insert_own" on public.jlp_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "jlp_update_own" on public.jlp_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jlp_delete_own" on public.jlp_docs for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.jlp_docs to authenticated;

-- ------------------------------------------------------------
-- Meter ruang cloud (dibaca aplikasi untuk menampilkan pemakaian)
-- ------------------------------------------------------------
create or replace function public.jlp_usage() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'db_bytes',   pg_database_size(current_database()),
    'mine_bytes', coalesce((select sum(pg_column_size(d.*)) from public.jlp_docs d where d.user_id = auth.uid()), 0),
    'rows',       (select count(*) from public.jlp_docs d where d.user_id = auth.uid())
  );
$$;
revoke all on function public.jlp_usage() from public;
grant execute on function public.jlp_usage() to authenticated;
