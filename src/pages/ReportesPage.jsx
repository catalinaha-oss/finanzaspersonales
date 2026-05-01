import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCompact, monthLabel } from '../lib/utils'
import MonthPicker from '../components/MonthPicker'

const COP = v => v == null ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
const K   = v => formatCompact(v)

function getPct(pres, ej) { return pres > 0 ? (ej / pres) * 100 : null }
function getDiff(pres, ej) { return ej - pres }

function BadgeBar({ pct, tipo = 'gasto' }) {
  if (pct === null) return <span style={{ color: 'var(--text3)', fontSize: '0.72rem' }}>—</span>
  const over = tipo === 'gasto' && pct > 100
  const warn = tipo === 'gasto' && pct >= 80 && pct <= 100
  const low  = tipo === 'ahorro' && pct < 60
  const bg   = over ? 'rgba(247,95,95,0.12)' : warn ? 'rgba(247,180,79,0.12)' : low ? 'rgba(79,142,247,0.12)' : 'rgba(45,212,160,0.12)'
  const col  = over ? 'var(--red)' : warn ? 'var(--amber)' : low ? 'var(--accent)' : 'var(--green)'
  const barCol = over ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--green)'
  const label  = pct > 100 ? `+${(pct - 100).toFixed(0)}%` : `${pct.toFixed(0)}%`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: bg, color: col }}>{label}</span>
      <div style={{ width: 90, height: 4, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barCol, borderRadius: 3 }} />
      </div>
    </div>
  )
}

