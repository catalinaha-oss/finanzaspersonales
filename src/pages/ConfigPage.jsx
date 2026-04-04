import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCompact } from '../lib/utils'

const TIPOS = ['Ingreso', 'Gasto', 'Ahorro/Inversión']
const TIPO_COLORS = {
  'Ingreso':          'var(--green)',
  'Gasto':            'var(--red)',
  'Ahorro/Inversión': 'var(--amber)'
}
const PERIODICIDADES = ['Mensual','Bimensual','Trimestral','Semestral','Anual']

export default function ConfigPage() {
  const { user, signOut } = useAuth()

  // Datos
  const [categorias, setCategorias]     = useState([])
  const [conceptos,  setConceptos]      = useState([])
  const [txConceptos, setTxConceptos]   = useState({}) // concepto_id → count tx
  const [txCats,      setTxCats]        = useState({}) // cat_id → count tx
  const [loading, setLoading]           = useState(true)
  const [errorMsg, setErrorMsg]         = useState('')

  // Vista: 'categorias' | 'conceptos'
  const [vista, setVista]         = useState('categorias')
  const [catSeleccionada, setCatSel] = useState(null) // { id, nombre, tipo }

  // Modales
  const [modalCat, setModalCat]   = useState(false)
  const [modalCon, setModalCon]   = useState(false)
  const [editandoCat, setEditCat] = useState(null)
  const [editandoCon, setEditCon] = useState(null)

  // Forms
  const [formCat, setFormCat] = useState({ nombre: '', tipo: 'Gasto' })
  const [formCon, setFormCon] = useState({
    nombre: '', esencial: 'E', fijo_variable: 'F',
    periodicidad: 'Mensual', monto_presupuestado: '',
    dia_pago: '', mes_ciclo: '', dia_vencimiento: '', observaciones: ''
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setErrorMsg('')
    const [
      { data: cats,  error: e1 },
      { data: cons,  error: e2 },
      { data: txs,   error: e3 },
    ] = await Promise.all([
      supabase.from('categorias').select('id, tipo, nombre, orden')
        .eq('user_id', user.id).order('tipo').order('nombre'),
      supabase.from('conceptos')
        .select('id, nombre, categoria_id, esencial, fijo_variable, periodicidad, monto_presupuestado, dia_pago, mes_ciclo, dia_vencimiento, activo')
        .eq('user_id', user.id).order('nombre'),
      supabase.from('transacciones').select('concepto_id')
        .eq('user_id', user.id).not('concepto_id', 'is', null),
    ])
    if (e1) { setErrorMsg('Error: ' + e1.message); setLoading(false); return }

    // Contar tx por concepto
    const txCon = {}
    for (const t of txs || []) {
      if (t.concepto_id) txCon[t.concepto_id] = (txCon[t.concepto_id] || 0) + 1
    }

    // Contar tx por categoría (a través de conceptos)
    const txCat = {}
    for (const c of cons || []) {
      if (txCon[c.id]) txCat[c.categoria_id] = (txCat[c.categoria_id] || 0) + txCon[c.id]
    }

    setCategorias(cats || [])
    setConceptos(cons || [])
    setTxConceptos(txCon)
    setTxCats(txCat)
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  // ── CATEGORÍAS ─────────────────────────────────────────────
  function abrirNuevaCat() {
    setEditCat(null); setFormCat({ nombre: '', tipo: 'Gasto' }); setModalCat(true)
  }
  function abrirEditarCat(cat) {
    setEditCat(cat.id); setFormCat({ nombre: cat.nombre, tipo: cat.tipo }); setModalCat(true)
  }

  async function guardarCat(e) {
    e.preventDefault()
    if (!formCat.nombre.trim()) return
    setSaving(true)
    const payload = { nombre: formCat.nombre.trim(), tipo: formCat.tipo }
    const { error } = editandoCat
      ? await supabase.from('categorias').update(payload).eq('id', editandoCat).eq('user_id', user.id)
      : await supabase.from('categorias').insert({ ...payload, user_id: user.id, orden: categorias.length })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setModalCat(false); load()
  }

  async function eliminarCat(cat) {
    // 1. Verificar conceptos activos
    const consDeCat = conceptos.filter(c => c.categoria_id === cat.id && c.activo)
    if (consDeCat.length > 0) {
      alert(`Esta categoría tiene ${consDeCat.length} concepto(s) activo(s). Primero elimínalos.`)
      return
    }
    // 2. Query directa filtrando por user_id — garantiza que son movimientos del usuario
    const idsDeCat = conceptos.filter(c => c.categoria_id === cat.id).map(c => c.id)
    if (idsDeCat.length > 0) {
      const { count } = await supabase.from('transacciones')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('concepto_id', idsDeCat)
      if (count > 0) {
        alert(`Esta categoría tiene ${count} movimiento(s) registrados. No se puede eliminar.`)
        return
      }
    }
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return
    const { error } = await supabase.from('categorias').delete().eq('id', cat.id).eq('user_id', user.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  // ── CONCEPTOS ──────────────────────────────────────────────
  function abrirConceptos(cat) {
    setCatSel(cat); setVista('conceptos')
  }

  function abrirNuevoCon() {
    setEditCon(null)
    setFormCon({
      nombre: '', esencial: 'E', fijo_variable: 'F',
      periodicidad: 'Mensual', monto_presupuestado: '',
      dia_pago: '', mes_ciclo: '', dia_vencimiento: '', observaciones: ''
    })
    setModalCon(true)
  }

  function abrirEditarCon(con) {
    setEditCon(con.id)
    setFormCon({
      nombre:              con.nombre || '',
      esencial:            con.esencial || 'E',
      fijo_variable:       con.fijo_variable || 'F',
      periodicidad:        con.periodicidad || 'Mensual',
      monto_presupuestado: con.monto_presupuestado ? String(con.monto_presupuestado) : '',
      dia_pago:            con.dia_pago ? String(con.dia_pago) : '',
      mes_ciclo:           con.mes_ciclo ? String(con.mes_ciclo) : '',
      dia_vencimiento:     con.dia_vencimiento ? String(con.dia_vencimiento) : '',
      observaciones:       con.observaciones || '',
    })
    setModalCon(true)
  }

  async function guardarCon(e) {
    e.preventDefault()
    if (!formCon.nombre.trim() || !catSeleccionada) return
    setSaving(true)
    const payload = {
      nombre:              formCon.nombre.trim(),
      esencial:            formCon.esencial,
      fijo_variable:       formCon.fijo_variable,
      periodicidad:        formCon.periodicidad,
      monto_presupuestado: formCon.monto_presupuestado ? parseFloat(formCon.monto_presupuestado) : null,
      dia_pago:            formCon.dia_pago ? parseInt(formCon.dia_pago) : null,
      mes_ciclo:           formCon.mes_ciclo ? parseInt(formCon.mes_ciclo) : null,
      dia_vencimiento:     formCon.dia_vencimiento ? parseInt(formCon.dia_vencimiento) : null,
      observaciones:       formCon.observaciones || null,
    }
    const { error } = editandoCon
      ? await supabase.from('conceptos').update(payload).eq('id', editandoCon).eq('user_id', user.id)
      : await supabase.from('conceptos').insert({ ...payload, user_id: user.id, categoria_id: catSeleccionada.id, activo: true })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setModalCon(false); load()
  }

  async function eliminarCon(con) {
    // Query directa con user_id — valida que los movimientos son del usuario actual
    const { count } = await supabase.from('transacciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('concepto_id', con.id)
    if (count > 0) {
      alert(`Este concepto tiene ${count} movimiento(s) registrados. No se puede eliminar.`)
      return
    }
    if (!confirm(`¿Eliminar el concepto "${con.nombre}"?`)) return
    const { error } = await supabase.from('conceptos').delete().eq('id', con.id).eq('user_id', user.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  async function toggleActivo(con) {
    await supabase.from('conceptos').update({ activo: !con.activo }).eq('id', con.id).eq('user_id', user.id)
    load()
  }

  // ── Renders ────────────────────────────────────────────────
  // ── METAS ──────────────────────────────────────────────────
  function abrirNuevaMeta() {
    setEditMeta(null); setFormMeta({ nombre: '', valor_meta: '' }); setModalMeta(true)
  }
  function abrirEditarMeta(m) {
    setEditMeta(m.id); setFormMeta({ nombre: m.nombre, valor_meta: String(m.valor_meta) }); setModalMeta(true)
  }
  async function guardarMeta(e) {
    e.preventDefault()
    const v = parseFloat(formMeta.valor_meta)
    if (!formMeta.nombre.trim() || isNaN(v) || v <= 0) return
    setSaving(true)
    if (editMeta) {
      await supabase.from('metas').update({ nombre: formMeta.nombre.trim(), valor_meta: v }).eq('id', editMeta).eq('user_id', user.id)
    } else {
      await supabase.from('metas').insert({ user_id: user.id, nombre: formMeta.nombre.trim(), valor_meta: v, valor_actual: 0 })
    }
    setSaving(false); setModalMeta(false); load()
  }
  async function eliminarMeta(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').update({ activo: false }).eq('id', id).eq('user_id', user.id)
    load()
  }
  async function guardarValorMeta(id) {
    const v = parseFloat(editVal)
    if (isNaN(v) || v < 0) return
    const campo = editMode.campo === 'actual' ? 'valor_actual' : 'valor_meta'
    setSaving(true)
    await supabase.from('metas').update({ [campo]: v, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    setSaving(false); setEditMode(null); setEditVal(''); load()
  }
  const COLORS_META = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--green2)']

  const porTipo = TIPOS.map(tipo => ({
    tipo, cats: categorias.filter(c => c.tipo === tipo)
  })).filter(g => g.cats.length > 0)

  const conceptosDeCat = catSeleccionada
    ? conceptos.filter(c => c.categoria_id === catSeleccionada.id)
    : []

  const labelFecha = (con) => {
    if (con.fijo_variable !== 'F') return null
    if (con.periodicidad === 'Mensual' && con.dia_pago) return `Día ${con.dia_pago} c/mes`
    if (con.mes_ciclo && con.dia_vencimiento) return `Mes ${con.mes_ciclo} día ${con.dia_vencimiento}`
    return null
  }

  return (
    <div className="page animate-in">
      {/* Header con breadcrumb */}
      <div className="page-header">
        {vista === 'conceptos' ? (
          <div>
            <button onClick={() => setVista('categorias')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font)', padding: 0, marginBottom: 6 }}>
              ← Categorías
            </button>
            <h1 style={{ fontSize: '1.3rem' }}>{catSeleccionada?.nombre}</h1>
            <p>{conceptosDeCat.length} concepto{conceptosDeCat.length !== 1 ? 's' : ''}</p>
          </div>
        ) : (
          <div>
            <h1>Configuración</h1>
            <p>{categorias.length} categorías</p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(247,95,95,0.1)', border: '1px solid rgba(247,95,95,0.3)', borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {errorMsg}
        </div>
      )}

      {/* ── VISTA: CATEGORÍAS ── */}
      {vista === 'categorias' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={abrirNuevaCat}>+ Categoría</button>
          </div>

          {loading ? (
            [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 10 }} />)
          ) : categorias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
              <p style={{ marginBottom: 12 }}>No tienes categorías aún</p>
              <button className="btn btn-primary" onClick={abrirNuevaCat}>Crear primera categoría</button>
            </div>
          ) : porTipo.map(({ tipo, cats }) => (
            <div key={tipo} style={{ marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIPO_COLORS[tipo], marginBottom: 8, paddingLeft: 2 }}>
                {tipo} · {cats.length}
              </p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {cats.map((cat, i) => {
                  const nCon  = conceptos.filter(c => c.categoria_id === cat.id).length
                  const nTx   = txCats[cat.id] || 0
                  const puedeBorrar = nTx === 0 && conceptos.filter(c => c.categoria_id === cat.id && c.activo).length === 0
                  return (
                    <div key={cat.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '11px 14px',
                      borderBottom: i < cats.length - 1 ? '1px solid var(--border)' : 'none'
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[tipo], flexShrink: 0 }} />
                      {/* Nombre — clic para ver conceptos */}
                      <button onClick={() => abrirConceptos(cat)}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'var(--font)' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>{cat.nombre}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginLeft: 8 }}>
                          {nCon} concepto{nCon !== 1 ? 's' : ''}{nTx > 0 ? ` · ${nTx} mov.` : ''}
                        </span>
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarCat(cat)}
                        style={{ padding: '3px 10px', fontSize: '0.78rem', flexShrink: 0 }}>
                        Editar
                      </button>
                      <button onClick={() => eliminarCat(cat)}
                        title={puedeBorrar ? 'Eliminar' : 'Tiene movimientos o conceptos activos'}
                        style={{
                          background: 'none', border: 'none', cursor: puedeBorrar ? 'pointer' : 'not-allowed',
                          color: puedeBorrar ? 'var(--text3)' : 'var(--bg4)',
                          fontSize: '1.1rem', padding: '2px 4px', lineHeight: 1, flexShrink: 0
                        }}>
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Metas */}
          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Metas financieras</h2>
            <button className="btn btn-primary btn-sm" onClick={abrirNuevaMeta}>+ Meta</button>
          </div>
          {metas.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '1rem' }}>Sin metas creadas aún.</p>
          ) : metas.map((m, idx) => {
            const pct   = m.valor_meta > 0 ? Math.min((m.valor_actual / m.valor_meta) * 100, 100) : 0
            const color = COLORS_META[idx % COLORS_META.length]
            const faltante = Math.max(Number(m.valor_meta) - Number(m.valor_actual), 0)
            return (
              <div key={m.id} className="card" style={{ marginBottom: '0.75rem', borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.nombre}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarMeta(m)} style={{ padding: '3px 8px', fontSize: '0.75rem' }}>Editar</button>
                    <button onClick={() => eliminarMeta(m.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem', padding: '2px 4px' }}>×</button>
                  </div>
                </div>
                <div className="progress-bar" style={{ marginBottom: 8 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text2)', marginBottom: 3 }}>Acumulado</p>
                    {editMode?.id === m.id && editMode?.campo === 'actual' ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input className="input" type="number" min="0" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus style={{ padding: '3px 6px', fontSize: '0.8rem', fontFamily: 'var(--mono)' }} />
                        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => guardarValorMeta(m.id)}>OK</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(null)}>×</button>
                      </div>
                    ) : (
                      <p className="mono" style={{ fontWeight: 600, color, cursor: 'pointer', fontSize: '0.9rem' }} onClick={() => { setEditMode({ id: m.id, campo: 'actual' }); setEditVal(String(m.valor_actual)) }}>
                        {formatCompact(m.valor_actual)} <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>✎</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text2)', marginBottom: 3 }}>Objetivo</p>
                    {editMode?.id === m.id && editMode?.campo === 'meta' ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input className="input" type="number" min="0" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus style={{ padding: '3px 6px', fontSize: '0.8rem', fontFamily: 'var(--mono)' }} />
                        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => guardarValorMeta(m.id)}>OK</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(null)}>×</button>
                      </div>
                    ) : (
                      <p className="mono" style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }} onClick={() => { setEditMode({ id: m.id, campo: 'meta' }); setEditVal(String(m.valor_meta)) }}>
                        {formatCompact(m.valor_meta)} <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>✎</span>
                      </p>
                    )}
                  </div>
                </div>
                {faltante > 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 6 }}>Falta: <strong style={{ color: 'var(--text)' }}>{formatCompact(faltante)}</strong> · {pct.toFixed(1)}%</p>}
              </div>
            )
          })}

          {/* Modal meta */}
          {modalMeta && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalMeta(false)}>
              <div className="modal">
                <div className="modal-handle" />
                <h2>{editMeta ? 'Editar meta' : 'Nueva meta'}</h2>
                <form onSubmit={guardarMeta} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Nombre</label>
                    <input className="input" required placeholder="Ej: Fondo vacaciones, Carro..." value={formMeta.nombre} onChange={e => setFormMeta(p => ({ ...p, nombre: e.target.value }))} autoFocus />
                  </div>
                  <div className="input-group">
                    <label>Valor objetivo (COP)</label>
                    <input className="input" required type="number" min="1" placeholder="0" value={formMeta.valor_meta} onChange={e => setFormMeta(p => ({ ...p, valor_meta: e.target.value }))} style={{ fontFamily: 'var(--mono)', fontSize: '1.1rem' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={() => setModalMeta(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }} disabled={saving}>{saving ? 'Guardando...' : editMeta ? 'Actualizar' : 'Crear'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Cuenta */}
          <div className="divider" />
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Cuenta</h2>
          <div className="card" style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 3 }}>Usuario activo</p>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.875rem' }}>{user.email}</p>
          </div>
          <button className="btn btn-ghost w-full" onClick={signOut}
            style={{ justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(247,95,95,0.3)' }}>
            Cerrar sesión
          </button>
        </>
      )}

      {/* ── VISTA: CONCEPTOS ── */}
      {vista === 'conceptos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={abrirNuevoCon}>+ Concepto</button>
          </div>

          {loading ? (
            [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8, borderRadius: 10 }} />)
          ) : conceptosDeCat.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
              <p style={{ marginBottom: 12 }}>Esta categoría no tiene conceptos</p>
              <button className="btn btn-primary" onClick={abrirNuevoCon}>Crear primer concepto</button>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {conceptosDeCat.map((con, i) => {
                const nTx    = txConceptos[con.id] || 0
                const fecha  = labelFecha(con)
                const puedeBorrar = nTx === 0
                return (
                  <div key={con.id} style={{
                    padding: '11px 14px',
                    borderBottom: i < conceptosDeCat.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: con.activo ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{con.nombre}</span>
                          {!con.activo && <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>inactivo</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className={`badge ${con.esencial === 'E' ? 'badge-blue' : 'badge-purple'}`}>{con.esencial}</span>
                          <span className={`badge ${con.fijo_variable === 'F' ? 'badge-green' : 'badge-amber'}`}>{con.fijo_variable === 'F' ? 'Fijo' : 'Variable'}</span>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text2)' }}>{con.periodicidad}</span>
                          {con.monto_presupuestado && (
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text2)' }}>
                              ${Number(con.monto_presupuestado).toLocaleString('es-CO')}
                            </span>
                          )}
                          {fecha && (
                            <span className="badge" style={{ background: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }}>{fecha}</span>
                          )}
                          {nTx > 0 && (
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>{nTx} mov.</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarCon(con)}
                          style={{ padding: '3px 8px', fontSize: '0.75rem' }}>Editar</button>
                        <button onClick={() => toggleActivo(con)}
                          title={con.activo ? 'Desactivar' : 'Activar'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.75rem', padding: '3px 4px' }}>
                          {con.activo ? '⏸' : '▶'}
                        </button>
                        <button onClick={() => eliminarCon(con)}
                          title={puedeBorrar ? 'Eliminar' : `${nTx} movimientos registrados`}
                          style={{
                            background: 'none', border: 'none',
                            cursor: puedeBorrar ? 'pointer' : 'not-allowed',
                            color: puedeBorrar ? 'var(--text3)' : 'var(--bg4)',
                            fontSize: '1.1rem', padding: '2px 4px', lineHeight: 1
                          }}>×</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── MODAL CATEGORÍA ── */}
      {modalCat && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalCat(false)}>
          <div className="modal">
            <div className="modal-handle" />
            <h2>{editandoCat ? 'Editar categoría' : 'Nueva categoría'}</h2>
            <form onSubmit={guardarCat} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Nombre</label>
                <input className="input" required placeholder="Ej: Salud, Gym, Mascota..."
                  value={formCat.nombre} onChange={e => setFormCat(p => ({ ...p, nombre: e.target.value }))} autoFocus />
              </div>
              <div className="input-group">
                <label>Tipo</label>
                <select className="input" value={formCat.tipo}
                  onChange={e => setFormCat(p => ({ ...p, tipo: e.target.value }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }}
                  onClick={() => setModalCat(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                  disabled={saving}>{saving ? 'Guardando...' : editandoCat ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL CONCEPTO ── */}
      {modalCon && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalCon(false)}>
          <div className="modal">
            <div className="modal-handle" />
            <h2>{editandoCon ? 'Editar concepto' : `Nuevo concepto · ${catSeleccionada?.nombre}`}</h2>
            <form onSubmit={guardarCon} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

              <div className="input-group">
                <label>Nombre</label>
                <input className="input" required placeholder="Ej: Arriendo, Mercado, Netflix..."
                  value={formCon.nombre} onChange={e => setFormCon(p => ({ ...p, nombre: e.target.value }))} autoFocus />
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label>Esencial / No esencial</label>
                  <select className="input" value={formCon.esencial}
                    onChange={e => setFormCon(p => ({ ...p, esencial: e.target.value }))}>
                    <option value="E">E — Esencial</option>
                    <option value="NE">NE — No esencial</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Fijo / Variable</label>
                  <select className="input" value={formCon.fijo_variable}
                    onChange={e => setFormCon(p => ({ ...p, fijo_variable: e.target.value }))}>
                    <option value="F">F — Fijo</option>
                    <option value="V">V — Variable</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label>Periodicidad</label>
                  <select className="input" value={formCon.periodicidad}
                    onChange={e => setFormCon(p => ({ ...p, periodicidad: e.target.value, dia_pago: '', mes_ciclo: '', dia_vencimiento: '' }))}>
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Monto presupuestado</label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={formCon.monto_presupuestado}
                    onChange={e => setFormCon(p => ({ ...p, monto_presupuestado: e.target.value }))}
                    style={{ fontFamily: 'var(--mono)' }} />
                </div>
              </div>

              {/* Fecha de pago — solo si Fijo */}
              {formCon.fijo_variable === 'F' && (
                <>
                  {formCon.periodicidad === 'Mensual' ? (
                    <div className="input-group">
                      <label>Día de pago (1–31)</label>
                      <input className="input" type="number" min="1" max="31" placeholder="Ej: 1, 15, 30"
                        value={formCon.dia_pago}
                        onChange={e => setFormCon(p => ({ ...p, dia_pago: e.target.value }))} />
                    </div>
                  ) : (
                    <div className="grid-2">
                      <div className="input-group">
                        <label>
                          Mes del ciclo
                          <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>
                            (1–{formCon.periodicidad === 'Bimensual' ? 2 : formCon.periodicidad === 'Trimestral' ? 3 : formCon.periodicidad === 'Semestral' ? 6 : 12})
                          </span>
                        </label>
                        <input className="input" type="number" min="1"
                          max={formCon.periodicidad === 'Bimensual' ? 2 : formCon.periodicidad === 'Trimestral' ? 3 : formCon.periodicidad === 'Semestral' ? 6 : 12}
                          placeholder="Ej: 3"
                          value={formCon.mes_ciclo}
                          onChange={e => setFormCon(p => ({ ...p, mes_ciclo: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Día de vencimiento</label>
                        <input className="input" type="number" min="1" max="31" placeholder="Ej: 20"
                          value={formCon.dia_vencimiento}
                          onChange={e => setFormCon(p => ({ ...p, dia_vencimiento: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="input-group">
                <label>Observaciones (opcional)</label>
                <input className="input" type="text" placeholder="Notas..."
                  value={formCon.observaciones}
                  onChange={e => setFormCon(p => ({ ...p, observaciones: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }}
                  onClick={() => setModalCon(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                  disabled={saving}>{saving ? 'Guardando...' : editandoCon ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
