import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, formatCompact, currentYearMonth, monthLabel, dateLabel, getUpcomingAlerts, getCatColor } from '../lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Dashboard({ refresh }) {
  const { user } = useAuth()
  const { anio, mes } = currentYearMonth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts]   = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const firstDay = `${anio}-${String(mes).padStart(2,'0')}-01`
    const lastDay  = new Date(anio, mes, 0).toISOString().split('T')[0]

    const [{ data: txs }, { data: conceptos }, { data: metas }, { data: presupuesto }] = await Promise.all([
      supabase.from('transacciones').select('*, conceptos(nombre, categorias(nombre,tipo))')
        .eq('user_id', user.id).gte('fecha', firstDay).lte('fecha', lastDay),
      supabase.from('conceptos').select('*, categorias(nombre,tipo)').eq('user_id', user.id).eq('activo', true),
      supabase.from('metas').select('*').eq('user_id', user.id).eq('activo', true),
      supabase.from('presupuesto_mes').select('*, conceptos(nombre, monto_presupuestado)')
        .eq('user_id', user.id).eq('anio', anio).eq('mes', mes)
    ])

    // Totales del mes
    const ingresos = txs?.filter(t => t.tipo_movimiento === 'ingreso').reduce((s, t) => s + Number(t.valor), 0) || 0
    const gastos   = txs?.filter(t => t.tipo_movimiento === 'gasto').reduce((s, t) => s + Number(t.valor), 0) || 0
    const ahorro   = txs?.filter(t => t.tipo_movimiento === 'ahorro').reduce((s, t) => s + Number(t.valor), 0) || 0

    // Presupuesto vs real por categoría (top 6)
    const catMap = {}
    for (const t of txs || []) {
      if (t.tipo_movimiento !== 'gasto') continue
      const cat = t.conceptos?.categorias?.nombre || 'Sin categoría'
      catMap[cat] = (catMap[cat] || 0) + Number(t.valor)
    }
    const catData = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([nombre, real]) => ({ nombre, real }))

    // Presupuesto total del mes usando monto_presupuestado de conceptos
    const presupuestoTotal = conceptos
      ?.filter(c => c.categorias?.tipo === 'Gasto')
      .reduce((s, c) => {
        const factor = { Mensual: 1, Bimensual: 0.5, Trimestral: 1/3, Semestral: 1/6, Anual: 1/12 }[c.periodicidad] || 1
        return s + (Number(c.monto_presupuestado) || 0) * factor
      }, 0) || 0

    // Alertas próximas
    const upcoming = getUpcomingAlerts(conceptos || [])
    setAlerts(upcoming)

    // Últimas 5 transacciones
    const recientes = (txs || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5)

    setData({ ingresos, gastos, ahorro, flujo: ingresos - gastos - ahorro, catData, presupuestoTotal, metas: metas || [], recientes })
    setLoading(false)
  }, [user.id, anio, mes])

  useEffect(() => { load() }, [load, refresh])

  if (loading) return (
    <div className="page">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 12, borderRadius: 12 }} />)}
    </div>
  )

  const { ingresos, gastos, ahorro, flujo, catData, presupuestoTotal, metas, recientes } = data
  const ejecutadoPct = presupuestoTotal > 0 ? Math.min((gastos / presupuestoTotal) * 100, 100) : 0

  return (
    <div className="page animate-in">
      {/* Header */}
      <div className="page-header">
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 2 }}>{monthLabel(anio, mes)}</p>
        <h1>Resumen financiero</h1>
      </div>

      {/* Flujo de caja */}
      <div className="card" style={{ marginBottom: '0.75rem', background: flujo >= 0 ? 'rgba(45,212,160,0.08)' : 'rgba(247,95,95,0.08)', borderColor: flujo >= 0 ? 'rgba(45,212,160,0.2)' : 'rgba(247,95,95,0.2)' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Flujo del mes</p>
        <p className="mono" style={{ fontSize: '2.2rem', fontWeight: 600, color: flujo >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
          {formatCOP(flujo)}
        </p>
        <p style={{ color: 'var(--text2)', fontSize: '0.8rem', marginTop: 4 }}>
          Ingresos: <strong style={{ color: 'var(--green)' }}>{formatCompact(ingresos)}</strong>
          {' · '}Gastos: <strong style={{ color: 'var(--red)' }}>{formatCompact(gastos)}</strong>
          {' · '}Ahorro: <strong style={{ color: 'var(--amber)' }}>{formatCompact(ahorro)}</strong>
        </p>
      </div>

      {/* Presupuesto */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Presupuesto del mes</p>
            <p style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>
              {formatCompact(gastos)} de {formatCompact(presupuestoTotal)}
            </p>
          </div>
          <span className={`badge ${ejecutadoPct > 90 ? 'badge-red' : ejecutadoPct > 70 ? 'badge-amber' : 'badge-green'}`}>
            {ejecutadoPct.toFixed(0)}%
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{
            width: `${ejecutadoPct}%`,
            background: ejecutadoPct > 90 ? 'var(--red)' : ejecutadoPct > 70 ? 'var(--amber)' : 'var(--green)'
          }} />
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem', borderColor: 'rgba(247,180,79,0.25)', background: 'rgba(247,180,79,0.06)' }}>
          <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
            {alerts.length} pago{alerts.length > 1 ? 's' : ''} próximo{alerts.length > 1 ? 's' : ''}
          </p>
          {alerts.slice(0, 3).map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < Math.min(alerts.length, 3) - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: '0.875rem' }}>{a.concepto.nombre}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 600 }}>
                {a.dias === 0 ? 'Hoy' : a.dias === 1 ? 'Mañana' : `En ${a.dias} días`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Gasto por categoría */}
      {catData.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontWeight: 600, marginBottom: 14 }}>Gastos por categoría</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={catData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: 'var(--text2)' }}
                tickFormatter={v => v.length > 8 ? v.slice(0,8)+'…' : v} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : `${(v/1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={v => formatCOP(v)}
                labelStyle={{ color: 'var(--text)', fontWeight: 600 }} />
              <Bar dataKey="real" radius={[4,4,0,0]}>
                {catData.map((entry, i) => <Cell key={i} fill={getCatColor(entry.nombre)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Metas */}
      {metas.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Metas financieras</p>
          {metas.map(m => {
            const pct = m.valor_meta > 0 ? Math.min((m.valor_actual / m.valor_meta) * 100, 100) : 0
            return (
              <div key={m.id} style={{ marginBottom: 14 }}>
                <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{m.nombre}</span>
                  <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                    {formatCompact(m.valor_actual)} / {formatCompact(m.valor_meta)}
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} />
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>{pct.toFixed(1)}% completado</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Últimas transacciones */}
      {recientes.length > 0 && (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Últimos movimientos</p>
          {recientes.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 0', borderBottom: i < recientes.length - 1 ? '1px solid var(--border)' : 'none'
            }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {t.conceptos?.nombre || t.observaciones || 'Sin concepto'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                  {dateLabel(t.fecha)} · {t.conceptos?.categorias?.nombre || '—'}
                </p>
              </div>
              <span className="mono" style={{
                fontWeight: 600, fontSize: '0.9rem',
                color: t.tipo_movimiento === 'ingreso' ? 'var(--green)' : t.tipo_movimiento === 'ahorro' ? 'var(--amber)' : 'var(--red)'
              }}>
                {t.tipo_movimiento === 'gasto' ? '-' : '+'}{formatCompact(t.valor)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
