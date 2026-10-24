import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '../games/catalog'
import { startGlyphs } from './glyphs'
import { mountPreviews } from './previews'

const mkRoot = () => {
  const root = document.createElement('div')
  for (const g of GAMES.filter((x) => !x.preview)) {
    const d = document.createElement('div')
    d.className = 'preview pv-' + g.id
    d.dataset.game = g.id
    root.appendChild(d)
  }
  document.body.appendChild(root)
  return root
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('mountPreviews', () => {
  it('mỗi preview có ít nhất một phần tử con sau khi mount', () => {
    const root = mkRoot()
    const stop = mountPreviews(root, { isPlaying: () => false, reduceMotion: false })
    const hosts = root.querySelectorAll('.preview[data-game]')
    expect(hosts).toHaveLength(GAMES.filter((g) => !g.preview).length)
    hosts.forEach((h) => expect(h.children.length, h.getAttribute('data-game')!).toBeGreaterThan(0))
    stop()
  })

  it('đang chơi game thì DOM preview không đổi khi timer chạy', () => {
    const root = mkRoot()
    const stop = mountPreviews(root, { isPlaying: () => true, reduceMotion: false })
    const before = root.innerHTML
    vi.advanceTimersByTime(10000)
    expect(root.innerHTML).toBe(before)
    stop()
  })

  it('hàm dọn dừng mọi interval và gỡ phần tử đã chèn, giữ con có sẵn', () => {
    const root = mkRoot()
    const keep = document.createElement('span')
    keep.className = 'kbd'
    root.querySelector('.preview')!.appendChild(keep)
    const stop = mountPreviews(root, { isPlaying: () => false, reduceMotion: false })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    stop()
    vi.advanceTimersByTime(10000)
    expect(vi.getTimerCount()).toBe(0)
    const first = root.querySelector('.preview')!
    expect(first.children).toHaveLength(1)
    expect(first.firstElementChild).toBe(keep)
  })
})

describe('startGlyphs', () => {
  const stubCtx = () =>
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    } as unknown as CanvasRenderingContext2D)

  it('chạy, recolor đọc --glyph, stop ngừng vòng vẽ', () => {
    stubCtx()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(7)
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const canvas = document.createElement('canvas')
    const g = startGlyphs(canvas, { isPlaying: () => false, reduceMotion: false })
    expect(raf).toHaveBeenCalled()
    document.documentElement.style.setProperty('--glyph', '1, 2, 3')
    expect(() => g.recolor()).not.toThrow()
    g.stop()
    expect(caf).toHaveBeenCalledWith(7)
    document.documentElement.style.removeProperty('--glyph')
    vi.unstubAllGlobals()
  })
})

describe('mountPreviews với IntersectionObserver', () => {
  // IO giả: giữ callback để test tự báo phần tử nào vào màn hình.
  let fire: (el: Element, on: boolean) => void
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: { target: Element; isIntersecting: boolean }[]) => void) {
          fire = (el, on) => cb([{ target: el, isIntersecting: on }])
        }
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('chỉ dựng preview khi phần tử vào màn hình, và chỉ dựng một lần', () => {
    const root = mkRoot()
    const stop = mountPreviews(root, { isPlaying: () => false, reduceMotion: false })
    const [a, b] = root.querySelectorAll('.preview[data-game]')
    expect(a.children).toHaveLength(0)
    expect(b.children).toHaveLength(0)
    fire(a, true)
    const count = a.children.length
    expect(a.children.length).toBeGreaterThan(0)
    expect(b.children).toHaveLength(0)
    fire(a, false)
    fire(a, true)
    expect(a.children).toHaveLength(count)
    stop()
    expect(a.children).toHaveLength(0)
  })
})
