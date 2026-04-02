import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, formatCompact } from '../lib/utils'

export default function MetasPage() {
  const { user } = useAuth()
  const [metas, setMetas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [newVal, setNewVal]   = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('metas').select('*')
      .eq('user_id', user.id).eq('activo', true).order('nombre')
    setMetas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  async function updateValor(id) {
    const v = parseFloat(newVal.replace(/\./g,'').replace(',','.'))
    if (isNaN(v)) return
    await supabase.from('metas').update({ valor_actual: v, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    setEditing(null); setNewVal(''); load()
  }

  const COLORS = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--amber)']

  const totalMeta   = metas.reduce((s, m) => s + Number(m.valor_meta), 0)
  const totalActual = metas.reduce((s, m) => s + Number(m.valor_actual), 0)
  const totalPct    = totalMeta > 0 ? (totalActual / totalMeta) * 100 : 0

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h1>Metas financieras</h1>
        <p>Progreso hacia tu libertad financiera</p>
      </div>

      {/* Resumen global */}
      <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Capital acumulado total</p>
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--green)' }}>
          {formatCompact(totalActual)}
        </p>
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginTop: 4 }}>
          Meta total: {formatCompact(totalMeta)} · {totalPct.toFixed(1)}% completado
        </p>
        <div className="progress-bar" style={{ marginTop: 12 }}>
          <div className="progress-fill" style={{ width: `${Math.min(totalPct, 100)}%`, background: 'var(--green)' }} />
        </div>
      </div>

      {/* Metas individuales */}
      {loading ? (
        [1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 130, marginBottom: 12, borderRadius: 12 }} />)
      ) : metas.map((m, idx) => {
        const pct = m.valor_meta > 0 ? Math.min((m.valor_actual / m.valor_meta) * 100, 100) : 0
        const faltante = Math.max(Number(m.valor_meta) - Number(m.valor_actual), 0)
        const color = COLORS[idx % COLORS.length]

        return (
          <div key={m.id} className="card" style={{ marginBottom: '0.75rem', borderLeft: `3px solid ${color}` }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
              <h3>{m.nombre}</h3>
              <span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 50 ? 'badge-blue' : 'badge-amber'}`}>
                {pct.toFixed(1)}%
              </span>
            </div>

            <div className="progress-bar" style={{ marginBottom: 10 }}>
              <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
            </div>

            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 2 }}>Acumulado</p>
                <p className="mono" style={{ fontWeight: 600, color }}>{formatCompact(m.valor_actual)}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 2 }}>Meta</p>
                <p className="mono" style={{ fontWeight: 600 }}>{formatCompact(m.valor_meta)}</p>
              </div>
            </div>

            {faltante > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 10 }}>
                Falta: <strong style={{ color: 'var(--text)' }}>{formatCompact(faltante)}</strong>
              </p>
            )}

            {editing === m.id ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="number" placeholder="Nuevo valor actual"
                  value={newVal} onChange={e => setNewVal(e.target.value)}
                  style={{ fontFamily: 'var(--mono)' }} />
                <button className="btn btn-primary btn-sm" onClick={() => updateValor(m.id)}>Guardar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>×</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(m.id); setNewVal(String(m.valor_actual)) }}>
                Actualizar valor
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
