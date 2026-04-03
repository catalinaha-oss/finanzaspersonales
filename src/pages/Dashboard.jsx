import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, formatCompact, currentYearMonth, monthLabel, getUpcomingAlerts } from '../lib/utils'

const CAT_COLORS = ['#f75f5f','#f7855f','#f7b44f','#4f8ef7','#2dd4a0','#a78bfa','#60c8f7','#f76fa0','#4ade80','#fbbf24','#8b93a8']

function getPctColor(pct) {
  if (pct > 100) return '#f75f5f'
  if (pct >= 80)  return '#f7b44f'
  if (pct >= 50)  return '#4f8ef7'
  return '#2dd4a0'
}

export default function Dashboard({ refresh }) {
  const { user } = useAuth()
  const { anio, mes } = currentYearMonth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts]   = useState([])
  const [filtro, setFiltro]   = useState('todos')

  const load = useCallback(async () => {
    setLoading(true)
    const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
    const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]

    const [{ data: txs }, { data: conceptos }] = await Promise.all([
      supabase.from('transacciones')
        .select('*, conceptos(nombre, categorias(nombre,tipo))')
        .eq('user_id', user.id).gte('fecha', firstDay).lte('fecha', lastDay),
      supabase.from('conceptos')
        .select('*, categorias(nombre,tipo)')
        .eq('user_id', user.id).eq('activo', true),
    ])

    // Totales del mes
    const ingresos = txs?.filter(t => t.tipo_movimiento === 'ingreso').reduce((s,t) => s + Number(t.valor), 0) || 0
    const gastos   = txs?.filter(t => t.tipo_movimiento === 'gasto').reduce((s,t) => s + Number(t.valor), 0) || 0
    const ahorro   = txs?.filter(t => t.tipo_movimiento === 'ahorro').reduce((s,t) => s + Number(t.valor), 0) || 0

    // Presupuesto por categoría
    const presupuestoCat = {}
    for (const c of conceptos || []) {
      if (c.categorias?.tipo !== 'Gasto') continue
      const cat = c.categorias?.nombre || 'Sin categoría'
      const factor = { Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1
      presupuestoCat[cat] = (presupuestoCat[cat] || 0) + (Number(c.monto_presupuestado) || 0) * factor
    }

    // Real por categoría
    const realCat = {}
    for (const t of txs || []) {
      if (t.tipo_movimiento !== 'gasto') continue
      const cat = t.conceptos?.categorias?.nombre || 'Sin categoría'
      realCat[cat] = (realCat[cat] || 0) + Number(t.valor)
    }

    // Combinar y calcular %
    const allCats = new Set([...Object.keys(presupuestoCat), ...Object.keys(realCat)])
    const catData = Array.from(allCats).map(nombre => {
      const presupuesto = presupuestoCat[nombre] || 0
      const real        = realCat[nombre] || 0
      const pct         = presupuesto > 0 ? (real / presupuesto) * 100 : null
      return { nombre, presupuesto, real, pct }
    }).sort((a, b) => {
      const pa = a.pct ?? -1
      const pb = b.pct ?? -1
      return pb - pa
    })

    const presupuestoTotal = Object.values(presupuestoCat).reduce((s,v) => s + v, 0)
    const desbordados = catData.filter(c => c.pct !== null && c.pct > 100).length
    const enRiesgo    = catData.filter(c => c.pct !== null && c.pct >= 80 && c.pct <= 100).length
    const bien        = catData.filter(c => c.pct !== null && c.pct < 80).length

    const alerts = getUpcomingAlerts(conceptos || [])
    setAlerts(alerts)
    setData({ ingresos, gastos, ahorro, flujo: ingresos - gastos - ahorro, catData, presupuestoTotal, desbordados, enRiesgo, bien })
    setLoading(false)
  }, [user.id, anio, mes])

  useEffect(() => { load() }, [load, refresh])

  if (loading) return (
    <div className="page">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10, borderRadius: 12 }} />)}
    </div>
  )

  const { ingresos, gastos, ahorro, flujo, catData, presupuestoTotal, desbordados, enRiesgo, bien } = data
  const ejecutadoPct = presupuestoTotal > 0 ? Math.min((gastos / presupuestoTotal) * 100, 100) : 0

  const catFiltradas = filtro === 'desbordados' ? catData.filter(c => c.pct > 100)
    : filtro === 'riesgo' ? catData.filter(c => c.pct >= 80 && c.pct <= 100)
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
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: flujo >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>{formatCOP(flujo)}</p>
        <p style={{ color: 'var(--text2)', fontSize: '0.8rem', marginTop: 4 }}>
          Ingresos: <strong style={{ color: 'var(--green)' }}>{formatCompact(ingresos)}</strong>
          {' · '}Gastos: <strong style={{ color: 'var(--red)' }}>{formatCompact(gastos)}</strong>
          {' · '}Ahorro: <strong style={{ color: 'var(--amber)' }}>{formatCompact(ahorro)}</strong>
        </p>
      </div>

      {/* Barra total presupuesto */}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
            {alerts.length} pago{alerts.length > 1 ? 's' : ''} próximo{alerts.length > 1 ? 's' : ''}
          </p>
          {alerts.slice(0, 3).map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < Math.min(alerts.length,3)-1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: '0.85rem' }}>{a.concepto.nombre}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 600 }}>{a.dias === 0 ? 'Hoy' : a.dias === 1 ? 'Mañana' : `En ${a.dias} días`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contadores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '0.75rem' }}>
        {[
          { label: 'Desbordados', val: desbordados, color: 'var(--red)',   border: 'rgba(247,95,95,0.2)',   filtro: 'desbordados' },
          { label: 'En riesgo',   val: enRiesgo,    color: 'var(--amber)', border: 'rgba(247,180,79,0.2)', filtro: 'riesgo' },
          { label: 'Bien',        val: bien,         color: 'var(--green)', border: 'rgba(45,212,160,0.2)', filtro: 'bien' },
        ].map(item => (
          <button key={item.filtro} onClick={() => setFiltro(filtro === item.filtro ? 'todos' : item.filtro)}
            style={{ background: filtro === item.filtro ? `${item.border}` : 'var(--bg2)', border: `1px solid ${item.border}`, borderRadius: 10, padding: '10px 6px', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: item.color, fontFamily: 'var(--mono)' }}>{item.val}</div>
          </button>
        ))}
      </div>

      {/* Lista por categoría */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {catFiltradas.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.875rem' }}>Sin categorías en este filtro</p>
        ) : catFiltradas.map((cat, i) => {
          const pct   = cat.pct ?? 0
          const color = getPctColor(pct)
          const dotColor = CAT_COLORS[i % CAT_COLORS.length]
          const isOver = pct > 100
          return (
            <div key={cat.nombre} style={{ padding: '10px 14px', borderBottom: i < catFiltradas.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nombre}</span>
                <span className={`badge ${isOver ? 'badge-red' : pct >= 80 ? 'badge-amber' : pct >= 50 ? 'badge-blue' : 'badge-green'}`}>
                  {isOver ? `+${(pct-100).toFixed(0)}%` : `${pct.toFixed(0)}%`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(pct,100)}%`, background: color }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text2)', fontFamily: 'var(--mono)', minWidth: 100, textAlign: 'right' }}>
                  {formatCompact(cat.real)}{cat.presupuesto > 0 ? ` / ${formatCompact(cat.presupuesto)}` : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
