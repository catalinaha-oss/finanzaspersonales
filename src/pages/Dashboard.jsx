import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCompact, monthLabel, getUpcomingAlerts } from '../lib/utils'

const DOT_COLORS = ['#f75f5f','#f7855f','#f7b44f','#4f8ef7','#2dd4a0','#a78bfa','#60c8f7','#f76fa0','#4ade80','#fbbf24','#8b93a8']

function getPctColor(pct) {
  if (pct > 100) return '#f75f5f'
  if (pct >= 80)  return '#f7b44f'
  if (pct >= 50)  return '#4f8ef7'
  return '#2dd4a0'
}

export default function Dashboard({ refresh }) {
  const { user }  = useAuth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts]   = useState([])
  const [filtro, setFiltro]   = useState('todos')

  // Estables — no cambian entre renders
  const now     = new Date()
  const anio    = now.getFullYear()
  const mes     = now.getMonth() + 1
  const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
  const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]

  async function load() {
    setLoading(true)

    // SOLUCIÓN: queries planas sin joins anidados (evita problemas RLS)
    const [
      { data: txData,    error: txErr   },
      { data: consData,  error: conErr  },
      { data: catsData,  error: catErr  },
    ] = await Promise.all([
      supabase.from('transacciones')
        .select('id, valor, tipo_movimiento, concepto_id, fecha')
        .eq('user_id', user.id)
        .gte('fecha', firstDay)
        .lte('fecha', lastDay),
      supabase.from('conceptos')
        .select('id, nombre, categoria_id, periodicidad, monto_presupuestado, fijo_variable, dia_pago, mes_ciclo, dia_vencimiento')
        .eq('user_id', user.id)
        .eq('activo', true),
      supabase.from('categorias')
        .select('id, nombre, tipo')
        .eq('user_id', user.id),
    ])

    if (txErr || conErr || catErr) {
      console.error('Error cargando dashboard:', txErr?.message, conErr?.message, catErr?.message)
      setLoading(false); return
    }

    // Mapas locales
    const catMap = {}
    for (const c of catsData || []) catMap[c.id] = c

    const conMap = {}
    for (const c of consData || []) conMap[c.id] = c

    // Totales del mes
    const ingresos = (txData || []).filter(t => t.tipo_movimiento === 'ingreso').reduce((s,t) => s + Number(t.valor), 0)
    const gastos   = (txData || []).filter(t => t.tipo_movimiento === 'gasto').reduce((s,t) => s + Number(t.valor), 0)
    const ahorro   = (txData || []).filter(t => t.tipo_movimiento === 'ahorro').reduce((s,t) => s + Number(t.valor), 0)

    // Presupuesto mensualizado por categoría (solo gastos)
    const presupuestoCat = {}
    for (const c of consData || []) {
      const cat = catMap[c.categoria_id]
      if (!cat || cat.tipo !== 'Gasto') continue
      const factor = { Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1
      presupuestoCat[cat.nombre] = (presupuestoCat[cat.nombre] || 0) + (Number(c.monto_presupuestado) || 0) * factor
    }

    // Real por categoría (solo gastos)
    const realCat = {}
    for (const t of txData || []) {
      if (t.tipo_movimiento !== 'gasto') continue
      const con = conMap[t.concepto_id]
      const cat = con ? catMap[con.categoria_id] : null
      const key = cat?.nombre || 'Sin categoría'
      realCat[key] = (realCat[key] || 0) + Number(t.valor)
    }

    // Combinar categorías
    const allCats = new Set([...Object.keys(presupuestoCat), ...Object.keys(realCat)])
    const catData = Array.from(allCats).map(nombre => {
      const presupuesto = presupuestoCat[nombre] || 0
      const real        = realCat[nombre] || 0
      const pct         = presupuesto > 0 ? (real / presupuesto) * 100 : null
      return { nombre, presupuesto, real, pct }
    }).sort((a, b) => {
      if (a.pct === null && b.pct === null) return 0
      if (a.pct === null) return 1
      if (b.pct === null) return -1
      return b.pct - a.pct
    })

    const presupuestoTotal = Object.values(presupuestoCat).reduce((s,v) => s + v, 0)
    const conPct      = catData.filter(c => c.pct !== null)
    const desbordados = conPct.filter(c => c.pct > 100).length
    const enRiesgo    = conPct.filter(c => c.pct >= 80 && c.pct <= 100).length
    const bien        = conPct.filter(c => c.pct < 80).length

    // Alertas usando los conceptos (sin join)
    const conceptosConCat = (consData || []).map(c => ({
      ...c,
      categorias: catMap[c.categoria_id] || null
    }))
    setAlerts(getUpcomingAlerts(conceptosConCat))
    setData({ ingresos, gastos, ahorro, flujo: ingresos - gastos - ahorro, catData, presupuestoTotal, desbordados, enRiesgo, bien })
    setLoading(false)
  }

  useEffect(() => { load() }, [refresh, user.id])

  if (loading) return (
    <div className="page">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10, borderRadius: 12 }} />)}
    </div>
  )
  if (!data) return null

  const { ingresos, gastos, ahorro, flujo, catData, presupuestoTotal, desbordados, enRiesgo, bien } = data
  const ejecutadoPct = presupuestoTotal > 0 ? Math.min((gastos / presupuestoTotal) * 100, 100) : 0

  const catFiltradas = filtro === 'desbordados' ? catData.filter(c => c.pct !== null && c.pct > 100)
    : filtro === 'riesgo' ? catData.filter(c => c.pct !== null && c.pct >= 80 && c.pct <= 100)
    : filtro === 'bien'   ? catData.filter(c => c.pct !== null && c.pct < 80)
    : catData

  return (
    <div className="page animate-in">
      <div className="page-header">
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: 2 }}>{monthLabel(anio, mes)}</p>
        <h1>Resumen financiero</h1>
      </div>

      {/* Flujo */}
      <div className="card" style={{ marginBottom: '0.75rem', background: flujo >= 0 ? 'rgba(45,212,160,0.08)' : 'rgba(247,95,95,0.08)', borderColor: flujo >= 0 ? 'rgba(45,212,160,0.2)' : 'rgba(247,95,95,0.2)' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Flujo del mes</p>
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: flujo >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(flujo)}
        </p>
        <p style={{ color: 'var(--text2)', fontSize: '0.8rem', marginTop: 4 }}>
          Ingresos: <strong style={{ color: 'var(--green)' }}>{formatCompact(ingresos)}</strong>
          {' · '}Gastos: <strong style={{ color: 'var(--red)' }}>{formatCompact(gastos)}</strong>
          {' · '}Ahorro: <strong style={{ color: 'var(--amber)' }}>{formatCompact(ahorro)}</strong>
        </p>
      </div>

      {/* Presupuesto total */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Total presupuesto mes</p>
          <span className={`badge ${ejecutadoPct > 100 ? 'badge-red' : ejecutadoPct > 80 ? 'badge-amber' : 'badge-green'}`}>
            {ejecutadoPct.toFixed(0)}%
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.min(ejecutadoPct,100)}%`, background: ejecutadoPct > 100 ? 'var(--red)' : ejecutadoPct > 80 ? 'var(--amber)' : 'var(--green)' }} />
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '0.78rem', marginTop: 6 }}>
          {formatCompact(gastos)} gastado de {formatCompact(presupuestoTotal)}
        </p>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem', borderColor: 'rgba(247,180,79,0.25)', background: 'rgba(247,180,79,0.06)' }}>
          <p style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--amber)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {alerts.length} pago{alerts.length > 1 ? 's' : ''} próximo{alerts.length > 1 ? 's' : ''}
          </p>
          {alerts.slice(0, 3).map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < Math.min(alerts.length,3)-1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: '0.85rem' }}>{a.concepto.nombre}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 600 }}>
                {a.dias === 0 ? 'Hoy' : a.dias === 1 ? 'Mañana' : `En ${a.dias} días`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Contadores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '0.75rem' }}>
        {[
          { label: 'Desbordados', val: desbordados, color: 'var(--red)',   border: 'rgba(247,95,95,0.2)',   key: 'desbordados' },
          { label: 'En riesgo',   val: enRiesgo,    color: 'var(--amber)', border: 'rgba(247,180,79,0.2)', key: 'riesgo'      },
          { label: 'Bien',        val: bien,         color: 'var(--green)', border: 'rgba(45,212,160,0.2)', key: 'bien'        },
        ].map(item => (
          <button key={item.key} onClick={() => setFiltro(filtro === item.key ? 'todos' : item.key)}
            style={{ background: filtro === item.key ? item.border : 'var(--bg2)', border: `1px solid ${item.border}`, borderRadius: 10, padding: '10px 6px', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '0.63rem', color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: item.color, fontFamily: 'var(--mono)' }}>{item.val}</div>
          </button>
        ))}
      </div>

      {/* Lista categorías */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {catFiltradas.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.875rem' }}>Sin categorías en este filtro</p>
        ) : catFiltradas.map((cat, i) => {
          const pct    = cat.pct ?? null
          const color  = pct !== null ? getPctColor(pct) : 'var(--text3)'
          const isOver = pct !== null && pct > 100
          const sinPres = pct === null
          return (
            <div key={cat.nombre} style={{ padding: '10px 14px', borderBottom: i < catFiltradas.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sinPres ? 0 : 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: DOT_COLORS[i % DOT_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nombre}</span>
                {sinPres ? (
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>Sin presupuesto</span>
                ) : (
                  <span className={`badge ${isOver ? 'badge-red' : pct >= 80 ? 'badge-amber' : pct >= 50 ? 'badge-blue' : 'badge-green'}`}>
                    {isOver ? `+${(pct-100).toFixed(0)}%` : `${pct.toFixed(0)}%`}
                  </span>
                )}
              </div>
              {!sinPres && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-fill" style={{ width: `${Math.min(pct,100)}%`, background: color }} />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text2)', fontFamily: 'var(--mono)', minWidth: 115, textAlign: 'right' }}>
                    {formatCompact(cat.real)} / {formatCompact(cat.presupuesto)}
                  </span>
                </div>
              )}
              {sinPres && cat.real > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text3)', paddingLeft: 15, marginTop: 3 }}>
                  Gastado: {formatCompact(cat.real)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
