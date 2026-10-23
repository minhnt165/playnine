// Thể loại game để lọc; giá trị là khóa DICT của nhãn.
export type Cat = 'puzzle' | 'versus' | 'arcade' | 'card' | 'brain'

export const CATS: Record<Cat, string> = {
  puzzle: 'cat.puzzle',
  versus: 'cat.versus',
  arcade: 'cat.arcade',
  card: 'cat.card',
  brain: 'cat.brain',
}
