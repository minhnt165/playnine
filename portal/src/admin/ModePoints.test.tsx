import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { modePoints, perRunText } from '../player/leaderboardModel'
import { createFakeApi } from '../server/fakeApi'
import type { GameMeta } from '../server/types'
import { AdminGames } from './AdminGames'

const en = (k: string) => DICT.en[k] as string
const t = (k: string, p?: Record<string, string | number>) =>
  Object.entries(p ?? {}).reduce((s, [a, b]) => s.replace('{' + a + '}', String(b)), en(k))
const L = (s: string) => ({ en: s, vi: s })
const NO_RULES = { easy: {}, medium: {}, hard: {} }
const CARO: GameMeta = {
  id: 'caro', metric: 'wins', hidden: false, points: 15,
  modes: [{ key: 'easy', label: L('Easy'), points: 10 }, { key: 'medium', label: L('Medium') }, { key: 'hard', label: L('Hard'), points: 25 }],
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('modePoints / perRunText', () => {
  it('mode không có điểm riêng dùng điểm mặc định; khoảng min–max khi các mức khác nhau', () => {
    expect(modePoints(CARO)!.map((m) => [m.key, m.points])).toEqual([['easy', 10], ['medium', 15], ['hard', 25]])
    expect(perRunText(t, CARO)).toBe('10–25 pts / game')
    expect(perRunText(t, { ...CARO, modes: CARO.modes.map((m) => ({ ...m, points: 15 })) })).toBe('15 pts / game')
    expect(perRunText(t, { ...CARO, modes: [] })).toBe('15 pts / game')
  })

  it('server chưa có điểm: null', () => {
    expect(perRunText(t, { id: 'x', metric: 'wins', hidden: false, modes: [{ key: 'a', label: L('A') }] })).toBeNull()
    expect(perRunText(t, undefined)).toBeNull()
  })
})

describe('AdminGames: điểm từng mức độ', () => {
  const row = (c: HTMLElement) => within(c.querySelector<HTMLElement>('[data-game="caro"]')!)
  const modeInput = (c: HTMLElement, key: string) => c.querySelector<HTMLInputElement>(`[data-mode-points="${key}"]`)!

  it('hiện điểm riêng, ô trống có gợi ý mặc định; chỉ gửi mode đã đổi (trống = null)', async () => {
    const api = createFakeApi({ games: [CARO] })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(modeInput(container, 'easy')).toHaveValue('10'))
    expect(modeInput(container, 'medium')).toHaveValue('')
    expect(modeInput(container, 'medium')).toHaveAttribute('placeholder', '15')
    fireEvent.change(modeInput(container, 'medium'), { target: { value: '18' } })
    fireEvent.change(modeInput(container, 'hard'), { target: { value: '' } })
    fireEvent.click(row(container).getByRole('button', { name: en('admin.save') }))
    expect(await screen.findByRole('status')).toHaveTextContent(en('admin.saved'))
    const call = api.calls.find((c) => c.method === 'adminUpdateGame')!
    expect(call.args).toEqual(['caro', false, NO_RULES, null, { medium: 18, hard: null }])
    expect(api.state.games[0].modes.map((m) => m.points)).toEqual([10, 18, undefined])
  })

  it('không đổi điểm mode: gọi như cũ; giá trị sai thì báo lỗi, không gửi', async () => {
    const api = createFakeApi({ games: [CARO] })
    const { container } = mountWith(api, <AdminGames />)
    await waitFor(() => expect(modeInput(container, 'easy')).toHaveValue('10'))
    fireEvent.click(row(container).getByRole('button', { name: en('admin.save') }))
    await screen.findByRole('status')
    expect(api.calls.find((c) => c.method === 'adminUpdateGame')!.args).toEqual(['caro', false, NO_RULES])
    for (const bad of ['1001', '2.5', 'abc', '-1']) {
      fireEvent.change(modeInput(container, 'easy'), { target: { value: bad } })
      fireEvent.click(row(container).getByRole('button', { name: en('admin.save') }))
      expect(modeInput(container, 'easy')).toHaveAttribute('aria-invalid', 'true')
    }
    expect(api.calls.filter((c) => c.method === 'adminUpdateGame')).toHaveLength(1)
  })
})
