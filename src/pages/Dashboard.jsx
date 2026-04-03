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

export default function Dashboard({ refresh, onRegistrarPago }) {
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
      { data: metasData },
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
      supabase.from('metas')
        .select('id, nombre, valor_actual')
        .eq('user_id', user.id)
        .eq('activo', true),
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
    const ingresos       = (txData || []).filter(t => t.tipo_movimiento === 'ingreso').reduce((s,t) => s + Number(t.valor), 0)
    const gastos         = (txData || []).filter(t => t.tipo_movimiento === 'gasto').reduce((s,t) => s + Number(t.valor), 0)
    const ahorroMes      = (txData || []).filter(t => t.tipo_movimiento === 'ahorro').reduce((s,t) => s + Number(t.valor), 0)
    const ahorroAcumulado = (metasData || []).reduce((s,m) => s + Number(m.valor_actual), 0)

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

    // Set de concepto_id que ya tienen movimiento registrado este mes
    const conceptosPagados = new Set(
      (txData || [])
        .filter(t => t.concepto_id && t.tipo_movimiento === 'gasto')
        .map(t => t.concepto_id)
    )

    // Alertas: próximos Y vencidos sin pago registrado
    const conceptosConCat = (consData || []).map(c => ({
      ...c,
      categorias: catMap[c.categoria_id] || null
    }))
    setAlerts(getUpcomingAlerts(conceptosConCat, conceptosPagados))
    setData({ ingresos, gastos, ahorroMes, ahorroAcumulado, flujo: ingresos - gastos, catData, presupuestoTotal, desbordados, enRiesgo, bien })
    setLoading(false)
  }

  useEffect(() => { load() }, [refresh, user.id])

  if (loading) return (
    <div className="page">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10, borderRadius: 12 }} />)}
    </div>
  )
  if (!data) return null

  const { ingresos, gastos, ahorroMes, ahorroAcumulado, flujo, catData, presupuestoTotal, desbordados, enRiesgo, bien } = data
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

      {/* Flujo — solo ingresos menos gastos */}
      <div className="card" style={{ marginBottom: '0.75rem', background: flujo >= 0 ? 'rgba(45,212,160,0.06)' : 'rgba(247,95,95,0.08)', borderColor: flujo >= 0 ? 'rgba(45,212,160,0.2)' : 'rgba(247,95,95,0.2)' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Flujo del mes</p>
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: flujo >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em', marginBottom: 10 }}>
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(flujo)}
        </p>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 2 }}>Ingresos</p>
            <p className="mono" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--green)' }}>+{formatCompact(ingresos)}</p>
          </div>
          <span style={{ color: 'var(--text3)', fontSize: '1rem' }}>−</span>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 2 }}>Gastos</p>
            <p className="mono" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--red)' }}>{formatCompact(gastos)}</p>
          </div>
        </div>
      </div>

      {/* Ahorro — acumulado + aporte del mes */}
      <div className="card" style={{ marginBottom: '0.75rem', background: 'rgba(247,180,79,0.05)', borderColor: 'rgba(247,180,79,0.2)' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Ahorro</p>
        <p className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--amber)', letterSpacing: '-0.02em', marginBottom: 2 }}>
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(ahorroAcumulado)}
        </p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 10 }}>Total acumulado en metas</p>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>Aportado este mes</p>
          <p className="mono" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--amber)' }}>+{formatCompact(ahorroMes)}</p>
        </div>
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
      {alerts.length > 0 && (() => {
        const vencidos  = alerts.filter(a => a.vencido)
        const proximos  = alerts.filter(a => !a.vencido)
        const total     = alerts.length
        const hayVencidos = vencidos.length > 0

        const AlertRow = ({ a, i, last }) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 0',
            borderBottom: !last ? '1px solid var(--border)' : 'none'
          }}>
            {/* Indicador vencido */}
            {a.vencido && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.concepto.nombre}
              </p>
              <p style={{ fontSize: '0.72rem', marginTop: 1, color: a.vencido ? 'var(--red)' : 'var(--text2)' }}>
                {a.vencido
                  ? `Venció hace ${Math.abs(a.dias)} día${Math.abs(a.dias) !== 1 ? 's' : ''}`
                  : a.dias === 0 ? 'Hoy'
                  : a.dias === 1 ? 'Mañana'
                  : `En ${a.dias} días`}
                {a.concepto.monto_presupuestado
                  ? ` · $${Number(a.concepto.monto_presupuestado).toLocaleString('es-CO')}`
                  : ''}
              </p>
            </div>
            <button
              onClick={() => onRegistrarPago?.({
                tipo_movimiento: 'gasto',
                concepto_id: a.concepto.id,
                categoria_id: a.concepto.categoria_id,
                monto_presupuestado: a.concepto.monto_presupuestado,
                nombre: a.concepto.nombre,
              })}
              style={{
                flexShrink: 0, padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${a.vencido ? 'rgba(247,95,95,0.4)' : 'rgba(247,180,79,0.4)'}`,
                background: a.vencido ? 'rgba(247,95,95,0.1)' : 'rgba(247,180,79,0.1)',
                color: a.vencido ? 'var(--red)' : 'var(--amber)',
                fontFamily: 'var(--font)', fontSize: '0.75rem', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              Registrar ›
            </button>
          </div>
        )

        return (
          <div className="card" style={{ marginBottom: '0.75rem', borderColor: hayVencidos ? 'rgba(247,95,95,0.25)' : 'rgba(247,180,79,0.25)', background: hayVencidos ? 'rgba(247,95,95,0.04)' : 'rgba(247,180,79,0.04)' }}>
            <p style={{ fontWeight: 600, fontSize: '0.82rem', color: hayVencidos ? 'var(--red)' : 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              Pagos próximos y/o pendientes
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: hayVencidos ? 'rgba(247,95,95,0.15)' : 'rgba(247,180,79,0.15)' }}>
                {total}
              </span>
            </p>

            {/* Vencidos primero */}
            {vencidos.map((a, i) => (
              <AlertRow key={`v-${i}`} a={a} i={i} last={i === vencidos.length - 1 && proximos.length === 0} />
            ))}

            {/* Separador si hay ambos */}
            {vencidos.length > 0 && proximos.length > 0 && (
              <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', padding: '6px 0 4px' }}>
                Próximos
              </p>
            )}

            {/* Próximos */}
            {proximos.map((a, i) => (
              <AlertRow key={`p-${i}`} a={a} i={i} last={i === proximos.length - 1} />
            ))}
          </div>
        )
      })()}

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
