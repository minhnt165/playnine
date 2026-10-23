import { describe, expect, it, vi } from 'vitest'
import { versionFile } from './version-file'

const info = { version: '2.0.0', commit: 'abc1234', time: '2026-10-23T10:00:00.000Z' }

describe('versionFile', () => {
  it('ghi version.json vào gốc bản build với version, commit và thời điểm build', () => {
    const emitFile = vi.fn()
    const plugin = versionFile(info)
    const hook = plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void
    hook.call({ emitFile })
    expect(emitFile).toHaveBeenCalledTimes(1)
    const asset = emitFile.mock.calls[0][0]
    expect(asset).toMatchObject({ type: 'asset', fileName: 'version.json' })
    expect(JSON.parse(asset.source)).toEqual(info)
  })
})
