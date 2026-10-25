import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountWith } from '../events/testUtil'
import { DICT } from '../i18n/dict'
import { createFakeApi } from '../server/fakeApi'
import { Sidebar } from './Sidebar'

const en = (k: string) => DICT.en[k] as string

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  location.hash = ''
})

describe('Sidebar', () => {
  it('mục Games là link tới trang #/games (không mở hộp chọn game)', () => {
    mountWith(createFakeApi({}), <Sidebar />)
    const link = screen.getByRole('link', { name: en('nav.games') })
    expect(link).toHaveAttribute('href', '#/games')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('đang ở #/games: mục Games được đánh dấu là trang hiện tại', () => {
    location.hash = '#/games'
    mountWith(createFakeApi({}), <Sidebar />)
    expect(screen.getByRole('link', { name: en('nav.games') })).toHaveAttribute('aria-current', 'page')
  })
})
