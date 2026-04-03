import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCompact } from '../lib/utils'

export default function MetasPage() {
  const { user } = useAuth()
  const [metas, setMetas]     = useState([])
  const [loading, setLoading] = useState(true)
  // FIX #11: un solo estado de edición en vez de dos
  const [editMode, setEditMode] = useState(null) // { id, campo: 'actual'|'meta' }
  const [editVal, setEditVal]   = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [formAdd, setFormAdd]   = useState({ nombre: '', valor_meta: '' })
  const [saving, setSaving]     = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('metas').select('*')
      .eq('user_id', user.id).eq('activo', true).order('nombre')
    setMetas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  function abrirEdicion(id, campo, valorActual) {
    setEditMode({ id, campo })
    // FIX #9: no usar replace en inputs tipo number — usar el valor directo
    setEditVal(String(valorActual))
  }

  async function guardarEdicion() {
    if (!editMode) return
    // FIX #9: parseFloat directo sin replace
    const v = parseFloat(editVal)
    if (isNaN(v) || v < 0) return
    setSaving(true)
    const campo = editMode.campo === 'actual' ? 'valor_actual' : 'valor_meta'
    await supabase.from('metas')
      .update({ [campo]: v, updated_at: new Date().toISOString() })
      .eq('id', editMode.id).eq('user_id', user.id)
    setSaving(false); setEditMode(null); setEditVal(''); load()
  }

  async function crearMeta(e) {
    e.preventDefault()
    // FIX #9: parseFloat directo
    const v = parseFloat(formAdd.valor_meta)
    if (!formAdd.nombre.trim() || isNaN(v) || v <= 0) return
    setSaving(true)
    await supabase.from('metas').insert({
      user_id: user.id, nombre: formAdd.nombre.trim(), valor_meta: v, valor_actual: 0
    })
    setSaving(false); setShowAdd(false); setFormAdd({ nombre: '', valor_meta: '' }); load()
  }

  async function eliminarMeta(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').update({ activo: false }).eq('id', id).eq('user_id', user.id)
    load()
  }

  const COLORS = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--green2)']
  const totalMeta   = metas.reduce((s,m) => s + Number(m.valor_meta), 0)
  const totalActual = metas.reduce((s,m) => s + Number(m.valor_actual), 0)
  const totalPct    = totalMeta > 0 ? (totalActual / totalMeta) * 100 : 0

  function EditInline({ metaId, campo, valor }) {
    const isEditing = editMode?.id === metaId && editMode?.campo === campo
    if (isEditing) return (
      <div style={{ display: 'flex', gap: 4 }}>
        <input className="input" type="number" min="0" step="1000"
          value={editVal} onChange={e => setEditVal(e.target.value)}
          autoFocus style={{ padding: '3px 8px', fontSize: '0.85rem', fontFamily: 'var(--mono)' }} />
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={guardarEdicion}>OK</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(null)}>×</button>
      </div>
    )
    return (
      <p className="mono" style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
        color: campo === 'actual' ? 'var(--accent)' : 'var(--text)' }}
        onClick={() => abrirEdicion(metaId, campo, valor)}>
        {formatCompact(valor)} <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>✎</span>
      </p>
    )
  }

  return (
    <div className="page animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Metas financieras</h1>
          <p>Progreso hacia tu libertad financiera</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Meta</button>
      </div>

      {/* Resumen global */}
      <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text2)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Capital acumulado total</p>
        <p className="mono" style={{ fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--green)' }}>{formatCompact(totalActual)}</p>
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginTop: 4 }}>Meta: {formatCompact(totalMeta)} · {totalPct.toFixed(1)}%</p>
        <div className="progress-bar" style={{ marginTop: 10 }}>
          <div className="progress-fill" style={{ width: `${Math.min(totalPct,100)}%`, background: 'var(--green)' }} />
        </div>
      </div>

      {loading ? (
        [1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 130, marginBottom: 10, borderRadius: 12 }} />)
      ) : metas.map((m, idx) => {
        const pct      = m.valor_meta > 0 ? Math.min((m.valor_actual / m.valor_meta) * 100, 100) : 0
        const faltante = Math.max(Number(m.valor_meta) - Number(m.valor_actual), 0)
        const color    = COLORS[idx % COLORS.length]

        return (
          <div key={m.id} className="card" style={{ marginBottom: '0.75rem', borderLeft: `3px solid ${color}` }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
              <h3 style={{ fontSize: '0.95rem' }}>{m.nombre}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 50 ? 'badge-blue' : 'badge-amber'}`}>
                  {pct.toFixed(1)}%
                </span>
                <button onClick={() => eliminarMeta(m.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px' }}>✕</button>
              </div>
            </div>

            <div className="progress-bar" style={{ marginBottom: 10 }}>
              <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
            </div>

            <div className="grid-2" style={{ marginBottom: faltante > 0 ? 10 : 0 }}>
              <div>
                <p style={{ fontSize: '0.68rem', color: 'var(--text2)', marginBottom: 4 }}>Acumulado</p>
                <EditInline metaId={m.id} campo="actual" valor={Number(m.valor_actual)} />
              </div>
              <div>
                <p style={{ fontSize: '0.68rem', color: 'var(--text2)', marginBottom: 4 }}>Objetivo</p>
                <EditInline metaId={m.id} campo="meta" valor={Number(m.valor_meta)} />
              </div>
            </div>

            {faltante > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                Falta: <strong style={{ color: 'var(--text)' }}>{formatCompact(faltante)}</strong>
              </p>
            )}
          </div>
        )
      })}

      {/* FIX #10: modal con paddingBottom para no tapar con nav */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-handle" />
            <h2>Nueva meta</h2>
            <form onSubmit={crearMeta} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Nombre</label>
                <input className="input" required placeholder="Ej: Carro, Vacaciones..."
                  value={formAdd.nombre} onChange={e => setFormAdd(p => ({ ...p, nombre: e.target.value }))} autoFocus />
              </div>
              <div className="input-group">
                <label>Valor objetivo (COP)</label>
                <input className="input" required type="number" min="1" placeholder="0"
                  value={formAdd.valor_meta} onChange={e => setFormAdd(p => ({ ...p, valor_meta: e.target.value }))}
                  style={{ fontFamily: 'var(--mono)', fontSize: '1.1rem' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }}
                  onClick={() => setShowAdd(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                  disabled={saving}>{saving ? 'Guardando...' : 'Crear meta'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
