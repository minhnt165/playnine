import { afterEach, describe, expect, it } from 'vitest'
import { rememberReturnHash, restoreReturnHash } from './returnHash'

const KEY = 'playnine-return-hash'

describe('returnHash', () => {
  afterEach(() => {
    sessionStorage.clear()
    location.hash = ''
  })

  it('remember lưu hash hiện tại; hash rỗng thì không lưu', () => {
    rememberReturnHash()
    expect(sessionStorage.getItem(KEY)).toBeNull()
    location.hash = '#/play/2048'
    rememberReturnHash()
    expect(sessionStorage.getItem(KEY)).toBe('#/play/2048')
  })

  it('restore quay lại hash đã nhớ khi hash hiện tại rỗng, rồi xóa khóa', () => {
    sessionStorage.setItem(KEY, '#/play/caro')
    restoreReturnHash()
    expect(location.hash).toBe('#/play/caro')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('restore không đè hash hiện tại nhưng vẫn xóa khóa', () => {
    location.hash = '#/u/abc'
    sessionStorage.setItem(KEY, '#/play/caro')
    restoreReturnHash()
    expect(location.hash).toBe('#/u/abc')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('không có khóa thì không làm gì', () => {
    restoreReturnHash()
    expect(location.hash).toBe('')
  })
})