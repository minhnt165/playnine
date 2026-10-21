import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GAMES, gameById } from './catalog'

const gamesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../games')

describe('catalog', () => {
  it('có 17 game với id duy nhất', () => {
    expect(GAMES).toHaveLength(17)
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(17)
  })
  it('gameById tìm đúng game', () => {
    expect(gameById('sudoku')?.dir).toBe('sugoku/')
    expect(gameById('nope')).toBeUndefined()
  })
  it('mọi dir trùng một thư mục thật trong games/', () => {
    const dirs = fs.readdirSync(gamesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    for (const g of GAMES) expect(dirs).toContain(g.dir.replace(/\/$/, ''))
  })
  it('icon trả về chuỗi HTML', () => {
    expect(gameById('co9o')?.icon('co9o/')).toBe('<img src="co9o/icon.svg" alt="">')
  })
})