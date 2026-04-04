import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, dateLabel, monthLabel } from '../lib/utils'
import MonthPicker from '../components/MonthPicker'

export default function TransaccionesPage({ refresh }) {
  const { user } = useAuth()
  const now = new Date()
  const [periodo, setPeriodo]   = useState({ anio: now.getFullYear(), mes: now.getMonth() + 1 })
  const [txs, setTxs]           = useState([])
  const [conceptoMap, setConceptoMap] = useState({})
  const [catMap, setCatMap]           = useState({})
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const { anio, mes } = periodo
  const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
  const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]

  async function load() {
    setLoading(true)
    const [{ data: txData, error: txErr }, { data: consData }, { data: catsData }] = await Promise.all([
      supabase.from('transacciones')
        .select('id, fecha, valor, tipo_movimiento, medio_pago, observaciones, concepto_id, created_at')
        .eq('user_id', user.id)
        .gte('fecha', firstDay)
        .lte('fecha', lastDay)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('conceptos').select('id, nombre, categoria_id').eq('user_id', user.id),
      supabase.from('categorias').select('id, nombre').eq('user_id', user.id),
    ])

    if (txErr) { console.error('Error:', txErr.message); setLoading(false); return }

    const cMap = {}
    for (const cat of catsData || []) cMap[cat.id] = cat.nombre
    const coMap = {}
    for (const con of consData || []) coMap[con.id] = { nombre: con.nombre, categoria: cMap[con.categoria_id] || '' }

    setTxs(txData || [])
    setConceptoMap(coMap)
    setCatMap(cMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [refresh, user.id, anio, mes])

  const filtered = txs.filter(t => {
    const matchTipo = filtro === 'todos' || t.tipo_movimiento === filtro
    const nombre    = conceptoMap[t.concepto_id]?.nombre || t.observaciones || ''
    const matchBusq = !busqueda || nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchBusq
  })

  const totales = filtered.reduce((acc, t) => {
    const v = Number(t.valor)
    if (t.tipo_movimiento === 'ingreso') acc.ingresos += v
    else if (t.tipo_movimiento === 'gasto') acc.gastos += v
    else if (t.tipo_movimiento === 'ahorro') acc.ahorro += v
    return acc
  }, { ingresos: 0, gastos: 0, ahorro: 0 })

  async function deleteTx(id) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transacciones').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  const TIPO_COLORS = { ingreso: 'var(--green)', gasto: 'var(--red)', ahorro: 'var(--amber)', transferencia: 'var(--accent)' }

  return (
    <div className="page animate-in">
      {/* Header con selector de mes */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>Movimientos</h1>
          <p style={{ color: 'var(--text2)', fontSize: '0.875rem', marginTop: 2 }}>{txs.length} registros</p>
        </div>
        <MonthPicker anio={anio} mes={mes} onChange={p => { setPeriodo(p); setBusqueda('') }} />
      </div>

      <input className="input" type="search" placeholder="Buscar movimiento..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        style={{ marginBottom: '0.75rem' }} />

      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem', overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { key: 'todos',   label: 'Todos'    },
          { key: 'gasto',   label: 'Gastos'   },
          { key: 'ingreso', label: 'Ingresos' },
          { key: 'ahorro',  label: 'Ahorros'  },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
              background: filtro === f.key ? 'var(--accent)' : 'var(--bg3)',
              color: filtro === f.key ? '#fff' : 'var(--text2)',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <div className="card card-sm" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>
            {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {totales.ingresos > 0 && <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 600 }}>+{formatCOP(totales.ingresos)}</span>}
            {totales.gastos   > 0 && <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--red)',   fontWeight: 600 }}>-{formatCOP(totales.gastos)}</span>}
            {totales.ahorro   > 0 && <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--amber)', fontWeight: 600 }}>↗{formatCOP(totales.ahorro)}</span>}
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        [1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8, borderRadius: 10 }} />)
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>📭</p>
          <p style={{ fontWeight: 500 }}>
            {txs.length === 0 ? `Sin movimientos en ${monthLabel(anio, mes)}` : 'Sin resultados para este filtro'}
          </p>
          <p style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--text3)' }}>Usa el botón + para registrar uno</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((t, i) => {
            const concepto = conceptoMap[t.concepto_id]
            const nombre   = concepto?.nombre || t.observaciones || 'Sin concepto'
            const catNom   = concepto?.categoria || ''
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: TIPO_COLORS[t.tipo_movimiento] || 'var(--text3)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 1 }}>
                    {dateLabel(t.fecha)}{catNom && ` · ${catNom}`}{t.medio_pago && ` · ${t.medio_pago}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="mono" style={{ fontWeight: 600, fontSize: '0.9rem', color: TIPO_COLORS[t.tipo_movimiento] || 'var(--text)' }}>
                    {t.tipo_movimiento === 'gasto' ? '-' : '+'}{formatCOP(t.valor)}
                  </p>
                  <button onClick={() => deleteTx(t.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 0' }}>
                    eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
