import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveGameFile } from './serve-games'

let repo: string
beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-'))
  fs.mkdirSync(path.join(repo, 'games', '2048'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'brand'))
  fs.writeFileSync(path.join(repo, 'games', '2048', 'index.html'), 'x')
  fs.writeFileSync(path.join(repo, 'brand', 'icon.svg'), 'x')
  fs.writeFileSync(path.join(repo, 'package.json'), '{}')
  fs.writeFileSync(path.join(repo, '.env'), 'secret')
})
afterAll(() => fs.rmSync(repo, { recursive: true, force: true }))

describe('resolveGameFile', () => {
  it('maps a game directory URL to its index.html', () => {
    expect(resolveGameFile('/playnine/2048/', repo)).toBe(path.join(repo, 'games', '2048', 'index.html'))
  })
  it('maps brand assets', () => {
    expect(resolveGameFile('/playnine/brand/icon.svg?v=1', repo)).toBe(path.join(repo, 'brand', 'icon.svg'))
  })
  it.each(['/playnine/..%2f.env', '/playnine/../package.json', '/playnine/2048/../../package.json', '/playnine/./package.json', '/playnine/', '/playnine/nope/', '/other/2048/'])(
    'rejects %s',
    (url) => {
      expect(resolveGameFile(url, repo)).toBeNull()
    },
  )
})