const TH = ({ children, right }) => (
  <th style={{ padding: '9px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', textAlign: right ? 'right' : 'left', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>
)
const TD = ({ children, right, mono, color, bold, small, muted }) => (
  <td style={{ padding: '8px 14px', fontSize: small ? '0.75rem' : '0.875rem', textAlign: right ? 'right' : 'left', fontFamily: mono ? 'var(--mono)' : 'var(--font)', color: color || (muted ? 'var(--text2)' : 'var(--text)'), fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' }}>{children}</td>
)

// ── VISTA 1: Análisis mensual ─────────────────────────────────
function VistaAnalisis({ categorias, conceptos }) {
  const { user } = useAuth()
  const now = new Date()
  const [periodo, setPeriodo] = useState({ anio: now.getFullYear(), mes: now.getMonth() + 1 })
  const [txData,  setTxData]  = useState([])
  const [loading, setLoading] = useState(true)
  const { anio, mes } = periodo

  const load = useCallback(async () => {
    setLoading(true)
    const first = `${anio}-${String(mes).padStart(2,'0')}-01`
    const last  = new Date(anio, mes, 0).toISOString().split('T')[0]
    const { data } = await supabase.from('transacciones')
      .select('id, valor, tipo_movimiento, concepto_id')
      .eq('user_id', user.id).gte('fecha', first).lte('fecha', last)
    setTxData(data || []); setLoading(false)
  }, [user.id, anio, mes])

  useEffect(() => { load() }, [load])

  const catMap = {}; for (const c of categorias) catMap[c.id] = c
  const factor = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)
  const ejCon  = {}; for (const t of txData) if (t.concepto_id && t.tipo_movimiento === 'gasto') ejCon[t.concepto_id] = (ejCon[t.concepto_id] || 0) + Number(t.valor)

  let totIngPres=0,totIngEj=0,totGasPres=0,totGasEj=0,totAhoPres=0
  const ahorroEj = txData.filter(t=>t.tipo_movimiento==='ahorro').reduce((s,t)=>s+Number(t.valor),0)
  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]; if (!cat) continue
    const pres = (Number(c.monto_presupuestado)||0)*factor(c)
    const ej   = ejCon[c.id]||0
    if (cat.tipo==='Ingreso')          { totIngPres+=pres; totIngEj+=txData.filter(t=>t.tipo_movimiento==='ingreso'&&t.concepto_id===c.id).reduce((s,t)=>s+Number(t.valor),0) }
    else if (cat.tipo==='Gasto')       { totGasPres+=pres; totGasEj+=ej }
    else if (cat.tipo==='Ahorro/Inversión') { totAhoPres+=pres }
  }
  const totAhoEj = ahorroEj
  totIngEj = txData.filter(t=>t.tipo_movimiento==='ingreso').reduce((s,t)=>s+Number(t.valor),0)
  const flujoLibrePres = totIngPres - totGasPres - totAhoPres
  const flujoLibreEj   = totIngEj   - totGasEj   - totAhoEj

  const grupos = {}
  for (const c of conceptos) {
    const cat = catMap[c.categoria_id]; if (!cat) continue
    if (!grupos[cat.id]) grupos[cat.id] = { cat, items: [] }
    grupos[cat.id].items.push(c)
  }
  const TIPO_ORDER = ['Ingreso','Gasto','Ahorro/Inversión']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 3 }}>Análisis mensual</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Planeado vs ejecutado · semáforo por concepto</p>
        </div>
        <MonthPicker anio={anio} mes={mes} onChange={setPeriodo} />
      </div>

      {/* Tabla resumen flujo */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><TH>Flujo del mes</TH><TH right>Presupuestado</TH><TH right>Ejecutado</TH><TH right>Diferencia</TH><TH right>Ejecución</TH></tr></thead>
          <tbody>
            {[
              { label: '▲ Ingresos', pres: totIngPres, ej: totIngEj, color: 'var(--green)', tipo: 'ingreso' },
              { label: '▼ Gastos',   pres: totGasPres, ej: totGasEj, color: 'var(--red)',   tipo: 'gasto'   },
              { label: '↗ Ahorro',   pres: totAhoPres, ej: totAhoEj, color: 'var(--amber)', tipo: 'ahorro'  },
            ].map(row => {
              const diff = getDiff(row.pres, row.ej)
              const pct  = getPct(row.pres, row.ej)
              const dc   = row.tipo==='gasto' ? (diff>0?'var(--red)':'var(--green)') : (diff>=0?'var(--green)':'var(--red)')
              return (
                <tr key={row.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <TD bold color={row.color}>{row.label}</TD>
                  <TD right mono>{COP(row.pres)}</TD>
                  <TD right mono color={row.color}>{COP(row.ej)}</TD>
                  <TD right mono color={dc}>{diff>=0?'+':''}{COP(diff)}</TD>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}><BadgeBar pct={pct} tipo={row.tipo} /></td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--bg3)' }}>
              <TD bold>Flujo libre</TD>
              <TD right mono muted>{COP(flujoLibrePres)}</TD>
              <TD right mono bold color={flujoLibreEj>=0?'var(--green)':'var(--red)'}>{COP(flujoLibreEj)}</TD>
              <TD right mono color={flujoLibreEj>=0?'var(--green)':'var(--red)'}>{flujoLibreEj>=0?'+':''}{COP(flujoLibreEj)}</TD>
              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: flujoLibreEj>=0?'rgba(45,212,160,0.12)':'rgba(247,95,95,0.12)', color: flujoLibreEj>=0?'var(--green)':'var(--red)' }}>
                  {flujoLibreEj>=0?'Superávit':'Déficit'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tabla detalle */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><TH>Categoría / Concepto</TH><TH right>Presupuestado</TH><TH right>Ejecutado</TH><TH right>Diferencia</TH><TH right>Ejecución</TH></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)' }}>Cargando...</td></tr> :
              TIPO_ORDER.flatMap(tipo =>
                Object.values(grupos)
                  .filter(g => g.cat.tipo === tipo)
                  .flatMap(({ cat, items }) => {
                    let totPres=0,totEj=0
                    const rows = items.map(c => {
                      const pres = (Number(c.monto_presupuestado)||0)*factor(c)
                      const ej   = tipo==='Ahorro/Inversión' ? 0 : (ejCon[c.id]||0)
                      totPres+=pres; totEj+=ej
                      const diff = getDiff(pres,ej)
                      const pct  = getPct(pres,ej)
                      const dc   = tipo==='Gasto'?(diff>0?'var(--red)':'var(--green)'):(diff>=0?'var(--green)':'var(--red)')
                      return (
                        <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '7px 14px 7px 32px', fontSize: '0.82rem', color: 'var(--text2)' }}>{c.nombre}</td>
                          <TD right mono small muted>{K(pres)}</TD>
                          <TD right mono small color={ej>0?undefined:'var(--text3)'}>{ej>0?K(ej):'—'}</TD>
                          <TD right mono small color={pres===0?'var(--text3)':dc}>{pres>0?(diff>=0?'+':'')+K(diff):'—'}</TD>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}><BadgeBar pct={pres>0?pct:null} tipo={tipo==='Ingreso'?'ingreso':tipo==='Ahorro/Inversión'?'ahorro':'gasto'} /></td>
                        </tr>
                      )
                    })
                    const catDiff = getDiff(totPres,totEj)
                    const catPct  = getPct(totPres,totEj)
                    const cdc     = tipo==='Gasto'?(catDiff>0?'var(--red)':'var(--green)'):(catDiff>=0?'var(--green)':'var(--red)')
                    const catColor = tipo==='Ingreso'?'var(--green)':tipo==='Gasto'?'var(--red)':'var(--amber)'
                    return [
                      <tr key={`h-${cat.id}`} style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                        <td colSpan={5} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>▸ {cat.nombre}</td>
                      </tr>,
                      ...rows,
                      <tr key={`t-${cat.id}`} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 14px 8px 20px', fontSize: '0.82rem', fontWeight: 600 }}>Total {cat.nombre}</td>
                        <TD right mono small bold>{K(totPres)}</TD>
                        <TD right mono small bold color={catColor}>{K(totEj)}</TD>
                        <TD right mono small bold color={cdc}>{catDiff>=0?'+':''}{K(catDiff)}</TD>
                        <td style={{ padding: '8px 14px', textAlign: 'right' }}><BadgeBar pct={catPct} tipo={tipo==='Ingreso'?'ingreso':tipo==='Ahorro/Inversión'?'ahorro':'gasto'} /></td>
                      </tr>
                    ]
                  })
              )
            }
            <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border2)' }}>
              <TD bold>TOTAL GASTOS</TD><TD right mono bold>{COP(totGasPres)}</TD>
              <TD right mono bold color="var(--accent)">{COP(totGasEj)}</TD>
              <TD right mono bold color={totGasEj<=totGasPres?'var(--green)':'var(--red)'}>{totGasEj<=totGasPres?'':''}{COP(totGasEj-totGasPres)}</TD>
              <td style={{ padding: '8px 14px', textAlign: 'right' }}><BadgeBar pct={getPct(totGasPres,totGasEj)} tipo="gasto" /></td>
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
  const [meses,   setMeses]   = useState([])
  const [loading, setLoading] = useState(true)
  const MESES_STR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  useEffect(() => {
    async function load() {
      setLoading(true)
      const now = new Date()
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
      setMeses(results); setLoading(false)
    }
    load()
  }, [user.id])

  const catMap = {}; for (const c of categorias) catMap[c.id] = c
  const factor = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)

  const dataMeses = meses.map(m => {
    const ejCon={}; for (const t of m.txs) if (t.concepto_id&&t.tipo_movimiento==='gasto') ejCon[t.concepto_id]=(ejCon[t.concepto_id]||0)+Number(t.valor)
    const ejCat={}; for (const c of conceptos) { const cat=catMap[c.categoria_id]; if (!cat||cat.tipo!=='Gasto') continue; ejCat[cat.id]=(ejCat[cat.id]||0)+(ejCon[c.id]||0) }
    const ingEj = m.txs.filter(t=>t.tipo_movimiento==='ingreso').reduce((s,t)=>s+Number(t.valor),0)
    const gasEj = m.txs.filter(t=>t.tipo_movimiento==='gasto').reduce((s,t)=>s+Number(t.valor),0)
    const ahoEj = m.txs.filter(t=>t.tipo_movimiento==='ahorro').reduce((s,t)=>s+Number(t.valor),0)
    return { ...m, ejCat, ingEj, gasEj, ahoEj, flujo: ingEj-gasEj-ahoEj }
  })

  const catGastos = Object.values(
    conceptos.reduce((acc,c) => {
      const cat=catMap[c.categoria_id]; if (!cat||cat.tipo!=='Gasto') return acc
      if (!acc[cat.id]) acc[cat.id]={cat,pres:0}
      acc[cat.id].pres+=(Number(c.monto_presupuestado)||0)*factor(c)
      return acc
    }, {})
  ).filter(g=>g.pres>0)

  const alertas = []
  for (const {cat,pres} of catGastos) {
    const pcts = dataMeses.map(m => m.ejCat[cat.id] ? (m.ejCat[cat.id]/pres)*100 : 0)
    const des  = pcts.filter(p=>p>100).length
    const prom = pcts.reduce((s,p)=>s+p,0)/pcts.length
    const tend = pcts.length>=2 ? pcts[pcts.length-1]-pcts[0] : 0
    if (des>=3) alertas.push({ tipo:'red',   texto:`${cat.nombre} — patrón crónico`, sub:`Desbordado ${des} de ${pcts.length} meses. Promedio ${prom.toFixed(0)}%` })
    else if (des>=2) alertas.push({ tipo:'amber', texto:`${cat.nombre} — recurrente`, sub:`Desbordado ${des} de ${pcts.length} meses` })
    else if (tend>30) alertas.push({ tipo:'amber', texto:`${cat.nombre} — tendencia alcista`, sub:`Creció ${tend.toFixed(0)}pp en el período` })
    else if (prom<30) alertas.push({ tipo:'blue',  texto:`${cat.nombre} — muy por debajo`, sub:`Promedio ${prom.toFixed(0)}% — considera ajustar presupuesto` })
  }

  function heatStyle(pct) {
    if (!pct) return { bg:'rgba(255,255,255,0.03)', color:'var(--text3)' }
    if (pct>100) return { bg:'rgba(247,95,95,0.2)', color:'var(--red)' }
    if (pct>=80) return { bg:'rgba(247,180,79,0.18)', color:'var(--amber)' }
    return { bg:'rgba(45,212,160,0.12)', color:'var(--green)' }
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 3 }}>Radar histórico</h2>
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Últimos 4 meses · patrones y alertas automáticas</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Mapa de calor */}
        <div className="card">
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Ejecución % por categoría</p>
          {loading ? <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Cargando...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'left' }}>Categoría</th>
                  {dataMeses.map(m => <th key={`${m.anio}-${m.mes}`} style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'center' }}>{MESES_STR[m.mes-1]}</th>)}
                  <th style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, padding: '4px 6px 8px', textAlign: 'center' }}>Prom.</th>
                </tr>
              </thead>
              <tbody>
                {catGastos.slice(0,8).map(({cat,pres}) => {
                  const pcts = dataMeses.map(m => pres>0?(m.ejCat[cat.id]||0)/pres*100:null)
                  const prom = pcts.filter(Boolean).reduce((s,p,_,a)=>s+p/a.length,0)
                  return (
                    <tr key={cat.id}>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text2)', padding: '3px 6px 3px 0', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nombre}</td>
                      {pcts.map((pct,i) => { const {bg,color}=heatStyle(pct); return <td key={i} style={{ padding: '3px 3px', textAlign: 'center' }}><div style={{ background:bg, color, borderRadius: 5, fontSize: '0.65rem', fontWeight: 700, padding: '3px 4px', fontFamily: 'var(--mono)' }}>{pct!=null?`${pct.toFixed(0)}%`:'—'}</div></td> })}
                      {(() => { const {bg,color}=heatStyle(prom); return <td style={{ padding: '3px 3px', textAlign: 'center' }}><div style={{ background:bg, color, borderRadius: 5, fontSize: '0.65rem', fontWeight: 700, padding: '3px 4px', fontFamily: 'var(--mono)' }}>{prom.toFixed(0)}%</div></td> })()}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 12 }}>
            {[['var(--red)','rgba(247,95,95,0.2)','>100%'],['var(--amber)','rgba(247,180,79,0.18)','80–100%'],['var(--green)','rgba(45,212,160,0.12)','<80%']].map(([c,bg,lbl]) => (
              <span key={lbl} style={{ fontSize: '0.68rem', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:bg }}/><span style={{ color:c }}>{lbl}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div className="card">
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Alertas detectadas</p>
          {loading ? <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Cargando...</p> :
            alertas.length === 0 ? <p style={{ color: 'var(--green)', fontSize: '0.875rem', fontWeight: 500 }}>Sin alertas — presupuesto bajo control</p> :
            alertas.map((a,i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i<alertas.length-1?'1px solid var(--border)':'none', alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.tipo==='red'?'var(--red)':a.tipo==='amber'?'var(--amber)':'var(--accent)', flexShrink: 0, marginTop: 5 }} />
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 2 }}>{a.texto}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{a.sub}</p>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Flujo libre por mes */}
      <div className="card">
        <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 14 }}>Flujo libre — últimos 4 meses</p>
        {loading ? <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Cargando...</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {dataMeses.map(m => {
              const color = m.flujo>=0?'var(--green)':'var(--red)'
              const maxAbs = Math.max(...dataMeses.map(x=>Math.abs(x.flujo)),1)
              return (
                <div key={`${m.anio}-${m.mes}`} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>{MESES_STR[m.mes-1]} {m.anio}</p>
                  <p className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color, marginBottom: 3 }}>{K(m.flujo)}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)', marginBottom: 8 }}>{m.flujo>=0?'superávit':'déficit'}</p>
                  <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(Math.abs(m.flujo)/maxAbs*100,100)}%`, height: '100%', background: color, borderRadius: 3 }} />
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
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    const init = {}; for (const c of conceptos) init[c.id] = c.monto_presupuestado!=null?String(c.monto_presupuestado):''
    setValores(init)
  }, [conceptos])

  const catMap  = {}; for (const c of categorias) catMap[c.id] = c
  const factor  = c => ({ Mensual:1, Bimensual:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 }[c.periodicidad] || 1)
  const mensual = c => (parseFloat(valores[c.id])||0)*factor(c)

  let totIng=0,totGas=0,totAho=0
  for (const c of conceptos) {
    const cat=catMap[c.categoria_id]; if (!cat) continue
    const m=mensual(c)
    if (cat.tipo==='Ingreso') totIng+=m
    else if (cat.tipo==='Gasto') totGas+=m
    else if (cat.tipo==='Ahorro/Inversión') totAho+=m
  }
  const margen = totIng-totGas-totAho

  async function guardar() {
    setSaving(true); setSaved(false)
    await Promise.all(conceptos.map(c => {
      const v = parseFloat(valores[c.id])
      return supabase.from('conceptos').update({ monto_presupuestado: isNaN(v)?null:v }).eq('id',c.id).eq('user_id',user.id)
    }))
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500); onRefresh?.()
  }

  const tipoColor = { 'Ingreso':'var(--green)', 'Gasto':'var(--red)', 'Ahorro/Inversión':'var(--amber)' }
  const TIPO_ORDER = ['Ingreso','Gasto','Ahorro/Inversión']
  const grupos = {}
  for (const c of conceptos) {
    const cat=catMap[c.categoria_id]; if (!cat) continue
    const key=`${cat.tipo}__${cat.id}`
    if (!grupos[key]) grupos[key]={cat,tipo:cat.tipo,items:[]}
    grupos[key].items.push(c)
  }
  const gruposOrdenados = TIPO_ORDER.flatMap(tipo =>
    Object.values(grupos).filter(g=>g.tipo===tipo).sort((a,b)=>a.cat.nombre.localeCompare(b.cat.nombre))
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 3 }}>Editor de presupuesto</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>Ajusta los montos planeados · aplican a todos los meses</p>
        </div>
        <button onClick={guardar} disabled={saving} style={{ background: saved?'var(--green)':'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '0.875rem', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.2s' }}>
          {saving?'Guardando...':saved?'✓ Guardado':'Guardar cambios'}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[{lbl:'Ingresos',val:totIng,color:'var(--green)'},{lbl:'Gastos',val:totGas,color:'var(--red)'},{lbl:'Ahorro',val:totAho,color:'var(--amber)'}].map(k => (
          <div key={k.lbl} className="card card-sm">
            <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 6 }}>{k.lbl}</p>
            <p className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: k.color }}>{K(k.val)}</p>
          </div>
        ))}
      </div>

      {/* Semáforo balance */}
      <div style={{ background: margen>=0?'rgba(45,212,160,0.06)':'rgba(247,95,95,0.08)', border: `1px solid ${margen>=0?'rgba(45,212,160,0.2)':'rgba(247,95,95,0.2)'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: margen>=0?'var(--green)':'var(--red)', marginBottom: 3 }}>{margen>=0?'Presupuesto balanceado':'Presupuesto en déficit'}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{margen>=0?'Ingresos cubren gastos y ahorro':'Los gastos y ahorro superan los ingresos'}</p>
        </div>
        <p className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: margen>=0?'var(--green)':'var(--red)' }}>{margen>=0?'+':''}{K(margen)}</p>
      </div>

      {/* Tabla editable */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><TH>Concepto</TH><TH right>Periodicidad</TH><TH right>Monto base</TH><TH right>Equiv. mensual</TH></tr></thead>
          <tbody>
            {gruposOrdenados.map(({cat,tipo,items}) => {
              const color = tipoColor[tipo]||'var(--text2)'
              const totMens = items.reduce((s,c)=>s+mensual(c),0)
              return [
                <tr key={`cat-${cat.id}`} style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>▸ {cat.nombre} <span style={{ color, marginLeft: 4 }}>({tipo})</span></td>
                </tr>,
                ...items.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '7px 14px 7px 28px', fontSize: '0.82rem', color: 'var(--text2)' }}>
                      {c.nombre}
                      {c.fijo_variable==='F' && <span style={{ fontSize: '0.68rem', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>Fijo</span>}
                    </td>
                    <TD right muted small>{c.periodicidad}</TD>
                    <td style={{ padding: '5px 14px', textAlign: 'right' }}>
                      <input type="number" min="0" step="1000" value={valores[c.id]??''} onChange={e=>setValores(p=>({...p,[c.id]:e.target.value}))}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', fontFamily: 'var(--mono)', color: 'var(--text)', textAlign: 'right', width: 130, outline: 'none' }}
                        onFocus={e=>e.target.style.borderColor='var(--accent)'}
                        onBlur={e=>e.target.style.borderColor='var(--border2)'} />
                    </td>
                    <TD right mono small color={color}>{K(mensual(c))}</TD>
                  </tr>
                )),
                <tr key={`tot-${cat.id}`} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '7px 14px 7px 20px', fontSize: '0.78rem', fontWeight: 600 }}>Total {cat.nombre}</td>
                  <TD right mono small bold color={color}>{K(totMens)}</TD>
                </tr>
              ]
            })}
            <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border2)' }}>
              <td colSpan={3} style={{ padding: '11px 14px', fontSize: '0.875rem', fontWeight: 700 }}>TOTAL COMPROMETIDO (Gastos + Ahorro)</td>
              <TD right mono bold color="var(--red)">{K(totGas+totAho)}</TD>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── VISTA 4: Reporte de Tarjetas de Crédito ──────────────────
