import type { ReactNode } from 'react'

/** Một ô của form admin: nhãn bọc quanh ô nhập; dòng gợi ý nằm ngoài nhãn để không lẫn vào tên của ô. */
export function AdminField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="admin-field-cell">
      <label className="admin-field">
        <span>{label}</span>
        {children}
      </label>
      {hint && <span className="admin-hint">{hint}</span>}
    </div>
  )
}
