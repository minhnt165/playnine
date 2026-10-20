import { describe, expect, it } from 'vitest'
import { gameById } from '../games/catalog'
import { nextFrameIds } from './frames'

const g2048 = gameById('2048')!
const xq = gameById('xiangqi')!

describe('nextFrameIds', () => {
  it('mở game thêm vào danh sách', () => {
    expect(nextFrameIds([], null, g2048)).toEqual(['2048'])
  })
  it('rời game không keepAlive về trang chủ thì bị bỏ', () => {
    expect(nextFrameIds(['2048'], g2048, null)).toEqual([])
  })
  it('keepAlive (xiangqi) vẫn được giữ khi về trang chủ', () => {
    expect(xq.keepAlive).toBe(true)
    expect(nextFrameIds(['xiangqi'], xq, null)).toEqual(['xiangqi'])
  })
  it('từ xiangqi sang 2048 giữ cả hai', () => {
    expect(nextFrameIds(['xiangqi'], xq, g2048)).toEqual(['xiangqi', '2048'])
  })
  it('chuyển từ 2048 sang xiangqi bỏ 2048', () => {
    expect(nextFrameIds(['2048'], g2048, xq)).toEqual(['xiangqi'])
  })
  it('không thêm trùng', () => {
    expect(nextFrameIds(['xiangqi', '2048'], xq, g2048)).toEqual(['xiangqi', '2048'])
  })
})
