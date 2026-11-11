import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite
let existingLibrary: unknown[]
const sqlFile = (path: string) => readFileSync(new URL(`../supabase/${path}`, import.meta.url), 'utf8')
const existingLibrarySql = `select
  (select jsonb_agg(to_jsonb(build)) from public.saved_builds build) as builds,
  (select jsonb_agg(to_jsonb(image)) from storage.objects image) as images,
  (select jsonb_agg(to_jsonb(bucket)) from storage.buckets bucket) as buckets`

beforeAll(async () => {
  // A disposable PostgreSQL database, never the configured Supabase project.
  // These stubs represent only the Auth/Storage schema used by our SQL tests;
  // they do not replace a hosted Supabase integration check before release.
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1];
    $$;
  `)
  for (const migration of [
    '202611070001_saved_builds.sql',
    '202611070002_library_limits.sql',
  ]) {
    await db.exec(sqlFile(`migrations/${migration}`))
  }
  await db.exec(`
    insert into auth.users (id) values ('10000000-0000-4000-8000-000000000099');
    insert into public.saved_builds (
      user_id, fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count
    ) values (
      '10000000-0000-4000-8000-000000000099', repeat('c', 64), 'Existing Emerald', 'item', 'emerald',
      '/item/emerald?view=2d', 'test:emerald', '1', 4, 10, 96, 8
    );
    insert into storage.objects (bucket_id, name) values (
      'build-skins', '10000000-0000-4000-8000-000000000099/' || repeat('c', 64) || '.png'
    );
  `)
  existingLibrary = (await db.query(existingLibrarySql)).rows
  await db.exec(sqlFile('migrations/202611070003_community_profiles.sql'))
  await db.exec(sqlFile('migrations/202611100001_community_discussions.sql'))
}, 30_000)

afterAll(async () => { await db?.close() })

describe('community migration with existing library policies', () => {
  it('preserves pre-existing build progress, private image records, and bucket settings', async () => {
    expect((await db.query(existingLibrarySql)).rows).toEqual(existingLibrary)
  })

  it.each(['saved_builds', 'library_limits', 'community_profiles', 'community_discussions'])('passes the %s SQL regression checks', async name => {
    try {
      const results = await db.exec(sqlFile(`tests/${name}.sql`))
      expect(results.some(result => result.rows.some(row => typeof row.result === 'string' && row.result.includes('passed')))).toBe(true)
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }, 15_000)
})