function VistaTarjetasReporte() {
  const { user } = useAuth()
  const [loading,  setLoading]  = useState(true)
  const [meses,    setMeses]    = useState([])  // [{label, cuotas_total, num_deudas}]
  const [resumen,  setResumen]  = useState([])  // por tarjeta

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: tarjetas } = await supabase
        .from('tarjetas_credito').select('id, nombre').eq('user_id', user.id)
      const { data: deudas } = await supabase
        .from('deudas_tc').select('id, tarjeta_id, descripcion, cuotas_totales, cuotas_pagadas, cuota_mes, saldo_pendiente')
        .eq('user_id', user.id)

      if (!deudas || deudas.length === 0) { setMeses([]); setResumen([]); setLoading(false); return }

      // Proyección mes a mes de los próximos 12 meses
      const now = new Date()
      const mesesData = []
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const label = d.toLocaleString('es-CO', { month: 'short', year: '2-digit' })
        let cuotas_total = 0
        let num_deudas   = 0
        for (const deu of deudas) {
          const pagadas   = deu.cuotas_pagadas || 0
          const totales   = deu.cuotas_totales || 1
          const cuotaMes  = Number(deu.cuota_mes) || 0
          const restantes = totales - pagadas
          if (restantes > i) {   // en el mes i aún hay cuota
            cuotas_total += cuotaMes
            num_deudas++
          }
        }
        mesesData.push({ label, cuotas_total, num_deudas })
      }
      setMeses(mesesData)

      // Resumen por tarjeta
      const tcMap = {}
      for (const t of tarjetas || []) tcMap[t.id] = { nombre: t.nombre, saldo: 0, cuota_mes: 0, deudas: 0 }
      for (const d of deudas) {
        if (!tcMap[d.tarjeta_id]) continue
        tcMap[d.tarjeta_id].saldo    += Number(d.saldo_pendiente) || 0
        tcMap[d.tarjeta_id].cuota_mes+= Number(d.cuota_mes)       || 0
        tcMap[d.tarjeta_id].deudas++
      }
      setResumen(Object.values(tcMap))
      setLoading(false)
    }
    load()
  }, [user.id])

  const COP = v => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v)
  const maxCuota = Math.max(...meses.map(m => m.cuotas_total), 1)
  const maxDeudas = Math.max(...meses.map(m => m.num_deudas), 1)

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'var(--text2)' }}>Cargando...</div>

  if (meses.length === 0) return (
    <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--text2)' }}>
      <p style={{ fontSize:'1rem', marginBottom:8 }}>Sin deudas registradas</p>
      <p style={{ fontSize:'0.82rem' }}>Ve a Config → Tarjetas de crédito para agregar tus deudas.</p>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <h2 style={{ fontSize:'1.1rem', marginBottom:3 }}>Proyección tarjetas de crédito</h2>
        <p style={{ color:'var(--text2)', fontSize:'0.82rem' }}>Cuotas mensuales y número de deudas activas — próximos 12 meses</p>
      </div>

      {/* KPIs resumen por tarjeta */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
        {resumen.map((tc,i) => (
          <div key={i} className="card card-sm">
            <p style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text3)', marginBottom:4 }}>{tc.nombre}</p>
            <p className="mono" style={{ fontSize:'1rem', fontWeight:700, color:'var(--red)', marginBottom:2 }}>{COP(tc.saldo)}</p>
            <p style={{ fontSize:'0.72rem', color:'var(--text2)' }}>Cuota mes: {COP(tc.cuota_mes)}</p>
            <p style={{ fontSize:'0.72rem', color:'var(--text3)' }}>{tc.deudas} deuda{tc.deudas!==1?'s':''}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de barras + línea */}
      <div className="card">
        <p style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text3)', marginBottom:16 }}>
          Cuotas por mes (barras) · N° deudas activas (línea)
        </p>
        <div style={{ position:'relative', height:220, display:'flex', alignItems:'flex-end', gap:6, paddingBottom:24 }}>
          {/* Línea de deudas — SVG overlay */}
          <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'calc(100% - 24px)', overflow:'visible', pointerEvents:'none' }}>
            {meses.map((m, i) => {
              const totalBars = meses.length
              const barW = 100 / totalBars
              const cx = (barW * i + barW / 2)
              const cy = 100 - (m.num_deudas / maxDeudas) * 90
              return (
                <g key={i}>
                  {i > 0 && (
                    <line
                      x1={`${(barW*(i-1)+barW/2)}%`}
                      y1={`${100 - (meses[i-1].num_deudas/maxDeudas)*90}%`}
                      x2={`${cx}%`}
                      y2={`${cy}%`}
                      stroke="var(--amber)" strokeWidth="2" strokeDasharray="4 2"
                    />
                  )}
                  <circle cx={`${cx}%`} cy={`${cy}%`} r="4" fill="var(--amber)" />
                  <text x={`${cx}%`} y={`${cy-8}%`} textAnchor="middle" fontSize="9" fill="var(--amber)" fontFamily="var(--mono)">{m.num_deudas}</text>
                </g>
              )
            })}
          </svg>
          {/* Barras */}
          {meses.map((m, i) => {
            const pct = maxCuota > 0 ? (m.cuotas_total / maxCuota) * 190 : 0
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%' }}>
                <div title={COP(m.cuotas_total)} style={{ width:'80%', height: pct, background:'rgba(79,142,247,0.55)', borderRadius:'4px 4px 0 0', minHeight: m.cuotas_total>0?2:0, transition:'height 0.3s' }} />
              </div>
            )
          })}
        </div>
        {/* Eje X — labels */}
        <div style={{ display:'flex', gap:6 }}>
          {meses.map((m,i) => (
            <div key={i} style={{ flex:1, textAlign:'center', fontSize:'0.6rem', color:'var(--text3)', fontWeight:600 }}>{m.label}</div>
          ))}
        </div>
        {/* Leyenda */}
        <div style={{ display:'flex', gap:16, marginTop:14 }}>
          <span style={{ fontSize:'0.72rem', color:'var(--text3)', display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ display:'inline-block', width:12, height:12, borderRadius:2, background:'rgba(79,142,247,0.55)' }}/> Cuotas del mes
          </span>
          <span style={{ fontSize:'0.72rem', color:'var(--amber)', display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ display:'inline-block', width:12, height:3, background:'var(--amber)', borderRadius:2 }}/> N° deudas activas
          </span>
        </div>
      </div>

      {/* Tabla detalle mensual */}
      <div className="card" style={{ padding:0, overflow:'hidden', marginTop:14 }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <TH>Mes</TH>
              <TH right>Cuota total</TH>
              <TH right>Deudas activas</TH>
            </tr>
          </thead>
          <tbody>
            {meses.map((m,i) => (
              <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                <TD>{m.label}</TD>
                <TD right mono color="var(--accent)">{COP(m.cuotas_total)}</TD>
                <TD right>{m.num_deudas} deuda{m.num_deudas!==1?'s':''}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL REPORTES ─────────────────────────────────
export default function ReportesPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [vista,      setVista]      = useState('analisis')
  const [categorias, setCategorias] = useState([])
  const [conceptos,  setConceptos]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  async function loadBase() {
    setLoading(true)
    const [{ data: cats }, { data: cons }] = await Promise.all([
      supabase.from('categorias').select('id, nombre, tipo').eq('user_id', user.id),
      supabase.from('conceptos').select('id, nombre, categoria_id, periodicidad, monto_presupuestado, fijo_variable, activo').eq('user_id', user.id).eq('activo', true).order('nombre'),
    ])
    setCategorias(cats||[]); setConceptos(cons||[]); setLoading(false)
  }

  useEffect(() => { loadBase() }, [user.id, refreshKey])

  const TABS = [
    { id: 'analisis', label: 'Análisis mensual' },
    { id: 'radar',    label: 'Radar histórico'  },
    { id: 'editor',   label: 'Editor presupuesto'},
    { id: 'tarjetas', label: 'Tarjetas de crédito'},
  ]

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header de seguimiento */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, height: 56 }}>
          {/* Volver */}
          <button onClick={() => navigate('/')}
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 12px', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Registro
          </button>
          {/* Título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m0 0a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14"/></svg>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Seguimiento financiero</span>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setVista(t.id)}
                style={{ background: vista===t.id?'var(--bg3)':'none', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600, color: vista===t.id?'var(--accent)':'var(--text2)', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.5rem 3rem' }}>
        {loading ? (
          [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 12 }} />)
        ) : (
          <>
            {vista==='analisis' && <VistaAnalisis categorias={categorias} conceptos={conceptos} />}
            {vista==='radar'    && <VistaRadar    categorias={categorias} conceptos={conceptos} />}
            {vista==='editor'   && <VistaEditor   categorias={categorias} conceptos={conceptos} onRefresh={()=>setRefreshKey(k=>k+1)} />}
            {vista==='tarjetas' && <VistaTarjetasReporte />}
          </>
        )}
      </div>
    </div>
  )
}
