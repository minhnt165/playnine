import { CATS, GAMES, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'

export type FilterKey = 'all' | keyof typeof CATS

type Props = { filter: FilterKey; onChange: (k: FilterKey) => void; /** Danh sách đã lọc game ẩn để đếm. */ games?: GameDef[] }

export function Filters({ filter, onChange, games = GAMES }: Props) {
  const { t } = useI18n()
  // Thể loại chưa có game thì ẩn nút (trừ khi đang được chọn, để còn bấm "Tất cả" quay ra).
  const cats = (Object.entries(CATS) as [FilterKey, string][]).filter(([key]) => key === filter || games.some((g) => g.cat === key))
  const entries: [FilterKey, string][] = [['all', 'cat.all'], ...cats]
  return (
    <div className="filters" id="filters" aria-label={t('games.filter')}>
      {entries.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => onChange(key)}>
          {t(label)}
          <b>{key === 'all' ? games.length : games.filter((g) => g.cat === key).length}</b>
        </button>
      ))}
    </div>
  )
}