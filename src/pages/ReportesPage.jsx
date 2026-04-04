import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCompact, monthLabel } from '../lib/utils'
import MonthPicker from '../components/MonthPicker'

// ── Helpers ──────────────────────────────────────────────────
const COP = v => v == null ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
const K   = v => formatCompact(v)

function getDiff(presupuesto, ejecutado) {
  return ejecutado - presupuesto
}
function getPct(presupuesto, ejecutado) {
  if (!presupuesto) return null
  return (ejecutado / presupuesto) * 100
}
function badgeStyle(pct, tipo = 'gasto') {
  if (tipo === 'ingreso') {
    if (pct >= 100) return { bg: 'rgba(45,212,160,0.12)', color: 'var(--green)' }
    if (pct >= 80)  return { bg: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }
    return { bg: 'rgba(247,95,95,0.12)', color: 'var(--red)' }
  }
  if (tipo === 'ahorro') {
    if (pct >= 100) return { bg: 'rgba(45,212,160,0.12)', color: 'var(--green)' }
    if (pct >= 60)  return { bg: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }
    return { bg: 'rgba(79,142,247,0.12)', color: 'var(--accent)' }
  }
  // gasto
  if (pct > 100) return { bg: 'rgba(247,95,95,0.12)', color: 'var(--red)' }
  if (pct >= 80) return { bg: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }
  return { bg: 'rgba(45,212,160,0.12)', color: 'var(--green)' }
}
function BadgeBar({ pct, tipo = 'gasto' }) {
  if (pct === null) return <span style={{ color: 'var(--text3)', fontSize: '0.72rem' }}>—</span>
  const { bg, color } = badgeStyle(pct, tipo)
  const label = pct > 100 ? `+${(pct - 100).toFixed(0)}%` : `${pct.toFixed(0)}%`
  const fillW = Math.min(pct, 100)
  const barColor = tipo === 'gasto' ? (pct > 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)') : color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: bg, color }}>{label}</span>
      <div style={{ width: 90, height: 4, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${fillW}%`, height: '100%', background: barColor, borderRadius: 3 }} />
      </div>
    </div>
  )
}

const TH = ({ children, right }) => (
  <th style={{ padding: '9px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', textAlign: right ? 'right' : 'left', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
    {children}
  </th>
)
const TD = ({ children, right, mono, color, bold, small, muted }) => (
  <td style={{ padding: '8px 14px', fontSize: small ? '0.75rem' : '0.875rem', textAlign: right ? 'right' : 'left', fontFamily: mono ? 'var(--mono)' : 'var(--font)', color: color || (muted ? 'var(--text2)' : 'var(--text)'), fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' }}>
    {children}
  </td>
)

// ── VISTA 1: Análisis de presupuesto ─────────────────────────
function VistaAnalisis({ categorias, conceptos, periodo }) {
  const now = new Date()
  const [selPeriodo, setSelPeriodo] = useState(periodo)
  const [txData, setTxData] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { anio, mes } = selPeriodo

  const load = useCallback(async () => {
    setLoading(true)
    const first = `${anio}-${String(mes).padStart(2,'0')}-01`
    const last  = new Date(anio, mes, 0).toISOString().split('T')[0]
    const { data } = await supabase.from('transacciones')
      .select('id, valor, tipo_movimiento, concepto_id')
      .eq('user_id', user.id).gte('fecha', first).lte('fecha', last)
    setTxData(data || [])
    setLoading(false)
  }, [user.id, anio, mes])

  useEffect(() => { load() }, [load])

  // Mapas
  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  // Ejecutado por concepto
  const ejCon = {}
  for (const t of txData) {
    if (!t.concepto_id) continue
    ejCon[t.concepto_id] = (ejCon[t.concepto_id] || 0) + Number(t.valor)
  }

  // Factor mensual
  const factor = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)

  // Agrupar conceptos por categoría
  const grupos = {}
  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]
    if (!cat) continue
    if (!grupos[cat.id]) grupos[cat.id] = { cat, items: [] }
    grupos[cat.id].items.push(c)
  }

  // Totales globales
  let totIngPres = 0, totIngEj = 0
  let totGasPres = 0, totGasEj = 0
  let totAhoPres = 0, totAhoEj = 0

  const ahorroEj = txData.filter(t => t.tipo_movimiento === 'ahorro').reduce((s,t) => s + Number(t.valor), 0)

  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]
    if (!cat) continue
    const pres = (Number(c.monto_presupuestado) || 0) * factor(c)
    const ej   = ejCon[c.id] || 0
    if (cat.tipo === 'Ingreso') { totIngPres += pres; totIngEj += ej }
    else if (cat.tipo === 'Gasto') { totGasPres += pres; totGasEj += ej }
    else if (cat.tipo === 'Ahorro/Inversión') { totAhoPres += pres }
  }
  totAhoEj = ahorroEj
  const flujoLibrePres = totIngPres - totGasPres - totAhoPres
  const flujoLibreEj   = totIngEj   - totGasEj   - totAhoEj

  const tipoGrupos = ['Ingreso', 'Gasto', 'Ahorro/Inversión']

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 3 }}>Análisis de presupuesto</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Planeado vs ejecutado · semáforo por concepto</p>
        </div>
        <MonthPicker anio={anio} mes={mes} onChange={setSelPeriodo} />
      </div>

      {/* Tabla resumen flujo */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Flujo del mes</TH>
              <TH right>Presupuestado</TH>
              <TH right>Ejecutado</TH>
              <TH right>Diferencia</TH>
              <TH right>Ejecución</TH>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '▲ Ingresos', pres: totIngPres, ej: totIngEj, color: 'var(--green)', tipo: 'ingreso' },
              { label: '▼ Gastos',   pres: totGasPres, ej: totGasEj, color: 'var(--red)',   tipo: 'gasto'   },
              { label: '↗ Ahorro',   pres: totAhoPres, ej: totAhoEj, color: 'var(--amber)', tipo: 'ahorro'  },
            ].map(row => {
              const diff = getDiff(row.pres, row.ej)
              const pct  = getPct(row.pres, row.ej)
              const diffColor = row.tipo === 'gasto' ? (diff > 0 ? 'var(--red)' : 'var(--green)') : (diff >= 0 ? 'var(--green)' : 'var(--red)')
              return (
                <tr key={row.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <TD bold color={row.color}>{row.label}</TD>
                  <TD right mono>{COP(row.pres)}</TD>
                  <TD right mono color={row.color}>{COP(row.ej)}</TD>
                  <TD right mono color={diffColor}>{diff >= 0 ? '+' : ''}{COP(diff)}</TD>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}><BadgeBar pct={pct} tipo={row.tipo} /></td>
                </tr>
              )
            })}
            {/* Flujo libre */}
            <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--bg3)' }}>
              <TD bold>Flujo libre</TD>
              <TD right mono muted>{COP(flujoLibrePres)}</TD>
              <TD right mono bold color={flujoLibreEj >= 0 ? 'var(--green)' : 'var(--red)'}>{COP(flujoLibreEj)}</TD>
              <TD right mono color={flujoLibreEj >= 0 ? 'var(--green)' : 'var(--red)'}>{flujoLibreEj >= 0 ? '+' : ''}{COP(flujoLibreEj)}</TD>
              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: flujoLibreEj >= 0 ? 'rgba(45,212,160,0.12)' : 'rgba(247,95,95,0.12)', color: flujoLibreEj >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {flujoLibreEj >= 0 ? 'Superávit' : 'Déficit'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tabla detalle por categoría */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Categoría / Concepto</TH>
              <TH right>Presupuestado</TH>
              <TH right>Ejecutado</TH>
              <TH right>Diferencia</TH>
              <TH right>Ejecución</TH>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)' }}>Cargando...</td></tr>
            ) : tipoGrupos.map(tipo => {
              const gruposDeTipo = Object.values(grupos).filter(g => g.cat.tipo === tipo)
              if (!gruposDeTipo.length) return null
              let totPresTipo = 0, totEjTipo = 0

              return gruposDeTipo.map(({ cat, items }) => {
                let totPresCat = 0, totEjCat = 0
                const rows = items.map(c => {
                  const pres = (Number(c.monto_presupuestado) || 0) * factor(c)
                  const ej   = tipo === 'Ahorro/Inversión' ? 0 : (ejCon[c.id] || 0)
                  totPresCat += pres; totEjCat += ej
                  totPresTipo += pres; totEjTipo += ej
                  const diff = getDiff(pres, ej)
                  const pct  = getPct(pres, ej)
                  const diffColor = tipo === 'Gasto' ? (diff > 0 ? 'var(--red)' : 'var(--green)') : (diff >= 0 ? 'var(--green)' : 'var(--red)')
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '7px 14px 7px 32px', fontSize: '0.82rem', color: 'var(--text2)' }}>{c.nombre}</td>
                      <TD right mono small muted>{K(pres)}</TD>
                      <TD right mono small color={ej > 0 ? undefined : 'var(--text3)'}>{ej > 0 ? K(ej) : '—'}</TD>
                      <TD right mono small color={pres === 0 ? 'var(--text3)' : diffColor}>{pres > 0 ? (diff >= 0 ? '+' : '') + K(diff) : '—'}</TD>
                      <td style={{ padding: '7px 14px', textAlign: 'right' }}><BadgeBar pct={pres > 0 ? pct : null} tipo={tipo === 'Ingreso' ? 'ingreso' : tipo === 'Ahorro/Inversión' ? 'ahorro' : 'gasto'} /></td>
                    </tr>
                  )
                })

                const catDiff = getDiff(totPresCat, totEjCat)
                const catPct  = getPct(totPresCat, totEjCat)
                const catDiffColor = tipo === 'Gasto' ? (catDiff > 0 ? 'var(--red)' : 'var(--green)') : (catDiff >= 0 ? 'var(--green)' : 'var(--red)')

                return [
                  <tr key={`cat-${cat.id}`} style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>
                      ▸ {cat.nombre}
                    </td>
                  </tr>,
                  ...rows,
                  <tr key={`tot-${cat.id}`} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px 8px 20px', fontSize: '0.82rem', fontWeight: 600 }}>Total {cat.nombre}</td>
                    <TD right mono small bold>{K(totPresCat)}</TD>
                    <TD right mono small bold color={tipo === 'Gasto' ? 'var(--red)' : tipo === 'Ingreso' ? 'var(--green)' : 'var(--amber)'}>{K(totEjCat)}</TD>
                    <TD right mono small bold color={catDiffColor}>{catDiff >= 0 ? '+' : ''}{K(catDiff)}</TD>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}><BadgeBar pct={catPct} tipo={tipo === 'Ingreso' ? 'ingreso' : tipo === 'Ahorro/Inversión' ? 'ahorro' : 'gasto'} /></td>
                  </tr>
                ]
              })
            })}

            {/* Gran total gastos */}
            <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border2)' }}>
              <TD bold>TOTAL GASTOS</TD>
              <TD right mono bold>{COP(totGasPres)}</TD>
              <TD right mono bold color="var(--accent)">{COP(totGasEj)}</TD>
              <TD right mono bold color={totGasEj <= totGasPres ? 'var(--green)' : 'var(--red)'}>{totGasEj <= totGasPres ? '' : '+'}{COP(totGasEj - totGasPres)}</TD>
              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                <BadgeBar pct={getPct(totGasPres, totGasEj)} tipo="gasto" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── VISTA 2: Radar histórico ──────────────────────────────────
function VistaRadar({ categorias, conceptos }) {
  const { user } = useAuth()
  const [meses, setMeses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const now = new Date()
      // Últimos 4 meses
      const periodos = []
      for (let i = 3; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        periodos.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 })
      }

      const results = await Promise.all(periodos.map(async p => {
        const first = `${p.anio}-${String(p.mes).padStart(2,'0')}-01`
        const last  = new Date(p.anio, p.mes, 0).toISOString().split('T')[0]
        const { data } = await supabase.from('transacciones')
          .select('valor, tipo_movimiento, concepto_id')
          .eq('user_id', user.id).gte('fecha', first).lte('fecha', last)
        return { ...p, txs: data || [] }
      }))
      setMeses(results)
      setLoading(false)
    }
    load()
  }, [user.id])

  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  const factor = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)

  // Por cada mes, calcular ejecutado por categoría
  const dataMeses = meses.map(m => {
    const ejCon = {}
    for (const t of m.txs) {
      if (t.concepto_id && t.tipo_movimiento === 'gasto') ejCon[t.concepto_id] = (ejCon[t.concepto_id] || 0) + Number(t.valor)
    }
    const ejCat = {}
    for (const c of conceptos) {
      const cat = catMap[c.categoria_id]
      if (!cat || cat.tipo !== 'Gasto') continue
      ejCat[cat.id] = (ejCat[cat.id] || 0) + (ejCon[c.id] || 0)
    }
    const ingEj = m.txs.filter(t => t.tipo_movimiento === 'ingreso').reduce((s,t) => s+Number(t.valor),0)
    const gasEj = m.txs.filter(t => t.tipo_movimiento === 'gasto').reduce((s,t) => s+Number(t.valor),0)
    const ahoEj = m.txs.filter(t => t.tipo_movimiento === 'ahorro').reduce((s,t) => s+Number(t.valor),0)
    return { ...m, ejCat, ingEj, gasEj, ahoEj, flujo: ingEj - gasEj - ahoEj }
  })

  // Categorías de gasto con presupuesto
  const catGastos = Object.values(
    conceptos.reduce((acc, c) => {
      const cat = catMap[c.categoria_id]
      if (!cat || cat.tipo !== 'Gasto') return acc
      if (!acc[cat.id]) acc[cat.id] = { cat, pres: 0 }
      acc[cat.id].pres += (Number(c.monto_presupuestado) || 0) * factor(c)
      return acc
    }, {})
  ).filter(g => g.pres > 0)

  // Detectar alertas
  const alertas = []
  for (const { cat, pres } of catGastos) {
    const pcts = dataMeses.map(m => m.ejCat[cat.id] ? (m.ejCat[cat.id] / pres) * 100 : 0)
    const desbordados = pcts.filter(p => p > 100).length
    const promedio    = pcts.reduce((s,p) => s+p, 0) / pcts.length
    const tendencia   = pcts.length >= 2 ? pcts[pcts.length-1] - pcts[0] : 0

    if (desbordados >= 3) alertas.push({ tipo: 'red', texto: `${cat.nombre} — patrón crónico`, sub: `Desbordado ${desbordados} de ${pcts.length} meses. Promedio ${promedio.toFixed(0)}%` })
    else if (desbordados >= 2) alertas.push({ tipo: 'amber', texto: `${cat.nombre} — recurrente`, sub: `Desbordado ${desbordados} de ${pcts.length} meses` })
    else if (tendencia > 30) alertas.push({ tipo: 'amber', texto: `${cat.nombre} — tendencia alcista`, sub: `Creció ${tendencia.toFixed(0)}pp en el período` })
    else if (promedio < 30 && pcts[pcts.length-1] < 30) alertas.push({ tipo: 'blue', texto: `${cat.nombre} — muy por debajo`, sub: `Promedio ${promedio.toFixed(0)}% — considera ajustar presupuesto` })
  }

  // Ahorro alerts
  const ahoPresMes = conceptos.filter(c => catMap[c.categoria_id]?.tipo === 'Ahorro/Inversión').reduce((s,c) => s + (Number(c.monto_presupuestado)||0) * factor(c), 0)
  const ahoUltimoMes = dataMeses[dataMeses.length-1]?.ahoEj || 0
  if (ahoPresMes > 0 && ahoUltimoMes / ahoPresMes < 0.6) alertas.push({ tipo: 'amber', texto: 'Ahorro por debajo de meta', sub: `Solo ${((ahoUltimoMes/ahoPresMes)*100).toFixed(0)}% ejecutado este mes` })

  function heatColor(pct) {
    if (!pct) return { bg: 'rgba(255,255,255,0.03)', color: 'var(--text3)' }
    if (pct > 100) return { bg: 'rgba(247,95,95,0.2)', color: 'var(--red)' }
    if (pct >= 80) return { bg: 'rgba(247,180,79,0.18)', color: 'var(--amber)' }
    return { bg: 'rgba(45,212,160,0.12)', color: 'var(--green)' }
  }

  const MESES_STR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: 3 }}>Radar histórico · alertas y tendencias</h2>
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Últimos 4 meses · patrones de gasto y categorías problemáticas</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Mapa de calor */}
        <div className="card">
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Ejecución % por categoría y mes</p>
          {loading ? <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Cargando...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'left' }}>Categoría</th>
                  {dataMeses.map(m => (
                    <th key={`${m.anio}-${m.mes}`} style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'center' }}>
                      {MESES_STR[m.mes - 1]}
                    </th>
                  ))}
                  <th style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'center' }}>Prom.</th>
                </tr>
              </thead>
              <tbody>
                {catGastos.slice(0, 7).map(({ cat, pres }) => {
                  const pcts = dataMeses.map(m => pres > 0 ? (m.ejCat[cat.id] || 0) / pres * 100 : null)
                  const prom = pcts.filter(Boolean).reduce((s,p,_,a) => s + p/a.length, 0)
                  return (
                    <tr key={cat.id}>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text2)', padding: '4px 8px 4px 0', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.nombre}</td>
                      {pcts.map((pct, i) => {
                        const { bg, color } = heatColor(pct)
                        return (
                          <td key={i} style={{ padding: '3px 4px', textAlign: 'center' }}>
                            <div style={{ background: bg, color, borderRadius: 5, fontSize: '0.68rem', fontWeight: 700, padding: '3px 4px', fontFamily: 'var(--mono)' }}>
                              {pct != null ? `${pct.toFixed(0)}%` : '—'}
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                        {(() => { const { bg, color } = heatColor(prom); return <div style={{ background: bg, color, borderRadius: 5, fontSize: '0.68rem', fontWeight: 700, padding: '3px 4px', fontFamily: 'var(--mono)' }}>{prom.toFixed(0)}%</div> })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['var(--red)','rgba(247,95,95,0.2)','>100%'],['var(--amber)','rgba(247,180,79,0.18)','80–100%'],['var(--green)','rgba(45,212,160,0.12)','<80%']].map(([c,bg,lbl]) => (
              <span key={lbl} style={{ fontSize: '0.68rem', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: bg }}/>
                <span style={{ color: c }}>{lbl}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Alertas detectadas */}
        <div className="card">
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Alertas detectadas automáticamente</p>
          {alertas.length === 0 ? (
            <p style={{ color: 'var(--green)', fontSize: '0.875rem', fontWeight: 500 }}>Sin alertas — presupuesto bajo control</p>
          ) : alertas.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < alertas.length-1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.tipo === 'red' ? 'var(--red)' : a.tipo === 'amber' ? 'var(--amber)' : 'var(--accent)', flexShrink: 0, marginTop: 5 }} />
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 2 }}>{a.texto}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{a.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flujo libre por mes */}
      <div className="card">
        <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Flujo libre mensual — últimos 4 meses</p>
        {loading ? <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Cargando...</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {dataMeses.map(m => {
              const color = m.flujo >= 0 ? 'var(--green)' : 'var(--red)'
              const maxAbs = Math.max(...dataMeses.map(x => Math.abs(x.flujo)), 1)
              const barW = Math.min(Math.abs(m.flujo) / maxAbs * 100, 100)
              return (
                <div key={`${m.anio}-${m.mes}`} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{MESES_STR[m.mes-1]} {m.anio}</p>
                  <p className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color, marginBottom: 3 }}>{K(m.flujo)}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)', marginBottom: 8 }}>{m.flujo >= 0 ? 'superávit' : 'déficit'}</p>
                  <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${barW}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── VISTA 3: Editor de presupuesto ───────────────────────────
function VistaEditor({ categorias, conceptos, onRefresh }) {
  const { user } = useAuth()
  const [valores, setValores] = useState({})
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  // Inicializar valores
  useEffect(() => {
    const init = {}
    for (const c of conceptos) init[c.id] = c.monto_presupuestado != null ? String(c.monto_presupuestado) : ''
    setValores(init)
  }, [conceptos])

  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  const factor = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)

  function mensual(c) {
    const v = parseFloat(valores[c.id]) || 0
    return v * factor(c)
  }

  // Totales reactivos
  let totIng = 0, totGas = 0, totAho = 0
  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]
    if (!cat) continue
    const m = mensual(c)
    if (cat.tipo === 'Ingreso') totIng += m
    else if (cat.tipo === 'Gasto') totGas += m
    else if (cat.tipo === 'Ahorro/Inversión') totAho += m
  }
  const margen = totIng - totGas - totAho

  async function guardar() {
    setSaving(true); setSaved(false)
    const updates = conceptos.map(c => {
      const v = parseFloat(valores[c.id])
      return supabase.from('conceptos')
        .update({ monto_presupuestado: isNaN(v) ? null : v })
        .eq('id', c.id).eq('user_id', user.id)
    })
    await Promise.all(updates)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onRefresh?.()
  }

  // Agrupar por tipo y categoría
  const grupos = {}
  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]
    if (!cat) continue
    const key = `${cat.tipo}__${cat.id}`
    if (!grupos[key]) grupos[key] = { cat, tipo: cat.tipo, items: [] }
    grupos[key].items.push(c)
  }
  const tipoOrder = ['Ingreso','Gasto','Ahorro/Inversión']
  const gruposOrdenados = tipoOrder.flatMap(tipo =>
    Object.values(grupos).filter(g => g.tipo === tipo).sort((a,b) => a.cat.nombre.localeCompare(b.cat.nombre))
  )

  const tipoColor = { 'Ingreso': 'var(--green)', 'Gasto': 'var(--red)', 'Ahorro/Inversión': 'var(--amber)' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 3 }}>Editor de presupuesto</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Ajusta los montos planeados · aplican a todos los meses</p>
        </div>
        <button
          onClick={guardar} disabled={saving}
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '0.875rem', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.2s' }}>
          {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
        </button>
      </div>

      {/* KPIs reactivos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { lbl: 'Total ingresos',    val: totIng, color: 'var(--green)', sub: 'mensual promedio' },
          { lbl: 'Total gastos',      val: totGas, color: 'var(--red)',   sub: 'mensual promedio' },
          { lbl: 'Total ahorro',      val: totAho, color: 'var(--amber)', sub: 'mensual promedio' },
        ].map(k => (
          <div key={k.lbl} className="card card-sm">
            <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 6 }}>{k.lbl}</p>
            <p className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: k.color, letterSpacing: '-.02em' }}>{K(k.val)}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 3 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Semáforo de balance */}
      <div style={{ background: margen >= 0 ? 'rgba(45,212,160,0.06)' : 'rgba(247,95,95,0.08)', border: `1px solid ${margen >= 0 ? 'rgba(45,212,160,0.2)' : 'rgba(247,95,95,0.2)'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: margen >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: 3 }}>
            {margen >= 0 ? 'Presupuesto balanceado' : 'Presupuesto en déficit'}
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
            {margen >= 0 ? 'Ingresos cubren gastos y ahorro con margen positivo' : 'Los gastos y ahorro superan los ingresos planeados'}
          </p>
        </div>
        <p className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: margen >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-.02em' }}>
          {margen >= 0 ? '+' : ''}{K(margen)}
        </p>
      </div>

      {/* Tabla editable */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Concepto</TH>
              <TH right>Periodicidad</TH>
              <TH right>Monto base</TH>
              <TH right>Equiv. mensual</TH>
            </tr>
          </thead>
          <tbody>
            {gruposOrdenados.map(({ cat, tipo, items }) => {
              const totMensCat = items.reduce((s,c) => s + mensual(c), 0)
              const color = tipoColor[tipo] || 'var(--text2)'
              return [
                <tr key={`cat-${cat.id}`} style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>
                    ▸ {cat.nombre} <span style={{ color, marginLeft: 4 }}>({tipo})</span>
                  </td>
                </tr>,
                ...items.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '7px 14px 7px 28px', fontSize: '0.82rem', color: 'var(--text2)' }}>
                      {c.nombre}
                      {c.fijo_variable === 'F' && <span style={{ fontSize: '0.68rem', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>Fijo</span>}
                    </td>
                    <TD right muted small>{c.periodicidad}</TD>
                    <td style={{ padding: '5px 14px', textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="1000"
                        value={valores[c.id] ?? ''}
                        onChange={e => setValores(prev => ({ ...prev, [c.id]: e.target.value }))}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', fontFamily: 'var(--mono)', color: 'var(--text)', textAlign: 'right', width: 130, outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border2)'}
                      />
                    </td>
                    <TD right mono small color={color}>{K(mensual(c))}</TD>
                  </tr>
                )),
                <tr key={`tot-${cat.id}`} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '7px 14px 7px 20px', fontSize: '0.78rem', fontWeight: 600 }}>Total {cat.nombre}</td>
                  <TD right mono small bold color={color}>{K(totMensCat)}</TD>
                </tr>
              ]
            })}
            {/* Gran total */}
            <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border2)' }}>
              <td colSpan={3} style={{ padding: '11px 14px', fontSize: '0.875rem', fontWeight: 700 }}>TOTAL COMPROMETIDO (Gastos + Ahorro)</td>
              <TD right mono bold color="var(--red)">{K(totGas + totAho)}</TD>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────
