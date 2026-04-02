import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { today } from '../lib/utils'

export default function TransactionModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [conceptos, setConceptos]     = useState([])
  const [categorias, setCategorias]   = useState([])
  const [catFilter, setCatFilter]     = useState('')
  const [form, setForm] = useState({
    concepto_id: '', fecha: today(), valor: '',
    tipo_movimiento: 'gasto', medio_pago: 'débito', observaciones: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: cons }] = await Promise.all([
        supabase.from('categorias').select('*').order('orden'),
        supabase.from('conceptos').select('*, categorias(nombre,tipo)').eq('user_id', user.id).eq('activo', true)
      ])
      setCategorias(cats || [])
      setConceptos(cons || [])
    }
    load()
  }, [user.id])

  const filteredConceptos = catFilter
    ? conceptos.filter(c => c.categoria_id === catFilter)
    : conceptos

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'concepto_id') {
      const c = conceptos.find(x => x.id === value)
      if (c) {
        const tipo = c.categorias?.tipo === 'Ingreso' ? 'ingreso'
          : c.categorias?.tipo === 'Ahorro/Inversión' ? 'ahorro' : 'gasto'
        setForm(prev => ({ ...prev, concepto_id: value, tipo_movimiento: tipo }))
      }
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.valor || !form.fecha) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('transacciones').insert({
      user_id: user.id,
      concepto_id: form.concepto_id || null,
      fecha: form.fecha,
      valor: parseFloat(form.valor.replace(/\./g, '').replace(',', '.')),
      tipo_movimiento: form.tipo_movimiento,
      medio_pago: form.medio_pago || null,
      observaciones: form.observaciones || null,
      origen: 'manual'
    })
    setSaving(false)
    if (err) { setError('Error al guardar. Intenta de nuevo.'); return }
    onSaved?.()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2>Registrar movimiento</h2>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {['gasto','ingreso','ahorro'].map(t => (
              <button key={t} type="button"
                onClick={() => set('tipo_movimiento', t)}
                style={{
                  padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600,
                  textTransform: 'capitalize', letterSpacing: '0.02em',
                  background: form.tipo_movimiento === t
                    ? t === 'gasto' ? 'var(--red)' : t === 'ingreso' ? 'var(--green)' : 'var(--amber)'
                    : 'var(--bg3)',
                  color: form.tipo_movimiento === t ? '#fff' : 'var(--text2)',
                }}>
                {t}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div className="input-group">
            <label>Valor (COP)</label>
            <input className="input" type="number" placeholder="0" min="0"
              value={form.valor} onChange={e => set('valor', e.target.value)}
              required style={{ fontSize: '1.2rem', fontFamily: 'var(--mono)', fontWeight: 500 }} />
          </div>

          {/* Categoría + Concepto */}
          <div className="input-group">
            <label>Categoría</label>
            <select className="input" value={catFilter}
              onChange={e => { setCatFilter(e.target.value); set('concepto_id', '') }}>
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div className="input-group">
            <label>Concepto</label>
            <select className="input" value={form.concepto_id}
              onChange={e => set('concepto_id', e.target.value)}>
              <option value="">Selecciona un concepto</option>
              {filteredConceptos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.categorias ? `(${c.categorias.nombre})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha y medio de pago */}
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha</label>
              <input className="input" type="date" value={form.fecha}
                onChange={e => set('fecha', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Medio de pago</label>
              <select className="input" value={form.medio_pago}
                onChange={e => set('medio_pago', e.target.value)}>
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
              value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost w-full"
              onClick={onClose} style={{ justifyContent: 'center' }}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary w-full"
              disabled={saving} style={{ justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
