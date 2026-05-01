import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { today } from '../lib/utils'

/**
 * TransactionModal
 *
 * Modos de uso:
 *   1. Crear nuevo:       <TransactionModal onClose onSaved />
 *   2. Pre-fill alerta:   <TransactionModal prefill={...} onClose onSaved />
 *   3. Editar existente:  <TransactionModal editData={tx} onClose onSaved />
 *
 * editData = objeto transacción completo tal como viene de Supabase
 *   { id, tipo_movimiento, concepto_id, fecha, valor, medio_pago, observaciones }
 */
export default function TransactionModal({ onClose, onSaved, prefill, editData }) {
  const { user } = useAuth()
  const isEdit = Boolean(editData)

  const [categorias,     setCategorias]     = useState([])
  const [todosConceptos, setTodosConceptos] = useState([])
  const [metas,          setMetas]          = useState([])
  const [tarjetas,       setTarjetas]       = useState([])

  const [catFilter, setCatFilter] = useState(prefill?.categoria_id || '')
  const [tipo,      setTipo]      = useState(
    editData?.tipo_movimiento || prefill?.tipo_movimiento || 'gasto'
  )
  const [form, setForm] = useState({
    concepto_id:   editData?.concepto_id   || prefill?.concepto_id || '',
    fecha:         editData?.fecha          || today(),
    valor:         editData?.valor          ? String(Math.round(editData.valor))
                                            : (prefill?.monto_presupuestado ? String(Math.round(prefill.monto_presupuestado)) : ''),
    medio_pago:    editData?.medio_pago     || 'débito',
    observaciones: editData?.observaciones  || '',
    tarjeta_id:    editData?.tarjeta_id     || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [ready,  setReady]  = useState(false)

  const valorAnterior = editData?.valor ? Number(editData.valor) : 0

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: cons }, { data: mts }, { data: tcs }] = await Promise.all([
        supabase.from('categorias').select('id, nombre, tipo').eq('user_id', user.id).order('nombre'),
        supabase.from('conceptos').select('id, nombre, categoria_id, meta_id')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
        supabase.from('metas').select('id, nombre, valor_actual, valor_meta')
          .eq('user_id', user.id).eq('activo', true).order('nombre'),
        supabase.from('tarjetas_credito').select('id, nombre, ultimos_digitos')
          .eq('user_id', user.id).order('nombre'),
      ])
      setCategorias(cats || [])
      setTodosConceptos(cons || [])
      setMetas(mts || [])
      setTarjetas(tcs || [])

      // En modo edición, deducir catFilter del concepto ya seleccionado
      if (editData?.concepto_id && cons) {
        const con = cons.find(c => c.id === editData.concepto_id)
        if (con) setCatFilter(con.categoria_id || '')
      }

      setReady(true)
    }
    load()
  }, [user.id])

  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  const categoriasFiltradas = categorias.filter(c => {
    if (tipo === 'ingreso') return c.tipo === 'Ingreso'
    if (tipo === 'gasto')   return c.tipo === 'Gasto'
    if (tipo === 'ahorro')  return c.tipo === 'Ahorro/Inversión'
    return false
  })

  const conceptosFiltrados = todosConceptos.filter(c => {
    const cat = catMap[c.categoria_id]
    if (!cat) return false
    const matchTipo = tipo === 'ingreso' ? cat.tipo === 'Ingreso'
      : tipo === 'gasto'  ? cat.tipo === 'Gasto'
      : cat.tipo === 'Ahorro/Inversión'
    if (!matchTipo) return false
    return !catFilter || c.categoria_id === catFilter
  })

  const conceptoSel = todosConceptos.find(c => c.id === form.concepto_id)
  const metaDelConcepto = conceptoSel?.meta_id
    ? metas.find(m => m.id === conceptoSel.meta_id)
    : null

  function cambiarTipo(nuevoTipo) {
    setTipo(nuevoTipo)
    setCatFilter('')
    setForm(p => ({ ...p, concepto_id: '' }))
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
    if (!form.concepto_id) {
      setError('Selecciona un concepto antes de guardar.')
      return
    }

    setSaving(true)

    if (isEdit) {
      // ── MODO EDICIÓN ──────────────────────────────────────────────────────
      const { error: txErr } = await supabase
        .from('transacciones')
        .update({
          fecha:           form.fecha,
          valor:           valorNum,
          tipo_movimiento: tipo,
          concepto_id:     form.concepto_id,
          medio_pago:      form.medio_pago || null,
          observaciones:   form.observaciones || null,
          tarjeta_id:      form.medio_pago === 'TC' ? (form.tarjeta_id || null) : null,
        })
        .eq('id', editData.id)
        .eq('user_id', user.id)

      if (txErr) {
        setSaving(false)
        setError('Error al actualizar: ' + txErr.message)
        return
      }

      // Ajustar meta: solo si el tipo sigue siendo ahorro y hay meta asociada
      if (tipo === 'ahorro' && editData.tipo_movimiento === 'ahorro' && metaDelConcepto) {
        const diff = valorNum - valorAnterior
        if (diff !== 0) {
          await supabase.from('metas')
            .update({
              valor_actual: Number(metaDelConcepto.valor_actual) + diff,
              updated_at:   new Date().toISOString()
            })
            .eq('id', metaDelConcepto.id)
            .eq('user_id', user.id)
        }
      }

    } else {
      // ── MODO CREACIÓN ────────────────────────────────────────────────────
      const { error: txErr } = await supabase.from('transacciones').insert({
        user_id:         user.id,
        fecha:           form.fecha,
        valor:           valorNum,
        tipo_movimiento: tipo,
        concepto_id:     form.concepto_id,
        medio_pago:      form.medio_pago || null,
        observaciones:   form.observaciones || null,
        tarjeta_id:      form.medio_pago === 'TC' ? (form.tarjeta_id || null) : null,
        origen:          'manual',
      })

      if (txErr) {
        setSaving(false)
        setError('Error al guardar: ' + txErr.message)
        return
      }

      if (tipo === 'ahorro' && metaDelConcepto) {
        await supabase.from('metas')
          .update({
            valor_actual: Number(metaDelConcepto.valor_actual) + valorNum,
            updated_at:   new Date().toISOString()
          })
          .eq('id', metaDelConcepto.id)
          .eq('user_id', user.id)
      }
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  const TIPOS = [
    { id: 'gasto',   label: 'Gasto',   color: 'var(--red)'   },
    { id: 'ingreso', label: 'Ingreso',  color: 'var(--green)' },
    { id: 'ahorro',  label: 'Ahorro',   color: 'var(--amber)' },
  ]

  const titulo = isEdit ? 'Editar movimiento'
    : prefill ? `Registrar: ${prefill.nombre}`
    : 'Registrar movimiento'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2>{titulo}</h2>
        {prefill && !isEdit && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.75rem', marginTop: '-0.5rem' }}>
            Revisa los datos y confirma
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

          {/* Categoría */}
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

          {/* Concepto */}
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
                  {c.nombre}
                  {!catFilter && catMap[c.categoria_id] ? ` · ${catMap[c.categoria_id].nombre}` : ''}
                </option>
              ))}
            </select>
            {ready && conceptosFiltrados.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 2 }}>
                {catFilter
                  ? 'Esta categoría no tiene conceptos activos.'
                  : tipo === 'ahorro'
                    ? 'No hay conceptos de ahorro. Créalos en Config → Categorías.'
                    : 'Sin conceptos para este tipo.'}
              </p>
            )}
          </div>

          {/* Info meta asociada */}
          {tipo === 'ahorro' && metaDelConcepto && (
            <div style={{ background: 'rgba(247,180,79,0.08)', border: '1px solid rgba(247,180,79,0.2)', borderRadius: 8, padding: '0.6rem 0.9rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 600, marginBottom: 3 }}>
                Meta asociada: {metaDelConcepto.nombre}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                Acumulado actual: ${Number(metaDelConcepto.valor_actual).toLocaleString('es-CO')}
                {isEdit ? ' · Al guardar se ajustará la diferencia.' : ' · Al guardar se sumará el valor ingresado.'}
              </p>
            </div>
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
                onChange={e => setForm(p => ({ ...p, medio_pago: e.target.value, tarjeta_id: '' }))}>
                <option value="débito">Débito</option>
                <option value="TC">Tarjeta crédito</option>
                <option value="efectivo">Efectivo</option>
                <option value="nómina">Nómina</option>
                <option value="automático">Automático</option>
              </select>
            </div>
          </div>

          {/* Selector tarjeta de crédito */}
          {form.medio_pago === 'TC' && (
            <div className="input-group">
              <label>Tarjeta de crédito</label>
              {tarjetas.length === 0 ? (
                <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 2 }}>
                  No tienes tarjetas registradas. Ve a Config → Administrar tarjetas.
                </p>
              ) : (
                <select className="input" value={form.tarjeta_id}
                  onChange={e => setForm(p => ({ ...p, tarjeta_id: e.target.value }))}
                  style={{ borderColor: !form.tarjeta_id ? 'rgba(247,180,79,0.5)' : undefined }}>
                  <option value="">— Selecciona una tarjeta —</option>
                  {tarjetas.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}{t.ultimos_digitos ? ` ···· ${t.ultimos_digitos}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

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
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : prefill ? 'Confirmar pago' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
