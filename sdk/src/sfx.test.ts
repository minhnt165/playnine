import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFx, createSfx, SOUND_KEY, VOICES, type SfxName } from './sfx'

// AudioContext giả: ghi lại số oscillator/noise đã phát và tần số đầu.
class FakeParam {
  value = 0
  setValueAtTime(v: number) {
    this.value = v
  }
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  connect() {}
}
let started: { kind: string; freq?: number }[] = []
class FakeCtx {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = new FakeNode()
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() })
  }
  createOscillator() {
    const o = Object.assign(new FakeNode(), {
      type: 'sine',
      frequency: new FakeParam(),
      start: () => started.push({ kind: 'osc', freq: o.frequency.value }),
      stop() {},
    })
    return o
  }
  createBuffer(_c: number, len: number) {
    const data = new Float32Array(len)
    return { getChannelData: () => data }
  }
  createBufferSource() {
    return Object.assign(new FakeNode(), { buffer: null, start: () => started.push({ kind: 'noise' }), stop() {} })
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam() })
  }
  resume() {
    return Promise.resolve()
  }
}

const winWith = (ctor: unknown) => {
  const w = Object.create(window) as Window & { AudioContext?: unknown }
  Object.defineProperty(w, 'AudioContext', { value: ctor })
  Object.defineProperty(w, 'localStorage', { value: window.localStorage })
  Object.defineProperty(w, 'addEventListener', { value: window.addEventListener.bind(window) })
  return w
}

beforeEach(() => {
  started = []
  localStorage.clear()
})

describe('sfx', () => {
  it('mỗi tiếng phát đủ số nốt (và noise nếu có)', () => {
    const sfx = createSfx({ win: winWith(FakeCtx) })
    for (const name of Object.keys(VOICES) as SfxName[]) {
      started = []
      sfx.play(name)
      const v = VOICES[name]
      expect(started.filter((s) => s.kind === 'osc')).toHaveLength(v.notes.length)
      expect(started.some((s) => s.kind === 'noise')).toBe(Boolean(v.noise))
    }
  })

  it('pitch nhân tần số, bị kẹp tối đa 4 lần', () => {
    const sfx = createSfx({ win: winWith(FakeCtx) })
    sfx.play('tap', { pitch: 2 })
    expect(started[0].freq).toBe(VOICES.tap.notes[0].f * 2)
    started = []
    sfx.play('tap', { pitch: 100 })
    expect(started[0].freq).toBe(VOICES.tap.notes[0].f * 4)
  })

  it('tắt tiếng: lưu khóa chung với cổng, không phát, báo onChange', () => {
    const sfx = createSfx({ win: winWith(FakeCtx) })
    const cb = vi.fn()
    sfx.onChange(cb)
    sfx.setMuted(true)
    expect(localStorage.getItem(SOUND_KEY)).toBe('off')
    expect(sfx.isMuted()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    sfx.play('win')
    expect(started).toHaveLength(0)
    sfx.setMuted(false)
    sfx.play('win')
    expect(started.length).toBeGreaterThan(0)
  })

  it('không có Web Audio hoặc AudioContext ném lỗi: không ném ra ngoài', () => {
    expect(() => createSfx({ win: winWith(undefined) }).play('win')).not.toThrow()
    const Broken = function () {
      throw new Error('blocked')
    }
    expect(() => createSfx({ win: winWith(Broken) }).play('win')).not.toThrow()
    expect(() => createSfx({ win: undefined }).play('tap')).not.toThrow()
  })
})

describe('fx', () => {
  it('confetti không ném lỗi khi không có canvas 2d (jsdom) hoặc không có window', () => {
    expect(() => createFx({ win: window }).confetti()).not.toThrow()
    expect(() => createFx({ win: undefined }).confetti()).not.toThrow()
    expect(document.querySelector('canvas')).toBeNull()
  })
})
