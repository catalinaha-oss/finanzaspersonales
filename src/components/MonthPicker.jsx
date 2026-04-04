import { useRef } from 'react'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// anio, mes (1-12), onChange({ anio, mes })
export default function MonthPicker({ anio, mes, onChange }) {
  const now = new Date()

  function prev() {
    if (mes === 1) onChange({ anio: anio - 1, mes: 12 })
    else           onChange({ anio, mes: mes - 1 })
  }

  function next() {
    // No permitir ir más allá del mes actual
    if (anio === now.getFullYear() && mes === now.getMonth() + 1) return
    if (mes === 12) onChange({ anio: anio + 1, mes: 1 })
    else            onChange({ anio, mes: mes + 1 })
  }

  const isCurrentMonth = anio === now.getFullYear() && mes === now.getMonth() + 1

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={prev}
        style={{
          background: 'var(--bg3)', border: '1px solid var(--border2)',
          borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
          color: 'var(--text2)', fontSize: '1rem', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
        ‹
      </button>

      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '4px 12px', minWidth: 90, textAlign: 'center',
        fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)',
        userSelect: 'none',
      }}>
        {MESES[mes - 1]} {anio}
      </div>

      <button onClick={next}
        disabled={isCurrentMonth}
        style={{
          background: 'var(--bg3)', border: '1px solid var(--border2)',
          borderRadius: 8, width: 32, height: 32, cursor: isCurrentMonth ? 'default' : 'pointer',
          color: isCurrentMonth ? 'var(--text3)' : 'var(--text2)', fontSize: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          opacity: isCurrentMonth ? 0.4 : 1,
        }}>
        ›
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => onChange({ anio: now.getFullYear(), mes: now.getMonth() + 1 })}
          style={{
            background: 'none', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
            color: 'var(--accent)', fontFamily: 'var(--font)',
            fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
          Hoy
        </button>
      )}
    </div>
  )
}
