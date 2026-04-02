import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCOP, formatCompact, formatPct, today } from '../lib/utils'

export default function InversionesPage() {
  const { user } = useAuth()
  const [inversiones, setInversiones]   = useState([])
  const [valorMercado, setValorMercado] = useState({})
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [showUpdate, setShowUpdate]     = useState(null)
  const [newValor, setNewValor]         = useState('')
  const [form, setForm] = useState({ nombre_activo: '', ticker: '', tipo_activo: 'Acciones', cuenta: '', moneda: 'USD', actualizacion: 'manual' })

  async function load() {
    setLoading(true)
    const { data: invs } = await supabase.from('inversiones').select(`
      *, movimientos_inversion(valor_cop, tipo)
    `).eq('user_id', user.id).eq('activo', true)

    const { data: vm } = await supabase.from('valor_mercado').select('*')
      .eq('user_id', user.id).order('fecha_consulta', { ascending: false })

    const vmMap = {}
    for (const v of vm || []) {
      if (!vmMap[v.inversion_id]) vmMap[v.inversion_id] = v
    }
    setInversiones(invs || [])
    setValorMercado(vmMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  function totalAportado(inv) {
    return (inv.movimientos_inversion || []).reduce((s, m) =>
      m.tipo === 'aporte' ? s + Number(m.valor_cop) : s - Number(m.valor_cop), 0)
  }

  async function saveActivo(e) {
    e.preventDefault()
    await supabase.from('inversiones').insert({ ...form, user_id: user.id })
    setShowAdd(false)
    setForm({ nombre_activo: '', ticker: '', tipo_activo: 'Acciones', cuenta: '', moneda: 'USD', actualizacion: 'manual' })
    load()
  }

  async function updateValorMercado(invId) {
    const v = parseFloat(newValor.replace(/\./g,'').replace(',','.'))
    if (isNaN(v)) return
    await supabase.from('valor_mercado').insert({
      user_id: user.id, inversion_id: invId,
      fecha_consulta: today(), valor_actual_cop: v, origen: 'manual'
    })
    setShowUpdate(null); setNewValor(''); load()
  }

  const totalAportadoTotal = inversiones.reduce((s, inv) => s + totalAportado(inv), 0)
  const totalActualTotal   = inversiones.reduce((s, inv) => s + Number(valorMercado[inv.id]?.valor_actual_cop || 0), 0)
  const roiTotal = totalAportadoTotal > 0 ? ((totalActualTotal - totalAportadoTotal) / totalAportadoTotal) * 100 : 0

  const TIPO_COLORS = { Acciones: 'var(--accent)', Cripto: 'var(--amber)', Fondo: 'var(--green)', Inmueble: 'var(--purple)', CDT: 'var(--green2)', Otro: 'var(--text2)' }

  return (
    <div className="page animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Portafolio</h1>
          <p>Seguimiento de inversiones</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Activo</button>
      </div>

      {/* Resumen portafolio */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="grid-3" style={{ textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Aportado</p>
            <p className="mono" style={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatCompact(totalAportadoTotal)}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Valor actual</p>
            <p className="mono" style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--green)' }}>{formatCompact(totalActualTotal)}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>ROI total</p>
            <p className="mono" style={{ fontWeight: 600, fontSize: '0.95rem', color: roiTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatPct(roiTotal)}</p>
          </div>
        </div>
      </div>

      {/* Lista de activos */}
      {loading ? (
        [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 110, marginBottom: 10, borderRadius: 12 }} />)
      ) : inversiones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📈</p>
          <p>Agrega tu primer activo</p>
        </div>
      ) : inversiones.map(inv => {
        const aportado = totalAportado(inv)
        const vm = valorMercado[inv.id]
        const actual = Number(vm?.valor_actual_cop || 0)
        const roi = aportado > 0 ? ((actual - aportado) / aportado) * 100 : null
        const color = TIPO_COLORS[inv.tipo_activo] || 'var(--text2)'

        return (
          <div key={inv.id} className="card" style={{ marginBottom: '0.75rem', borderLeft: `3px solid ${color}` }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>{inv.nombre_activo}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                  {inv.ticker && <><strong>{inv.ticker}</strong> · </>}
                  {inv.tipo_activo} · {inv.cuenta || '—'}
                </p>
              </div>
              <span className="badge" style={{ background: `${color}20`, color }}>
                {inv.moneda}
              </span>
            </div>

            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: 2 }}>Aportado</p>
                <p className="mono" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{formatCompact(aportado)}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: 2 }}>Actual</p>
                <p className="mono" style={{ fontSize: '0.85rem', fontWeight: 500, color: actual > 0 ? 'var(--green)' : 'var(--text2)' }}>
                  {actual > 0 ? formatCompact(actual) : '—'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: 2 }}>ROI</p>
                <p className="mono" style={{ fontSize: '0.85rem', fontWeight: 500, color: roi == null ? 'var(--text2)' : roi >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {roi != null ? formatPct(roi) : '—'}
                </p>
              </div>
            </div>

            {showUpdate === inv.id ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="number" placeholder="Valor actual en COP"
                  value={newValor} onChange={e => setNewValor(e.target.value)}
                  style={{ fontFamily: 'var(--mono)' }} />
                <button className="btn btn-primary btn-sm" onClick={() => updateValorMercado(inv.id)}>OK</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowUpdate(null)}>×</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowUpdate(inv.id); setNewValor('') }}>
                Actualizar valor
              </button>
            )}
          </div>
        )
      })}

      {/* Modal agregar activo */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-handle" />
            <h2>Nuevo activo</h2>
            <form onSubmit={saveActivo} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div className="input-group">
                <label>Nombre del activo</label>
                <input className="input" required placeholder="Ej: Pibank Remunerada"
                  value={form.nombre_activo} onChange={e => setForm(p => ({ ...p, nombre_activo: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Ticker (opcional)</label>
                  <input className="input" placeholder="VOO, BTC..."
                    value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Tipo</label>
                  <select className="input" value={form.tipo_activo} onChange={e => setForm(p => ({ ...p, tipo_activo: e.target.value }))}>
                    {['Acciones','Cripto','Fondo','Inmueble','CDT','Otro'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Cuenta / Plataforma</label>
                  <input className="input" placeholder="Tyba, Hapi, Nu..."
                    value={form.cuenta} onChange={e => setForm(p => ({ ...p, cuenta: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Moneda</label>
                  <select className="input" value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))}>
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={() => setShowAdd(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
