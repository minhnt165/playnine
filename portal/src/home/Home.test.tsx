import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/i18n'
import { DICT } from '../i18n/dict'
import { Home } from './Home'

const renderHome = (openIds = new Set<string>()) =>
  render(
    <I18nProvider>
      <Home openIds={openIds} refreshKey={0} />
    </I18nProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.classList.remove('revealed')
})

describe('Home', () => {
  it('hiện 17 thẻ game, mỗi thẻ có preview và liên kết #/play/<id>', () => {
    const { container } = renderHome()
    const items = container.querySelectorAll('#games > li')
    expect(items).toHaveLength(17)
    expect(items[0].querySelector('a.card')!.getAttribute('href')).toBe('#/play/co9o')
    expect(items[0].querySelector('.preview.pv-co9o[data-game="co9o"]')).not.toBeNull()
    expect(items[0].querySelectorAll('.kbd')).toHaveLength(1)
    expect(items[9].querySelector('.kbd')).toBeNull()
  })

  it('chữ do game ghi hiện dạng text, không dựng phần tử', () => {
    const evil = '<img src=x onerror=alert(1)>'
    localStorage.setItem(
      'playnine-co9o-summary-v1',
      JSON.stringify({ v: 1, updatedAt: 5, resume: { title: evil, detail: 'chi tiết' } }),
    )
    const { container } = renderHome()
    const today = container.querySelector('#today')!
    expect(today.querySelector('.tile-body img')).toBeNull()
    expect(today.textContent).toContain(evil)
  })

  it('bấm nút lọc versus ẩn thẻ arcade và lưu khóa filter', () => {
    const { container } = renderHome()
    fireEvent.click(container.querySelector('#filters button:nth-child(3)')!)
    expect(container.querySelector('li[data-cat="arcade"]')!.hasAttribute('hidden')).toBe(true)
    expect(container.querySelector('li[data-cat="versus"]')!.hasAttribute('hidden')).toBe(false)
    expect(localStorage.getItem('game-portal-filter-v1')).toBe('versus')
    expect(container.querySelector('#filters button[aria-pressed="true"]')!.textContent).toMatch(/^Versus/)
  })

  it('localStorage.getItem ném lỗi: vẫn render 17 thẻ và stats.empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { container } = renderHome()
    expect(container.querySelectorAll('#games > li')).toHaveLength(17)
    expect(container.querySelector('#stats')!.textContent).toBe(DICT.en['stats.empty'])
  })

  it('ruy băng "đang mở" theo openIds', () => {
    const { container } = renderHome(new Set(['sudoku']))
    const li = container.querySelectorAll('#games > li')[1]
    expect(li.querySelector('.ribbon .r-long')!.textContent).toBe(DICT.en['ribbon.open'])
  })

  it('nút ngôn ngữ đổi sang tiếng Việt', () => {
    renderHome()
    fireEvent.click(document.getElementById('lang-btn')!)
    expect(document.getElementById('today')!.getAttribute('aria-label')).toBe(DICT.vi['today.label'])
  })

  it('stats đếm lên rồi dừng ở giá trị đích', () => {
    vi.useFakeTimers()
    localStorage.setItem('sudoku-vn-stats-v1', JSON.stringify({ byDifficulty: { easy: { won: 4, lost: 0 } } }))
    const { container } = renderHome()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    vi.useRealTimers()
    expect(container.querySelector('#stats .stat b')!.textContent).toBe('4')
    expect(screen.getByText(DICT.en['stats.played'] as string)).toBeInTheDocument()
  })
})