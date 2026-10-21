import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderLite } from './markdown'

const html = (text: string) => render(<div>{renderLite(text)}</div>).container.firstElementChild!.innerHTML

describe('renderLite', () => {
  it('tiêu đề, đoạn, danh sách và chữ đậm', () => {
    const out = html('## Mẹo\nĐoạn một\ndòng hai\n\n- **A** trước\n- B\n### Nhỏ')
    expect(out).toBe('<h2>Mẹo</h2><p>Đoạn một dòng hai</p><ul><li><strong>A</strong> trước</li><li>B</li></ul><h3>Nhỏ</h3>')
  })

  it('HTML trong nội dung hiện dạng chữ, không dựng phần tử', () => {
    const out = html('<img src=x onerror=alert(1)>')
    expect(out).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  })

  it('chuỗi rỗng không ra gì', () => {
    expect(renderLite('  \n\n')).toEqual([])
  })
})
