import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, dateLabel, monthLabel } from '../lib/utils'

// BUG 1/3 FIX: sacar currentYearMonth fuera del componente para que sea estable
function getYearMonth() {
  const d = new Date()
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

export default function TransaccionesPage({ refresh }) {
  const { user } = useAuth()
  const [txs, setTxs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  // BUG 1/3 FIX: calcular una sola vez y guardar en ref para que no cambie entre renders
  const { anio, mes } = useRef(getYearMonth()).current

  const load = useCallback(async () => {
    setLoading(true)
    const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
    const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('transacciones')
      .select('*, conceptos(nombre, categorias(nombre))')
      .eq('user_id', user.id)
      .gte('fecha', firstDay)
      .lte('fecha', lastDay)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setTxs(data || [])
    setLoading(false)
  }, [user.id, anio, mes])

  // BUG 1/3 FIX: refresh como dependencia explícita fuerza re-ejecución
  useEffect(() => {
    load()
  }, [load, refresh])

  const filtered = txs.filter(t => {
    const matchTipo = filtro === 'todos' || t.tipo_movimiento === filtro
    const matchBusq = !busqueda ||
      (t.conceptos?.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.observaciones || '').toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchBusq
  })

  const totales = filtered.reduce((acc, t) => {
    if (t.tipo_movimiento === 'ingreso') acc.ingresos += Number(t.valor)
    else if (t.tipo_movimiento === 'gasto') acc.gastos += Number(t.valor)
    else if (t.tipo_movimiento === 'ahorro') acc.ahorro += Number(t.valor)
    return acc
  }, { ingresos: 0, gastos: 0, ahorro: 0 })

  async function deleteTx(id) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transacciones').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  const TIPO_COLORS = {
    ingreso: 'var(--green)', gasto: 'var(--red)',
    ahorro: 'var(--amber)', transferencia: 'var(--accent)'
  }
  const TIPO_LABELS = { ingreso: 'Ingreso', gasto: 'Gasto', ahorro: 'Ahorro', transferencia: 'Transfer.' }

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h1>Movimientos</h1>
        <p>{monthLabel(anio, mes)} · {txs.length} registros</p>
      </div>

      {/* Búsqueda */}
      <input className="input" type="search" placeholder="Buscar por concepto u observación..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        style={{ marginBottom: '0.75rem' }} />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem', overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { key: 'todos',   label: 'Todos'  },
          { key: 'gasto',   label: 'Gastos' },
          { key: 'ingreso', label: 'Ingresos' },
          { key: 'ahorro',  label: 'Ahorros' },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
              background: filtro === f.key ? 'var(--accent)' : 'var(--bg3)',
              color: filtro === f.key ? '#fff' : 'var(--text2)',
              transition: 'all 0.15s',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Resumen del filtro actual */}
      <div className="card card-sm" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>
            {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            {totales.ingresos > 0 && (
              <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 600 }}>
                +{formatCOP(totales.ingresos)}
              </span>
            )}
            {totales.gastos > 0 && (
              <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--red)', fontWeight: 600 }}>
                -{formatCOP(totales.gastos)}
              </span>
            )}
            {totales.ahorro > 0 && (
              <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--amber)', fontWeight: 600 }}>
                ↗{formatCOP(totales.ahorro)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        [1,2,3,4,5].map(i => (
          <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8, borderRadius: 10 }} />
        ))
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>📭</p>
          <p style={{ fontWeight: 500 }}>
            {txs.length === 0
              ? 'Sin movimientos este mes'
              : 'Sin movimientos que coincidan con el filtro'}
          </p>
          <p style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--text3)' }}>
            Usa el botón + para registrar uno
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Indicador tipo */}
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: TIPO_COLORS[t.tipo_movimiento] || 'var(--text3)'
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '0.9rem', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {t.conceptos?.nombre || t.observaciones || 'Sin concepto'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 1 }}>
                  {dateLabel(t.fecha)}
                  {t.conceptos?.categorias?.nombre && ` · ${t.conceptos.categorias.nombre}`}
                  {t.medio_pago && ` · ${t.medio_pago}`}
                </p>
              </div>

              {/* Valor + eliminar */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="mono" style={{
                  fontWeight: 600, fontSize: '0.9rem',
                  color: TIPO_COLORS[t.tipo_movimiento] || 'var(--text)'
                }}>
                  {t.tipo_movimiento === 'gasto' ? '-' : '+'}
                  {formatCOP(t.valor)}
                </p>
                <button onClick={() => deleteTx(t.id)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text3)',
                    cursor: 'pointer', fontSize: '0.7rem', padding: '2px 0',
                    lineHeight: 1,
                  }}>
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
