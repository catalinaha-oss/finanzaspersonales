import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function TarjetaModal({ onClose, onSaved, editData }) {
  const { user } = useAuth()

  const [nombre,         setNombre]         = useState('')
  const [fechaCorte,     setFechaCorte]     = useState('')
  const [ultimosDigitos, setUltimosDigitos] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (editData) {
      setNombre(editData.nombre || '')
      setFechaCorte(editData.fecha_corte != null ? String(editData.fecha_corte) : '')
      setUltimosDigitos(editData.ultimos_digitos || '')
    }
  }, [editData])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    const fc = Number(fechaCorte)
    if (!fechaCorte || isNaN(fc) || fc < 1 || fc > 31) { setError('Fecha de corte debe ser entre 1 y 31'); return }

    setSaving(true)
    const payload = {
      user_id:         user.id,
      nombre:          nombre.trim(),
      fecha_corte:     fc,
      ultimos_digitos: ultimosDigitos.trim() || null,
    }
    const { error: err } = editData
      ? await supabase.from('tarjetas_credito').update(payload).eq('id', editData.id).eq('user_id', user.id)
      : await supabase.from('tarjetas_credito').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2>{editData ? 'Editar tarjeta' : 'Nueva tarjeta de crédito'}</h2>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.9rem' }}>
          <div className="input-group">
            <label>Nombre *</label>
            <input className="input" placeholder="Ej: CMR Falabella, Visa Bancolombia..."
              value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
          </div>

          <div className="grid-2">
            <div className="input-group">
              <label>Día de corte * (1–31)</label>
              <input className="input" type="number" min="1" max="31" placeholder="Ej: 19"
                value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
                style={{ fontFamily:'var(--mono)' }} />
            </div>
            <div className="input-group">
              <label>Últimos 4 dígitos</label>
              <input className="input" type="text" maxLength={4} placeholder="3296"
                value={ultimosDigitos} onChange={e => setUltimosDigitos(e.target.value.replace(/\D/g,''))}
                style={{ fontFamily:'var(--mono)', letterSpacing:'0.15em' }} />
            </div>
          </div>

          {error && (
            <div style={{ background:'rgba(247,95,95,0.12)', border:'1px solid rgba(247,95,95,0.3)', borderRadius:8, padding:'0.6rem 0.9rem', color:'var(--red)', fontSize:'0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary w-full" style={{ justifyContent:'center' }} disabled={saving}>
              {saving ? 'Guardando...' : editData ? 'Guardar cambios' : 'Crear tarjeta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
