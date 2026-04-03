import { useNavigate, useLocation } from 'react-router-dom'

const Icon = ({ path, ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={path} />
  </svg>
)

export default function BottomNav({ onAdd }) {
  const navigate     = useNavigate()
  const { pathname } = useLocation()

  const items = [
    { path: '/',             label: 'Inicio',     icon: 'M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9' },
    { path: '/transacciones',label: 'Movimientos',icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { path: null,            label: '',           icon: null, fab: true },
    { path: '/metas',        label: 'Metas',      icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
    { path: '/config',       label: 'Config',     icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
  ]

  return (
    <nav className="bottom-nav">
      {items.map((item, i) =>
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
            <Icon path={item.icon} style={{ width: 22, height: 22 }} />
            {item.label}
          </button>
        )
      )}
    </nav>
  )
}
