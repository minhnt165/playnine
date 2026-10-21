// Âm thanh và hiệu ứng dùng chung cho mọi game: tổng hợp bằng Web Audio (không tải file), không bao giờ ném lỗi.
// Bật/tắt tiếng lưu ở localStorage chung với cổng (cùng origin) nên tắt ở cổng là game nào cũng im.

export const SOUND_KEY = 'playnine-sound-v1'

export type SfxName =
  | 'tap' | 'move' | 'place' | 'capture' | 'flip' | 'merge' | 'clear' | 'combo' | 'drop'
  | 'error' | 'win' | 'lose' | 'draw' | 'start' | 'tick' | 'pop' | 'coin' | 'levelup'

/** `pitch`: hệ số tần số (vd. 2048 dùng theo giá trị ô); `volume`: 0..1 nhân thêm vào âm lượng chung. */
export type SfxOptions = { pitch?: number; volume?: number }

export type SfxApi = {
  play(name: SfxName, o?: SfxOptions): void
  isMuted(): boolean
  setMuted(muted: boolean): void
  /** Báo khi bật/tắt tiếng (kể cả từ tab/khung khác); trả hàm hủy. */
  onChange(cb: (muted: boolean) => void): () => void
}

export type FxApi = {
  /** Pháo giấy khi thắng; bỏ qua khi người chơi chọn giảm chuyển động. */
  confetti(o?: { count?: number }): void
}

type Wave = OscillatorType
/** Một nốt: tần số (Hz), lúc bắt đầu và độ dài (giây), dạng sóng, âm lượng, trượt tới tần số khác. */
type Note = { f: number; at?: number; d: number; w?: Wave; g?: number; to?: number }
/** Một tiếng: các nốt + tiếng xì (noise) lọc thông dải cho tiếng va chạm. */
type Voice = { notes: Note[]; noise?: { at?: number; d: number; g: number; band: number } }

const arp = (fs: number[], step: number, d: number, w: Wave = 'triangle', g = 0.5): Note[] =>
  fs.map((f, i) => ({ f, at: i * step, d, w, g }))

export const VOICES: Record<SfxName, Voice> = {
  tap: { notes: [{ f: 660, d: 0.04, w: 'sine', g: 0.35 }] },
  move: { notes: [{ f: 440, to: 540, d: 0.07, w: 'triangle', g: 0.45 }] },
  place: { notes: [{ f: 320, to: 190, d: 0.09, w: 'triangle', g: 0.6 }], noise: { d: 0.03, g: 0.25, band: 2400 } },
  capture: { notes: [{ f: 240, to: 110, d: 0.12, w: 'triangle', g: 0.55 }], noise: { d: 0.09, g: 0.45, band: 1300 } },
  flip: { notes: [{ f: 520, to: 820, d: 0.06, w: 'sine', g: 0.4 }] },
  merge: { notes: [{ f: 392, d: 0.08, w: 'sine', g: 0.4 }, { f: 588, at: 0.03, d: 0.09, w: 'sine', g: 0.35 }] },
  clear: { notes: arp([523, 659, 784, 1047], 0.05, 0.09, 'triangle', 0.45) },
  combo: { notes: arp([659, 784, 988, 1319, 1568], 0.045, 0.08, 'square', 0.22) },
  drop: { notes: [{ f: 190, to: 85, d: 0.1, w: 'triangle', g: 0.6 }], noise: { d: 0.04, g: 0.2, band: 900 } },
  error: { notes: [{ f: 196, d: 0.08, w: 'square', g: 0.18 }, { f: 156, at: 0.09, d: 0.11, w: 'square', g: 0.18 }] },
  win: {
    notes: [
      ...arp([523, 659, 784], 0.1, 0.12, 'triangle', 0.5),
      { f: 1047, at: 0.3, d: 0.42, w: 'triangle', g: 0.55 },
      { f: 1568, at: 0.32, d: 0.4, w: 'sine', g: 0.2 },
      { f: 2093, at: 0.36, d: 0.34, w: 'sine', g: 0.12 },
    ],
  },
  lose: { notes: [...arp([392, 330, 262], 0.14, 0.16, 'sawtooth', 0.18), { f: 196, at: 0.42, d: 0.4, w: 'triangle', g: 0.4 }] },
  draw: { notes: arp([440, 440], 0.14, 0.12, 'triangle', 0.4) },
  start: { notes: [{ f: 392, to: 784, d: 0.16, w: 'triangle', g: 0.45 }, { f: 988, at: 0.15, d: 0.12, w: 'sine', g: 0.3 }] },
  tick: { notes: [{ f: 1250, d: 0.02, w: 'sine', g: 0.18 }] },
  pop: { notes: [{ f: 880, to: 1320, d: 0.05, w: 'sine', g: 0.4 }] },
  coin: { notes: [{ f: 988, d: 0.06, w: 'square', g: 0.2 }, { f: 1319, at: 0.06, d: 0.16, w: 'square', g: 0.2 }] },
  levelup: { notes: arp([523, 784, 1047, 1568], 0.07, 0.12, 'triangle', 0.45) },
}

const MASTER = 0.3

