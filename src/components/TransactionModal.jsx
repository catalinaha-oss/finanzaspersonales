import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { today } from '../lib/utils'

// prefill: { tipo_movimiento, concepto_id, categoria_id, monto_presupuestado, nombre }
export default function TransactionModal({ onClose, onSaved, prefill }) {
  const { user } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [conceptos,  setConceptos]  = useState([])
  const [metas,      setMetas]      = useState([])
  const [catFilter,  setCatFilter]  = useState(prefill?.categoria_id || '')
  const [tipo,       setTipo]       = useState(prefill?.tipo_movimiento || 'gasto')
  const [form, setForm] = useState({
    concepto_id:    prefill?.concepto_id || '',
    meta_id:        '',
    fecha:          today(),
    valor:          prefill?.monto_presupuestado ? String(Math.round(prefill.monto_presupuestado)) : '',
    medio_pago:     'débito',
    observaciones:  '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [ready,  setReady]  = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: cons }, { data: mts }] = await Promise.all([
        supabase.from('categorias').select('id, nombre, tipo, orden')
          .eq('user_id', user.id).order('nombre'),
        supabase.from('conceptos').select('id, nombre, categoria_id')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
        supabase.from('metas').select('id, nombre, valor_actual, valor_meta')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
      ])
      setCategorias(cats || [])
      setConceptos(cons || [])
      setMetas(mts || [])
      setReady(true)
    }
    load()
  }, [user.id])

  // Mapa local: id → categoría
  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  const categoriasFiltradas = categorias.filter(c =>
    tipo === 'ingreso' ? c.tipo === 'Ingreso' : c.tipo === 'Gasto'
  )

  const conceptosFiltrados = conceptos.filter(c => {
    const cat = catMap[c.categoria_id]
    if (!cat) return false
    const matchTipo = tipo === 'ingreso' ? cat.tipo === 'Ingreso' : cat.tipo === 'Gasto'
    if (!matchTipo) return false
    return !catFilter || c.categoria_id === catFilter
  })

  function cambiarTipo(nuevoTipo) {
    setTipo(nuevoTipo)
    setCatFilter('')
    setForm(p => ({ ...p, concepto_id: '', meta_id: '' }))
    setError('')
  }

  function cambiarCategoria(catId) {
    setCatFilter(catId)
    setForm(p => ({ ...p, concepto_id: '' }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    const valorNum = parseFloat(form.valor)
    if (!form.valor || isNaN(valorNum) || valorNum <= 0) {
      setError('Ingresa un valor válido mayor a cero.')
      return
    }
    if ((tipo === 'gasto' || tipo === 'ingreso') && !form.concepto_id) {
      setError('Selecciona un concepto antes de guardar.')
      return
    }
    if (tipo === 'ahorro' && !form.meta_id) {
      setError('Selecciona una meta de ahorro.')
      return
    }

    setSaving(true)

    if (tipo === 'ahorro') {
      const meta = metas.find(m => m.id === form.meta_id)
      const { error: txErr } = await supabase.from('transacciones').insert({
        user_id: user.id, fecha: form.fecha, valor: valorNum,
        tipo_movimiento: 'ahorro', medio_pago: form.medio_pago || null,
        observaciones: form.observaciones || meta?.nombre || 'Ahorro',
        origen: 'manual', concepto_id: null,
      })
      if (txErr) { setSaving(false); setError('Error: ' + txErr.message); return }
      await supabase.from('metas')
        .update({ valor_actual: Number(meta.valor_actual) + valorNum, updated_at: new Date().toISOString() })
        .eq('id', meta.id).eq('user_id', user.id)
      setSaving(false); onSaved?.(); onClose(); return
    }

    const { error: err } = await supabase.from('transacciones').insert({
      user_id: user.id, fecha: form.fecha, valor: valorNum,
      tipo_movimiento: tipo, concepto_id: form.concepto_id,
      medio_pago: form.medio_pago || null,
      observaciones: form.observaciones || null,
      origen: 'manual',
    })
    setSaving(false)
    if (err) { setError('Error: ' + err.message); return }
    onSaved?.(); onClose()
  }

  const TIPOS = [
    { id: 'gasto',   label: 'Gasto',  color: 'var(--red)'   },
    { id: 'ingreso', label: 'Ingreso', color: 'var(--green)' },
    { id: 'ahorro',  label: 'Ahorro',  color: 'var(--amber)' },
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2>
          {prefill ? `Registrar: ${prefill.nombre}` : 'Registrar movimiento'}
        </h2>
        {prefill && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.75rem', marginTop: '-0.5rem' }}>
            Revisa los datos y confirma el pago
          </p>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {TIPOS.map(t => (
              <button key={t.id} type="button" onClick={() => cambiarTipo(t.id)}
                style={{
                  padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 700,
                  background: tipo === t.id ? t.color : 'var(--bg3)',
                  color: tipo === t.id ? '#fff' : 'var(--text2)',
                  transition: 'background 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div className="input-group">
            <label>Valor (COP)</label>
            <input className="input" type="number" placeholder="0" min="1" step="1"
              value={form.valor}
              onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
              style={{ fontSize: '1.2rem', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          </div>

          {/* AHORRO */}
          {tipo === 'ahorro' && (
            <div className="input-group">
              <label>Meta de ahorro *</label>
              {metas.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--amber)', padding: '0.4rem 0' }}>
                  No tienes metas creadas. Ve a la sección Metas.
                </p>
              ) : (
                <select className="input" value={form.meta_id}
                  onChange={e => setForm(p => ({ ...p, meta_id: e.target.value }))}>
                  <option value="">— Selecciona una meta —</option>
                  {metas.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} · acumulado ${Number(m.valor_actual).toLocaleString('es-CO')}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* GASTO / INGRESO */}
          {(tipo === 'gasto' || tipo === 'ingreso') && (
            <>
              <div className="input-group">
                <label>Categoría</label>
                <select className="input" value={catFilter}
                  onChange={e => cambiarCategoria(e.target.value)}>
                  <option value="">— Todas las categorías —</option>
                  {categoriasFiltradas.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>
                  Concepto *
                  {ready && conceptosFiltrados.length > 0 && (
                    <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
                      ({conceptosFiltrados.length})
                    </span>
                  )}
                </label>
                <select className="input" value={form.concepto_id}
                  onChange={e => setForm(p => ({ ...p, concepto_id: e.target.value }))}
                  style={{ borderColor: !form.concepto_id ? 'rgba(247,180,79,0.5)' : undefined }}>
                  <option value="">— Selecciona un concepto —</option>
                  {conceptosFiltrados.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{!catFilter && catMap[c.categoria_id] ? ` · ${catMap[c.categoria_id].nombre}` : ''}
                    </option>
                  ))}
                </select>
                {ready && conceptosFiltrados.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 2 }}>
                    {catFilter ? 'Esta categoría no tiene conceptos activos.' : 'Sin conceptos para este tipo.'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Fecha y medio */}
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha</label>
              <input className="input" type="date" value={form.fecha}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div className="input-group">
              <label>Medio de pago</label>
              <select className="input" value={form.medio_pago}
                onChange={e => setForm(p => ({ ...p, medio_pago: e.target.value }))}>
                <option value="débito">Débito</option>
                <option value="TC">Tarjeta crédito</option>
                <option value="efectivo">Efectivo</option>
                <option value="nómina">Nómina</option>
                <option value="automático">Automático</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Observaciones (opcional)</label>
            <input className="input" type="text" placeholder="Notas adicionales..."
              value={form.observaciones}
              onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} />
          </div>

          {error && (
            <div style={{ background: 'rgba(247,95,95,0.12)', border: '1px solid rgba(247,95,95,0.3)', borderRadius: 8, padding: '0.6rem 0.9rem', color: 'var(--red)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost w-full"
              onClick={onClose} style={{ justifyContent: 'center' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary w-full"
              disabled={saving} style={{ justifyContent: 'center' }}>
              {saving ? 'Guardando...' : prefill ? 'Confirmar pago' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
