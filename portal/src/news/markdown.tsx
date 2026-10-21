import type { ReactNode } from 'react'

/** `**đậm**` trong một dòng; phần còn lại là chữ thường (text node, không thể chèn phần tử). */
function inline(s: string, key: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={key + '-' + i}>{part.slice(2, -2)}</strong> : part,
  )
}

/**
 * Markdown nhẹ cho bài tin: `## ` và `### ` là tiêu đề, các dòng liền nhau bắt đầu bằng `- ` là danh sách,
 * dòng trống ngắt đoạn, `**đậm**` trong dòng. Dựng phần tử React (không innerHTML) vì nội dung do admin nhập.
 */
export function renderLite(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let para: string[] = []
  let list: string[] = []
  const flush = () => {
    if (para.length) out.push(<p key={'p' + out.length}>{inline(para.join(' '), 'p' + out.length)}</p>)
    if (list.length)
      out.push(
        <ul key={'u' + out.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l, 'u' + out.length + '-' + i)}</li>
          ))}
        </ul>,
      )
    para = []
    list = []
  }
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const heading = line.match(/^(#{2,3})\s+(.+)$/)
    const item = line.match(/^[-*]\s+(.+)$/)
    if (line === '') flush()
    else if (heading) {
      flush()
      const k = 'h' + out.length
      out.push(heading[1].length === 2 ? <h2 key={k}>{inline(heading[2], k)}</h2> : <h3 key={k}>{inline(heading[2], k)}</h3>)
    } else if (item) {
      if (para.length) flush()
      list.push(item[1])
    } else {
      if (list.length) flush()
      para.push(line)
    }
  }
  flush()
  return out
}
