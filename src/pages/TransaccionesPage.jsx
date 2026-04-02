import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, dateLabel, currentYearMonth, monthLabel } from '../lib/utils'

export default function TransaccionesPage({ refresh }) {
  const { user } = useAuth()
  const [txs, setTxs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const { anio, mes }           = currentYearMonth()

  const load = useCallback(async () => {
    setLoading(true)
    const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
    const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]
    const { data } = await supabase
      .from('transacciones')
      .select('*, conceptos(nombre, categorias(nombre))')
      .eq('user_id', user.id)
      .gte('fecha', firstDay).lte('fecha', lastDay)
      .order('fecha', { ascending: false })
    setTxs(data || [])
    setLoading(false)
  }, [user.id, anio, mes])

  useEffect(() => { load() }, [load, refresh])

  const filtered = txs.filter(t => {
    const matchTipo = filtro === 'todos' || t.tipo_movimiento === filtro
    const matchBusq = !busqueda || (t.conceptos?.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || (t.observaciones || '').toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchBusq
  })

  const total = filtered.reduce((s, t) => {
    return t.tipo_movimiento === 'ingreso' ? s + Number(t.valor) : s - Number(t.valor)
  }, 0)

  async function deleteTx(id) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transacciones').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  const TIPO_COLORS = { ingreso: 'var(--green)', gasto: 'var(--red)', ahorro: 'var(--amber)', transferencia: 'var(--accent)' }

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h1>Movimientos</h1>
        <p>{monthLabel(anio, mes)} · {txs.length} registros</p>
      </div>

      {/* Búsqueda */}
      <input className="input" type="search" placeholder="Buscar movimiento..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        style={{ marginBottom: '0.75rem' }} />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', overflowX: 'auto', paddingBottom: 2 }}>
        {['todos','gasto','ingreso','ahorro'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
              textTransform: 'capitalize',
              background: filtro === f ? 'var(--accent)' : 'var(--bg3)',
              color: filtro === f ? '#fff' : 'var(--text2)'
            }}>
            {f === 'todos' ? 'Todos' : f}
          </button>
        ))}
      </div>

      {/* Balance filtrado */}
      <div className="card card-sm" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
          {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="mono" style={{ fontWeight: 600, color: total >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {total >= 0 ? '+' : ''}{formatCOP(total)}
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        [1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8, borderRadius: 10 }} />)
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📭</p>
          <p>Sin movimientos {busqueda ? 'que coincidan' : 'este mes'}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: TIPO_COLORS[t.tipo_movimiento] || 'var(--text3)' }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.conceptos?.nombre || t.observaciones || 'Sin concepto'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                  {dateLabel(t.fecha)}
                  {t.conceptos?.categorias?.nombre && ` · ${t.conceptos.categorias.nombre}`}
                  {t.medio_pago && ` · ${t.medio_pago}`}
                </p>
              </div>

              {/* Valor */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="mono" style={{
                  fontWeight: 600, fontSize: '0.9rem',
                  color: TIPO_COLORS[t.tipo_movimiento] || 'var(--text)'
                }}>
                  {t.tipo_movimiento === 'gasto' ? '-' : '+'}{formatCOP(t.valor)}
                </p>
                <button onClick={() => deleteTx(t.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 0' }}>
                  eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