type Env = { win: Window | undefined }

export function createSfx(env: Env): SfxApi {
  const { win } = env
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  const listeners = new Set<(m: boolean) => void>()

  const readMuted = (): boolean => {
    try {
      return win?.localStorage.getItem(SOUND_KEY) === 'off'
    } catch {
      return false
    }
  }

  // Tạo AudioContext lúc phát lần đầu (trình duyệt chỉ cho phát sau thao tác của người chơi).
  const audio = (): AudioContext | null => {
    if (ctx) return ctx
    const Ctor = win && ((win as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = MASTER
    master.connect(ctx.destination)
    return ctx
  }

  const noise = (ac: AudioContext): AudioBuffer => {
    if (noiseBuf) return noiseBuf
    const len = Math.floor(ac.sampleRate * 0.25)
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return noiseBuf
  }

  // Bao âm lượng: lên nhanh 5ms rồi tắt dần theo hàm mũ, tránh tiếng "tách" khi cắt sóng.
  const envelope = (ac: AudioContext, start: number, d: number, peak: number): GainNode => {
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, start + d)
    g.connect(master!)
    return g
  }

  function play(name: SfxName, o: SfxOptions = {}) {
    try {
      if (readMuted()) return
      const voice = VOICES[name]
      const ac = voice && audio()
      if (!ac) return
      if (ac.state === 'suspended') void ac.resume().catch(() => {})
      const t0 = ac.currentTime + 0.005
      const pitch = o.pitch && Number.isFinite(o.pitch) && o.pitch > 0 ? Math.min(o.pitch, 4) : 1
      const vol = o.volume === undefined ? 1 : Math.max(0, Math.min(1, o.volume))
      for (const n of voice.notes) {
        const start = t0 + (n.at ?? 0)
        const osc = ac.createOscillator()
        osc.type = n.w ?? 'sine'
        osc.frequency.setValueAtTime(n.f * pitch, start)
        if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to * pitch, start + n.d)
        osc.connect(envelope(ac, start, n.d, (n.g ?? 0.5) * vol))
        osc.start(start)
        osc.stop(start + n.d + 0.02)
      }
      if (voice.noise) {
        const start = t0 + (voice.noise.at ?? 0)
        const src = ac.createBufferSource()
        src.buffer = noise(ac)
        const band = ac.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = voice.noise.band
        src.connect(band)
        band.connect(envelope(ac, start, voice.noise.d, voice.noise.g * vol))
        src.start(start)
        src.stop(start + voice.noise.d + 0.02)
      }
    } catch {
      /* bỏ qua: âm thanh không được làm hỏng game */
    }
  }

  try {
    win?.addEventListener('storage', (e) => {
      if (e.key === SOUND_KEY) listeners.forEach((cb) => cb(readMuted()))
    })
  } catch {
    /* bỏ qua */
  }

  return {
    play,
    isMuted: readMuted,
    setMuted(muted) {
      try {
        win?.localStorage.setItem(SOUND_KEY, muted ? 'off' : 'on')
      } catch {
        /* bỏ qua */
      }
      listeners.forEach((cb) => cb(muted))
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

const CONFETTI_COLORS = ['#8b6cff', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#ffffff']

export function createFx(env: Env): FxApi {
  const { win } = env
  return {
    confetti(o = {}) {
      try {
        const doc = win?.document
        if (!win || !doc?.body || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
        const canvas = doc.createElement('canvas')
        canvas.setAttribute('aria-hidden', 'true')
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647'
        const dpr = Math.min(win.devicePixelRatio || 1, 2)
        canvas.width = win.innerWidth * dpr
        canvas.height = win.innerHeight * dpr
        doc.body.appendChild(canvas)
        const c = canvas.getContext('2d')
        if (!c) return canvas.remove()
        const W = canvas.width
        const H = canvas.height
        const count = Math.max(10, Math.min(o.count ?? 140, 300))
        // Bắn từ hai góc dưới lên giữa, rơi xuống theo trọng lực.
        const parts = Array.from({ length: count }, (_, i) => {
          const left = i % 2 === 0
          const ang = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7
          const sp = (0.9 + Math.random() * 0.7) * H * 0.022
          return {
            x: left ? W * 0.08 : W * 0.92, y: H * 0.95, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            r: (4 + Math.random() * 5) * dpr, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }
        })
        const g = H * 0.00055
        const start = win.performance.now()
        const frame = (now: number) => {
          const t = now - start
          c.clearRect(0, 0, W, H)
          c.globalAlpha = t > 1400 ? Math.max(0, 1 - (t - 1400) / 600) : 1
          for (const p of parts) {
            p.vy += g * 16
            p.vx *= 0.99
            p.x += p.vx
            p.y += p.vy
            p.rot += p.vr
            c.save()
            c.translate(p.x, p.y)
            c.rotate(p.rot)
            c.fillStyle = p.color
            c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
            c.restore()
          }
          if (t < 2000) win.requestAnimationFrame(frame)
          else canvas.remove()
        }
        win.requestAnimationFrame(frame)
      } catch {
        /* bỏ qua */
      }
    },
  }
}
