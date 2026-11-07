begin;

create table public.saved_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  title text not null check (length(trim(title)) between 1 and 100),
  kind text not null check (kind in ('item', 'skin')),
  item_id text check (item_id ~ '^[a-z0-9_]+$'),
  image_path text,
  skin_model text check (skin_model in ('classic', 'slim')),
  resume_path text not null check (length(resume_path) <= 1000 and resume_path ~ '^/(item/[a-z0-9_]+|skin/guide)\?'),
  guide_key text not null check (length(guide_key) between 1 and 500),
  engine_version text not null,
  catalog_version text,
  current_step integer not null check (current_step >= 0),
  total_steps integer not null check (total_steps > 0 and current_step <= total_steps),
  cube_count integer not null check (cube_count > 0),
  paint_count integer not null check (paint_count between 1 and 32),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint),
  check (
    (kind = 'item' and item_id is not null and image_path is null and skin_model is null and resume_path like '/item/' || item_id || '?%')
    or
    (kind = 'skin' and item_id is null and skin_model is not null and image_path is not null
      and image_path ~ ('^' || user_id::text || '/[a-f0-9]{64}\.png$') and resume_path like '/skin/guide?%')
  )
);

create index saved_builds_owner_updated on public.saved_builds (user_id, updated_at desc);
alter table public.saved_builds enable row level security;
revoke all on public.saved_builds from anon;
grant select, insert, update, delete on public.saved_builds to authenticated;
create policy "Read own builds" on public.saved_builds for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own builds" on public.saved_builds for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own builds" on public.saved_builds for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own builds" on public.saved_builds for delete to authenticated using ((select auth.uid()) = user_id);

create function public.touch_saved_build() returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger saved_build_revision before update on public.saved_builds
  for each row execute function public.touch_saved_build();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('build-skins', 'build-skins', false, 1048576, array['image/png']);
create policy "Read own build images" on storage.objects for select to authenticated
  using (bucket_id = 'build-skins' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own build images" on storage.objects for insert to authenticated
  with check (bucket_id = 'build-skins' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
