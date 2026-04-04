import { useNavigate, useLocation } from 'react-router-dom'

const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <path d={d} />
  </svg>
)

const ITEMS = [
  { path: '/',             label: 'Inicio',  d: 'M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9' },
  { path: '/transacciones',label: 'Movim.',  d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { path: null,            label: '',        fab: true },
  { path: '/metas',        label: 'Metas',   d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { path: '/config',       label: 'Config',  d: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
]

export default function BottomNav({ onAdd }) {
  const navigate     = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="bottom-nav">
      {ITEMS.map((item, i) =>
        item.fab ? (
          <button key={i} className="nav-item" onClick={onAdd} style={{ flex: 1 }}>
            <div className="nav-fab">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" style={{ width: 22, height: 22 }}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
          </button>
        ) : (
          <button key={i}
            className={`nav-item ${pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}>
            <Ico d={item.d} />
            {item.label}
          </button>
        )
      )}
    </nav>
  )
}
