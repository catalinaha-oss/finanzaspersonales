import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { today } from '../lib/utils'

export default function TransactionModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [todosConceptos, setTodosConceptos] = useState([])
  const [metas, setMetas]     = useState([])
  const [catFilter, setCatFilter] = useState('')
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
        supabase.from('conceptos').select('id, nombre, categoria_id, categorias(nombre, tipo)')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
        supabase.from('metas').select('id, nombre, valor_actual, valor_meta')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
      ])
      setCategorias(cats || [])
      setTodosConceptos(cons || [])
      setMetas(mts || [])
    }
    load()
  }, [user.id])

  const tipo = form.tipo_movimiento

  // Categorías según tipo de movimiento
  const categoriasFiltradas = categorias.filter(c => {
    if (tipo === 'ingreso') return c.tipo === 'Ingreso'
    if (tipo === 'gasto')   return c.tipo === 'Gasto'
    return false
  })

  // BUG 2 FIX: conceptos filtrados por tipo Y por categoría seleccionada
  const conceptosFiltrados = todosConceptos.filter(c => {
    const matchTipo = tipo === 'ingreso'
      ? c.categorias?.tipo === 'Ingreso'
      : c.categorias?.tipo === 'Gasto'
    // Si hay categoría seleccionada, filtrar por ella
    const matchCat = !catFilter || c.categoria_id === catFilter
    return matchTipo && matchCat
  })

  function cambiarTipo(nuevoTipo) {
    setCatFilter('')
    setForm(prev => ({
      ...prev,
      tipo_movimiento: nuevoTipo,
      concepto_id: '',
      meta_id: '',
    }))
    setError('')
  }

  function cambiarCategoria(catId) {
    setCatFilter(catId)
    // Limpiar concepto al cambiar categoría
    setForm(prev => ({ ...prev, concepto_id: '' }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    // Validar valor
    const valorNum = parseFloat(form.valor)
    if (!form.valor || isNaN(valorNum) || valorNum <= 0) {
      setError('Ingresa un valor válido mayor a cero.')
      return
    }

    // BUG 2 FIX: validar concepto obligatorio para gasto/ingreso
    if ((tipo === 'gasto' || tipo === 'ingreso') && !form.concepto_id) {
      setError('Selecciona un concepto antes de guardar.')
      return
    }

    // BUG 4 FIX: validar meta obligatoria para ahorro
    if (tipo === 'ahorro' && !form.meta_id) {
      setError('Selecciona una meta de ahorro.')
      return
    }

    setSaving(true)

    if (tipo === 'ahorro') {
      const meta = metas.find(m => m.id === form.meta_id)
      const obs  = form.observaciones || meta?.nombre || 'Ahorro'

      const { error: txErr } = await supabase.from('transacciones').insert({
        user_id: user.id,
        fecha: form.fecha,
        valor: valorNum,
        tipo_movimiento: 'ahorro',
        medio_pago: form.medio_pago || null,
        observaciones: obs,
        origen: 'manual',
        concepto_id: null,
      })

      if (txErr) { setSaving(false); setError('Error al guardar la transacción.'); return }

      // BUG 4 FIX: actualizar valor_actual de la meta
      const { error: metaErr } = await supabase.from('metas')
        .update({
          valor_actual: Number(meta.valor_actual) + valorNum,
          updated_at: new Date().toISOString()
        })
        .eq('id', meta.id)
        .eq('user_id', user.id)

      if (metaErr) { setSaving(false); setError('Transacción guardada, pero no se actualizó la meta.'); return }

      setSaving(false)
      onSaved?.()
      onClose()
      return
    }

    // Gasto o Ingreso
    const { error: err } = await supabase.from('transacciones').insert({
      user_id: user.id,
      fecha: form.fecha,
      valor: valorNum,
      tipo_movimiento: tipo,
      concepto_id: form.concepto_id,
      medio_pago: form.medio_pago || null,
      observaciones: form.observaciones || null,
      origen: 'manual',
    })

    setSaving(false)
    if (err) { setError('Error al guardar. Intenta de nuevo.'); return }
    onSaved?.()
    onClose()
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
        <h2>Registrar movimiento</h2>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

          {/* Selector de tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {TIPOS.map(t => (
              <button key={t.id} type="button" onClick={() => cambiarTipo(t.id)}
                style={{
                  padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 700,
                  background: tipo === t.id ? t.color : 'var(--bg3)',
                  color: tipo === t.id ? '#fff' : 'var(--text2)',
                  transition: 'all 0.15s',
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

          {/* AHORRO: selector de meta */}
          {tipo === 'ahorro' && (
            <div className="input-group">
              <label>Meta de ahorro *</label>
              {metas.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--amber)', padding: '0.5rem 0' }}>
                  No tienes metas creadas. Ve a la sección Metas para crear una.
                </p>
              ) : (
                <select className="input" value={form.meta_id}
                  onChange={e => setForm(p => ({ ...p, meta_id: e.target.value }))}>
                  <option value="">— Selecciona una meta —</option>
                  {metas.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} (acumulado: ${Number(m.valor_actual).toLocaleString('es-CO')})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* GASTO / INGRESO: categoría + concepto */}
          {(tipo === 'gasto' || tipo === 'ingreso') && (
            <>
              {/* BUG 2 FIX: categoría con onChange separado */}
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

              {/* BUG 2 FIX: conceptos se actualizan reactivamente con conceptosFiltrados */}
              <div className="input-group">
                <label>Concepto *</label>
                <select className="input" value={form.concepto_id}
                  onChange={e => setForm(p => ({ ...p, concepto_id: e.target.value }))}
                  style={{ borderColor: !form.concepto_id ? 'rgba(247,180,79,0.4)' : 'var(--border2)' }}>
                  <option value="">— Selecciona un concepto —</option>
                  {conceptosFiltrados.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {!catFilter && c.categorias ? ` · ${c.categorias.nombre}` : ''}
                    </option>
                  ))}
                </select>
                {conceptosFiltrados.length === 0 && catFilter && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 2 }}>
                    Esta categoría no tiene conceptos activos.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Fecha y medio de pago */}
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
            <div style={{ background: 'rgba(247,95,95,0.1)', border: '1px solid rgba(247,95,95,0.3)', borderRadius: 8, padding: '0.6rem 0.9rem', color: 'var(--red)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost w-full" onClick={onClose}
              style={{ justifyContent: 'center' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary w-full" disabled={saving}
              style={{ justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