export default function ReportesPage() {
  const { user } = useAuth()
  const [vista, setVista] = useState('analisis')
  const [categorias, setCategorias] = useState([])
  const [conceptos, setConceptos]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const now = new Date()
  const periodo = { anio: now.getFullYear(), mes: now.getMonth() + 1 }

  async function loadBase() {
    setLoading(true)
    const [{ data: cats }, { data: cons }] = await Promise.all([
      supabase.from('categorias').select('id, nombre, tipo').eq('user_id', user.id),
      supabase.from('conceptos').select('id, nombre, categoria_id, periodicidad, monto_presupuestado, fijo_variable, activo')
        .eq('user_id', user.id).eq('activo', true).order('nombre'),
    ])
    setCategorias(cats || [])
    setConceptos(cons || [])
    setLoading(false)
  }

  useEffect(() => { loadBase() }, [user.id, refreshKey])

  const VISTAS = [
    { id: 'analisis', label: 'Análisis mensual' },
    { id: 'radar',    label: 'Radar histórico'  },
    { id: 'editor',   label: 'Editor presupuesto'},
  ]

  return (
    <div className="page animate-in" style={{ maxWidth: '100%', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
      <div className="page-header">
        <h1>Reportes</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVista(v.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: '0.875rem', fontWeight: 600,
              color: vista === v.id ? 'var(--accent)' : 'var(--text2)',
              padding: '8px 14px', borderBottom: `2px solid ${vista === v.id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'color 0.15s',
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 12 }} />)
      ) : (
        <>
          {vista === 'analisis' && <VistaAnalisis categorias={categorias} conceptos={conceptos} periodo={periodo} />}
          {vista === 'radar'    && <VistaRadar    categorias={categorias} conceptos={conceptos} />}
          {vista === 'editor'   && <VistaEditor   categorias={categorias} conceptos={conceptos} onRefresh={() => setRefreshKey(k => k+1)} />}
        </>
      )}
    </div>
  )
}
