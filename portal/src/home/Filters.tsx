import { CATS, GAMES } from '../games/catalog'
import { useI18n } from '../i18n/i18n'

export type FilterKey = 'all' | keyof typeof CATS

export function Filters({ filter, onChange }: { filter: FilterKey; onChange: (k: FilterKey) => void }) {
  const { t } = useI18n()
  const entries: [FilterKey, string][] = [['all', 'cat.all'], ...(Object.entries(CATS) as [FilterKey, string][])]
  return (
    <div className="filters" id="filters" aria-label={t('games.filter')}>
      {entries.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => onChange(key)}>
          {t(label)}
          <b>{key === 'all' ? GAMES.length : GAMES.filter((g) => g.cat === key).length}</b>
        </button>
      ))}
    </div>
  )
}