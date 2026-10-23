import { describe, expect, it, vi } from 'vitest'
import { fetchRemoteCommit, hasNewBuild } from './updateCheck'

const json = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) })

describe('fetchRemoteCommit', () => {
  it('đọc commit từ version.json, bỏ qua mọi cache', async () => {
    const f = json({ version: '2.0.0', commit: 'def5678', time: 'x' })
    await expect(fetchRemoteCommit(f)).resolves.toBe('def5678')
    expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/version\.json$/), { cache: 'no-store' })
  })

  it('trả null khi server trả lỗi, JSON hỏng hoặc mạng lỗi', async () => {
    await expect(fetchRemoteCommit(json({}, false))).resolves.toBeNull()
    await expect(fetchRemoteCommit(json({ commit: 7 }))).resolves.toBeNull()
    await expect(fetchRemoteCommit(vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeNull()
  })
})

describe('hasNewBuild', () => {
  it('chỉ báo mới khi commit trên server khác bản đang chạy', () => {
    expect(hasNewBuild('def5678', 'abc1234')).toBe(true)
    expect(hasNewBuild('abc1234', 'abc1234')).toBe(false)
    expect(hasNewBuild(null, 'abc1234')).toBe(false)
  })

  it('bản chạy local (commit "dev") không bao giờ báo', () => {
    expect(hasNewBuild('def5678', 'dev')).toBe(false)
  })
})
