import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const COP = v => v == null ? '' : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v)

export default function DeudaModal({ tarjeta, editData, onClose, onSaved }) {
  const { user } = useAuth()

  // ── todos los hooks al inicio ──
  const [descripcion,    setDescripcion]    = useState('')
  const [fechaCompra,    setFechaCompra]    = useState('')
  const [valorTotal,     setValorTotal]     = useState('')
  const [cuotasTotales,  setCuotasTotales]  = useState('')
  const [cuotasPagadas,  setCuotasPagadas]  = useState('')
  const [cuotaMes,       setCuotaMes]       = useState('')
  const [saldoPendiente, setSaldoPendiente] = useState('')
  const [tasaEa,         setTasaEa]         = useState('')
  const [observaciones,  setObservaciones]  = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (editData) {
      setDescripcion(editData.descripcion || '')
      setFechaCompra(editData.fecha_compra || '')
      setValorTotal(editData.valor_total_cop != null ? String(editData.valor_total_cop) : '')
      setCuotasTotales(editData.cuotas_totales != null ? String(editData.cuotas_totales) : '')
      setCuotasPagadas(editData.cuotas_pagadas != null ? String(editData.cuotas_pagadas) : '')
      setCuotaMes(editData.cuota_mes != null ? String(editData.cuota_mes) : '')
      setSaldoPendiente(editData.saldo_pendiente != null ? String(editData.saldo_pendiente) : '')
      setTasaEa(editData.tasa_ea != null ? String(editData.tasa_ea) : '')
      setObservaciones(editData.observaciones || '')
    }
  }, [editData])

  // cuota_actual visual = cuotas_pagadas + 1
  const cuotaActualVisual = cuotasPagadas !== '' ? Number(cuotasPagadas) + 1 : '—'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!descripcion.trim()) { setError('La descripción es obligatoria'); return }

    setSaving(true)
    const payload = {
      user_id:         user.id,
      tarjeta_id:      tarjeta.id,
      descripcion:     descripcion.trim(),
      fecha_compra:    fechaCompra || null,
      valor_total_cop: valorTotal     ? parseFloat(valorTotal)     : null,
      cuotas_totales:  cuotasTotales  ? parseInt(cuotasTotales)    : null,
      cuotas_pagadas:  cuotasPagadas  ? parseInt(cuotasPagadas)    : 0,
      cuota_mes:       cuotaMes       ? parseFloat(cuotaMes)       : null,
      saldo_pendiente: saldoPendiente ? parseFloat(saldoPendiente) : null,
      tasa_ea:         tasaEa         ? parseFloat(tasaEa)         : null,
      observaciones:   observaciones  || null,
    }
    const { error: err } = editData
      ? await supabase.from('deudas_tc').update(payload).eq('id', editData.id).eq('user_id', user.id)
      : await supabase.from('deudas_tc').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const inputStyle = { fontFamily:'var(--mono)' }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:480 }}>
        <div className="modal-handle" />
        <h2 style={{ fontSize:'1rem' }}>{editData ? 'Editar deuda' : `Nueva deuda · ${tarjeta.nombre}`}</h2>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>

          <div className="input-group">
            <label>Descripción *</label>
            <input className="input" placeholder="Ej: AVIANCA SAAZERV8..." value={descripcion}
              onChange={e => setDescripcion(e.target.value)} autoFocus />
          </div>

          <div className="grid-2">
            <div className="input-group">
              <label>Fecha de compra</label>
              <input className="input" type="date" value={fechaCompra}
                onChange={e => setFechaCompra(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Tasa EA (%)</label>
              <input className="input" type="number" step="0.01" placeholder="25.50" value={tasaEa}
                onChange={e => setTasaEa(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div className="grid-2">
            <div className="input-group">
              <label>Valor total (COP)</label>
              <input className="input" type="number" min="0" step="1" placeholder="0" value={valorTotal}
                onChange={e => setValorTotal(e.target.value)} style={inputStyle} />
            </div>
            <div className="input-group">
              <label>Cuota mensual (COP)</label>
              <input className="input" type="number" min="0" step="1" placeholder="0" value={cuotaMes}
                onChange={e => setCuotaMes(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div className="grid-2">
            <div className="input-group">
              <label>Cuotas totales</label>
              <input className="input" type="number" min="1" step="1" placeholder="24" value={cuotasTotales}
                onChange={e => setCuotasTotales(e.target.value)} style={inputStyle} />
            </div>
            <div className="input-group">
              <label>Cuotas pagadas</label>
              <input className="input" type="number" min="0" step="1" placeholder="0" value={cuotasPagadas}
                onChange={e => setCuotasPagadas(e.target.value)} style={inputStyle} />
              {cuotasPagadas !== '' && (
                <p style={{ fontSize:'0.72rem', color:'var(--accent)', marginTop:3 }}>
                  → Cuota actual: {cuotaActualVisual} de {cuotasTotales || '?'}
                </p>
              )}
            </div>
          </div>

          <div className="input-group">
            <label>Saldo pendiente (COP)</label>
            <input className="input" type="number" min="0" step="1" placeholder="0" value={saldoPendiente}
              onChange={e => setSaldoPendiente(e.target.value)} style={{ ...inputStyle, fontSize:'1.1rem', fontWeight:600 }} />
          </div>

          <div className="input-group">
            <label>Observaciones (opcional)</label>
            <input className="input" type="text" placeholder="Notas adicionales..." value={observaciones}
              onChange={e => setObservaciones(e.target.value)} />
          </div>

          {error && (
            <div style={{ background:'rgba(247,95,95,0.12)', border:'1px solid rgba(247,95,95,0.3)', borderRadius:8, padding:'0.6rem 0.9rem', color:'var(--red)', fontSize:'0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary w-full" style={{ justifyContent:'center' }} disabled={saving}>
              {saving ? 'Guardando...' : editData ? 'Guardar cambios' : 'Agregar deuda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
