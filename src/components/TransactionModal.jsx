import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { today } from '../lib/utils'

export default function TransactionModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [conceptos, setConceptos]   = useState([])
  const [categorias, setCategorias] = useState([])
  const [metas, setMetas]           = useState([])
  const [catFilter, setCatFilter]   = useState('')
  const [form, setForm] = useState({
    concepto_id: '', meta_id: '', fecha: today(), valor: '',
    tipo_movimiento: 'gasto', medio_pago: 'débito', observaciones: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: cons }, { data: mts }] = await Promise.all([
        supabase.from('categorias').select('*').eq('user_id', user.id).order('tipo').order('nombre'),
        supabase.from('conceptos').select('*, categorias(nombre,tipo)').eq('user_id', user.id).eq('activo', true),
        supabase.from('metas').select('*').eq('user_id', user.id).eq('activo', true).order('nombre'),
      ])
      setCategorias(cats || [])
      setConceptos(cons || [])
      setMetas(mts || [])
    }
    load()
  }, [user.id])

  const tipoActual = form.tipo_movimiento

  // Filtrar categorías según el tipo de movimiento
  const categoriasFiltradas = categorias.filter(c => {
    if (tipoActual === 'ingreso')      return c.tipo === 'Ingreso'
    if (tipoActual === 'ahorro')       return false  // no aplica, se usan metas
    if (tipoActual === 'gasto')        return c.tipo === 'Gasto'
    return true
  })

  // Filtrar conceptos según categoría y tipo
  const conceptosFiltrados = conceptos.filter(c => {
    const matchCat  = !catFilter || c.categoria_id === catFilter
    const matchTipo = tipoActual === 'ingreso' ? c.categorias?.tipo === 'Ingreso'
      : tipoActual === 'gasto' ? c.categorias?.tipo === 'Gasto'
      : true
    return matchCat && matchTipo
  })

  function setField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Al cambiar tipo, limpiar selecciones
      if (field === 'tipo_movimiento') {
        next.concepto_id = ''
        next.meta_id     = ''
        setCatFilter('')
      }
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.valor || !form.fecha) return
    setSaving(true); setError('')

    const payload = {
      user_id: user.id,
      fecha: form.fecha,
      valor: parseFloat(form.valor),
      tipo_movimiento: form.tipo_movimiento,
      medio_pago: form.medio_pago || null,
      observaciones: form.observaciones || null,
      origen: 'manual',
      concepto_id: null,
    }

    // Si es ahorro, el concepto_id viene de la meta seleccionada como referencia
    if (tipoActual === 'ahorro' && form.meta_id) {
      // Guardar nombre de meta en observaciones si no hay observación manual
      const meta = metas.find(m => m.id === form.meta_id)
      if (meta && !form.observaciones) payload.observaciones = meta.nombre
    } else {
      payload.concepto_id = form.concepto_id || null
    }

    const { error: err } = await supabase.from('transacciones').insert(payload)
    setSaving(false)
    if (err) { setError('Error al guardar. Intenta de nuevo.'); return }
    onSaved?.()
    onClose()
  }

  const TIPOS = [
    { id: 'gasto',   label: 'Gasto',   color: 'var(--red)'   },
    { id: 'ingreso', label: 'Ingreso',  color: 'var(--green)' },
    { id: 'ahorro',  label: 'Ahorro',   color: 'var(--amber)' },
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ paddingBottom: 'calc(1.5rem + var(--nav-h) + var(--safe-bot))' }}>
        <div className="modal-handle" />
        <h2>Registrar movimiento</h2>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {TIPOS.map(t => (
              <button key={t.id} type="button" onClick={() => setField('tipo_movimiento', t.id)}
                style={{
                  padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 700,
                  background: form.tipo_movimiento === t.id ? t.color : 'var(--bg3)',
                  color: form.tipo_movimiento === t.id ? '#fff' : 'var(--text2)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div className="input-group">
            <label>Valor (COP)</label>
            <input className="input" type="number" placeholder="0" min="0"
              value={form.valor} onChange={e => setField('valor', e.target.value)}
              required style={{ fontSize: '1.2rem', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          </div>

          {/* Si es ahorro: selector de meta */}
          {tipoActual === 'ahorro' ? (
            <div className="input-group">
              <label>Meta de ahorro</label>
              <select className="input" value={form.meta_id}
                onChange={e => setField('meta_id', e.target.value)}>
                <option value="">Selecciona una meta</option>
                {metas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          ) : (
            <>
              {/* Categoría filtrada por tipo */}
              <div className="input-group">
                <label>Categoría</label>
                <select className="input" value={catFilter}
                  onChange={e => { setCatFilter(e.target.value); setField('concepto_id', '') }}>
                  <option value="">Todas</option>
                  {categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {/* Concepto */}
              <div className="input-group">
                <label>Concepto</label>
                <select className="input" value={form.concepto_id}
                  onChange={e => setField('concepto_id', e.target.value)}>
                  <option value="">Selecciona un concepto</option>
                  {conceptosFiltrados.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{c.categorias ? ` (${c.categorias.nombre})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Fecha y medio de pago */}
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha</label>
              <input className="input" type="date" value={form.fecha}
                onChange={e => setField('fecha', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Medio de pago</label>
              <select className="input" value={form.medio_pago}
                onChange={e => setField('medio_pago', e.target.value)}>
                <option value="débito">Débito</option>
                <option value="TC">Tarjeta crédito</option>
                <option value="efectivo">Efectivo</option>
                <option value="nómina">Nómina</option>
                <option value="automático">Automático</option>
              </select>
            </div>
          </div>

          {/* Observaciones */}
          <div className="input-group">
            <label>Observaciones (opcional)</label>
            <input className="input" type="text" placeholder="Notas adicionales..."
              value={form.observaciones} onChange={e => setField('observaciones', e.target.value)} />
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost w-full" onClick={onClose}
              style={{ justifyContent: 'center' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary w-full" disabled={saving}
              style={{ justifyContent: 'center' }}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
