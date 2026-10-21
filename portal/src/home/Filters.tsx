import { CATS, GAMES, type GameDef } from '../games/catalog'
import { useI18n } from '../i18n/i18n'

export type FilterKey = 'all' | keyof typeof CATS

type Props = { filter: FilterKey; onChange: (k: FilterKey) => void; /** Danh sách đã lọc game ẩn để đếm. */ games?: GameDef[] }

export function Filters({ filter, onChange, games = GAMES }: Props) {
  const { t } = useI18n()
  const entries: [FilterKey, string][] = [['all', 'cat.all'], ...(Object.entries(CATS) as [FilterKey, string][])]
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