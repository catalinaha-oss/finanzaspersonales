import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, dateLabel, monthLabel } from '../lib/utils'
import MonthPicker from '../components/MonthPicker'
import TransactionModal from '../components/TransactionModal'

// ── Drawer de detalle ──────────────────────────────────────────────────────────
function DetalleDrawer({ tx, conceptoMap, catMap, onClose, onEditar, onEliminar }) {
  if (!tx) return null

  const concepto  = conceptoMap[tx.concepto_id]
  const nombre    = concepto?.nombre || tx.observaciones || 'Sin concepto'
  const catNom    = concepto?.categoria || '—'
  const TIPO_COLORS = {
    ingreso: 'var(--green)', gasto: 'var(--red)',
    ahorro:  'var(--amber)', transferencia: 'var(--accent)',
  }
  const color = TIPO_COLORS[tx.tipo_movimiento] || 'var(--text3)'
  const signo = tx.tipo_movimiento === 'gasto' ? '-' : '+'

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, backdropFilter: 'blur(4px)',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem 1.25rem',
        width: '100%', maxWidth: 500,
        maxHeight: '80dvh', overflowY: 'auto',
        animation: 'slideUp 0.25s ease',
      }}>
        {/* Sin modal-handle — es un card centrado, no un bottom sheet */}

        {/* Encabezado con color según tipo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontSize: '1.15rem', flex: 1, lineHeight: 1.3 }}>{nombre}</h2>
        </div>

        {/* Valor grande */}
        <div style={{ textAlign: 'center', padding: '1rem 0 1.25rem' }}>
          <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, color }}>
            {signo}{formatCOP(tx.valor)}
          </p>
          <span style={{
            display: 'inline-block', marginTop: 6, padding: '3px 10px',
            borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
            background: color + '22', color,
          }}>
            {tx.tipo_movimiento.charAt(0).toUpperCase() + tx.tipo_movimiento.slice(1)}
          </span>
        </div>

        {/* Tabla de campos */}
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
          {[
            { label: 'Fecha',        value: dateLabel(tx.fecha) },
            { label: 'Categoría',    value: catNom },
            { label: 'Medio de pago', value: tx.medio_pago || '—' },
            { label: 'Observaciones', value: tx.observaciones || '—' },
          ].map((row, i, arr) => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.7rem 1rem',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              background: i % 2 === 0 ? 'var(--bg2)' : 'var(--bg3)',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text2)', fontWeight: 500 }}>{row.label}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text)', textAlign: 'right', maxWidth: '60%' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ flex: 1, justifyContent: 'center' }}>Cerrar</button>
          <button className="btn btn-ghost" onClick={onEditar}
            style={{ flex: 1, justifyContent: 'center', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            ✏️ Editar
          </button>
          <button className="btn btn-danger btn-sm" onClick={onEliminar}
            style={{ flexShrink: 0, justifyContent: 'center', padding: '0.6rem 1rem' }}>
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function TransaccionesPage({ refresh }) {
  const { user } = useAuth()
  const now = new Date()

  // ─ Estado ─
  const [periodo,     setPeriodo]     = useState({ anio: now.getFullYear(), mes: now.getMonth() + 1 })
  const [txs,         setTxs]         = useState([])
  const [conceptoMap, setConceptoMap] = useState({})
  const [catMap,      setCatMap]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filtro,      setFiltro]      = useState('todos')
  const [busqueda,    setBusqueda]    = useState('')

  // Detalle + edición
  const [detalle,     setDetalle]     = useState(null)   // tx seleccionada para ver detalle
  const [editando,    setEditando]    = useState(null)   // tx a editar en el modal

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
        .order('fecha',      { ascending: false })
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
    else if (t.tipo_movimiento === 'gasto')  acc.gastos  += v
    else if (t.tipo_movimiento === 'ahorro') acc.ahorro  += v
    return acc
  }, { ingresos: 0, gastos: 0, ahorro: 0 })

  async function deleteTx(id) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transacciones').delete().eq('id', id).eq('user_id', user.id)
    setDetalle(null)
    load()
  }

  function abrirEdicion(tx) {
    setDetalle(null)         // cerrar drawer de detalle
    setEditando(tx)          // abrir modal de edición
  }

  function cerrarEdicion() { setEditando(null) }

  function handleSaved() {
    setEditando(null)
    load()
  }

  const TIPO_COLORS = {
    ingreso: 'var(--green)', gasto: 'var(--red)',
    ahorro: 'var(--amber)', transferencia: 'var(--accent)',
  }

  return (
    <div className="page animate-in">
      {/* Header */}
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

      {/* Filtros */}
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
              <div
                key={t.id}
                onClick={() => setDetalle(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
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
                  {/* Indicador visual de que es tappable */}
                  <span style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 2, display: 'block' }}>›</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Drawer de detalle */}
      {detalle && (
        <DetalleDrawer
          tx={detalle}
          conceptoMap={conceptoMap}
          catMap={catMap}
          onClose={() => setDetalle(null)}
          onEditar={() => abrirEdicion(detalle)}
          onEliminar={() => deleteTx(detalle.id)}
        />
      )}

      {/* Modal de edición — se monta localmente, no en App.jsx */}
      {editando && (
        <TransactionModal
          editData={editando}
          onClose={cerrarEdicion}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
