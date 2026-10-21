import { afterEach, describe, expect, it, vi } from 'vitest'
import { readJSON, readRaw, write } from './storage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('storage', () => {
  it('readJSON returns null when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readJSON('k')).toBeNull()
    expect(readRaw('k')).toBeNull()
  })

  it('readJSON returns null on invalid JSON', () => {
    localStorage.setItem('k', '{oops')
    expect(readJSON('k')).toBeNull()
  })

  it('readJSON parses valid JSON', () => {
    localStorage.setItem('k', '{"a":1}')
    expect(readJSON<{ a: number }>('k')).toEqual({ a: 1 })
  })

  it('write swallows setItem errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => write('k', 'v')).not.toThrow()
  })
})