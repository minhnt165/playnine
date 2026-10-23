import { describe, expect, it } from 'vitest'
import { seedSql } from '../../scripts/seed-sql.mjs'
import { createDb } from './harness'

describe('seed-sql', () => {
  it('SQL sinh từ manifest chạy được và ghi đúng dòng, kể cả chuỗi có dấu nháy đơn', async () => {
    const db = await createDb()
    const modes = [
      { key: 'classic', label: { en: "Hold'em", vi: 'Xì Tố' }, rules: { min_duration_ms: 5000 }, points: 5 },
      { key: 'fast', label: { en: 'Fast', vi: 'Nhanh' } },
    ]
    await db.exec(seedSql([{ id: 'zz1', server: { metric: 'wins', points: 7, modes } }]))
    const r = await db.query<any>("select metric, points, modes, hidden from games where id = 'zz1'")
    expect(r.rows).toEqual([{ metric: 'wins', points: 7, modes, hidden: false }])
  })
})
