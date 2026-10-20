import { Home } from './home/Home'

// Khung tạm: Task 7 thay bằng router (#/play/<id>) và truyền openIds/refreshKey thật.
const NO_OPEN = new Set<string>()

export function App() {
  return <Home openIds={NO_OPEN} refreshKey={0} />
}