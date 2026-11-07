import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { GUIDE_ENGINE_VERSION, openBuild, saveBuild, validateBuildPath, type BuildToSave } from './savedBuilds'

const mocks = vi.hoisted(() => {
  const query = {
    insert: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  }
  return {
    query, getUser: vi.fn(), upload: vi.fn(), download: vi.fn(), writeStored: vi.fn(), setSkin: vi.fn(),
    signedInUser: { value: { id: 'owner-a' } as { id: string } | null },
  }
})
vi.mock('./supabase', () => ({
  requireSupabase: () => ({
    auth: { getUser: mocks.getUser },
    from: () => mocks.query,
    storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) },
  }),
}))
vi.mock('./catalog', () => ({ loadCatalog: async () => ({ version: '26.3' }) }))
vi.mock('./auth', () => ({ user: mocks.signedInUser }))
vi.mock('./storage', () => ({ writeStored: mocks.writeStored }))
vi.mock('./skinStore', () => ({ setSkin: mocks.setSkin, blobToDataUrl: vi.fn() }))

const input: BuildToSave = {
  title: 'My Emerald', path: '/item/emerald?view=2d&paints=8',
  guideKey: 'item:emerald:current:8:2d:', step: 3, total: 22, cubes: 96, paints: 8,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.signedInUser.value = { id: 'owner-a' }
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null })
  for (const method of ['insert', 'update', 'select', 'eq'] as const) mocks.query[method].mockReturnValue(mocks.query)
  mocks.query.single.mockImplementation(async () => ({
    data: { id: 'build-id', revision: 0, ...mocks.query.insert.mock.calls.at(-1)?.[0] }, error: null,
  }))
})

describe('private saved builds', () => {
  it('saves the current guide with ownership, settings and generation version', async () => {
    const saved = await saveBuild(input, null)
    expect(saved).toMatchObject({
      user_id: 'owner-a', title: 'My Emerald', current_step: 3, total_steps: 22,
      engine_version: GUIDE_ENGINE_VERSION, catalog_version: '26.3', image_path: null,
    })
    expect(saved.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects a stale progress save instead of overwriting another device', async () => {
    const saved = await saveBuild(input, null)
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(saveBuild({ ...input, step: 4 }, saved)).rejects.toThrow('changed on another device')
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'build-id')
    expect(mocks.query.eq).toHaveBeenCalledWith('revision', 0)
  })

  it('keeps an existing saved place when the same guide is first saved on another device', async () => {
    const saved = await saveBuild(input, null)
    mocks.query.single.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({ data: { ...saved, current_step: 7 }, error: null })
    expect((await saveBuild(input, null)).current_step).toBe(7)
    expect(mocks.query.update).not.toHaveBeenCalled()
  })

  it('requires sign-in before any image upload or database write', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(saveBuild(input, null)).rejects.toThrow('Sign in')
    expect(mocks.query.insert).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('reuses an existing private skin upload when saving another guide configuration', async () => {
    const image = PNG.sync.write(new PNG({ width: 64, height: 64 }))
    mocks.upload.mockResolvedValue({ error: { statusCode: '409' } })
    const saved = await saveBuild({
      ...input, path: '/skin/guide?view=3d&paints=8',
      skin: { dataUrl: `data:image/png;base64,${image.toString('base64')}`, label: 'Skin', model: 'classic' },
    }, null)
    expect(saved.image_path).toMatch(/^owner-a\/[a-f0-9]{64}\.png$/)
    expect(saved).toMatchObject({ kind: 'skin', item_id: null, skin_model: 'classic' })
    expect(mocks.upload).toHaveBeenCalledWith(saved.image_path, expect.any(Blob), { contentType: 'image/png', upsert: false })
  })

  it('discards a private skin download if the user signs out while it is loading', async () => {
    const saved = await saveBuild(input, null)
    mocks.download.mockImplementation(async () => {
      mocks.signedInUser.value = null
      return { data: new Blob(), error: null }
    })
    await expect(openBuild({ ...saved, kind: 'skin', image_path: 'owner-a/skin.png', skin_model: 'classic' })).rejects.toThrow('sign-in changed')
    expect(mocks.setSkin).not.toHaveBeenCalled()
  })

  it('restores a saved step and resets outdated guides to Materials', async () => {
    const saved = await saveBuild(input, null)
    await expect(openBuild(saved)).resolves.toEqual({ path: input.path, updated: false })
    expect(mocks.writeStored).toHaveBeenLastCalledWith(`progress:${input.guideKey}`, 3)
    await expect(openBuild({ ...saved, engine_version: 'old' })).resolves.toEqual({ path: input.path, updated: true })
    expect(mocks.writeStored).toHaveBeenLastCalledWith(`progress:${input.guideKey}`, 0)
  })

  it.each(['https://elsewhere.test/', '//elsewhere.test/', '/item/emerald?redirect=bad', '/skin/guide?view=3d#bad'])('rejects an invalid stored route %s', path => {
    expect(() => validateBuildPath(path)).toThrow()
  })
})
