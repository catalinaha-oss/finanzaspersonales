import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import TarjetasPage from './TarjetasPage'

const TIPOS          = ['Ingreso', 'Gasto', 'Ahorro/Inversión']
const TIPO_COLORS    = { 'Ingreso': 'var(--green)', 'Gasto': 'var(--red)', 'Ahorro/Inversión': 'var(--amber)' }
const PERIODICIDADES = ['Mensual','Bimensual','Trimestral','Semestral','Anual']

export default function ConfigPage() {
  const { user, signOut } = useAuth()

  // ── hooks al inicio, sin excepción ──
  const [categorias,  setCategorias]  = useState([])
  const [conceptos,   setConceptos]   = useState([])
  const [txConceptos, setTxConceptos] = useState({})
  const [txCats,      setTxCats]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [errorMsg,    setErrorMsg]    = useState('')
  const [vista,       setVista]       = useState('menu') // 'menu' | 'categorias' | 'conceptos' | 'tarjetas'
  const [catSel,      setCatSel]      = useState(null)
  const [modalCat,    setModalCat]    = useState(false)
  const [modalCon,    setModalCon]    = useState(false)
  const [editandoCat, setEditCat]     = useState(null)
  const [editandoCon, setEditCon]     = useState(null)
  const [formCat,  setFormCat]  = useState({ nombre: '', tipo: 'Gasto' })
  const [formCon,  setFormCon]  = useState({ nombre: '', esencial: 'E', fijo_variable: 'F', periodicidad: 'Mensual', monto_presupuestado: '', dia_pago: '', mes_ciclo: '', dia_vencimiento: '', observaciones: '', meta_id: '' })
  const [metas,       setMetas]       = useState([])
  const [saving,      setSaving]      = useState(false)

  async function load() {
    setLoading(true); setErrorMsg('')
    const [
      { data: cats, error: e1 },
      { data: cons },
      { data: txs  },
      { data: mts  },
    ] = await Promise.all([
      supabase.from('categorias').select('id, tipo, nombre, orden').eq('user_id', user.id).order('tipo').order('nombre'),
      supabase.from('conceptos').select('id, nombre, categoria_id, meta_id, esencial, fijo_variable, periodicidad, monto_presupuestado, dia_pago, mes_ciclo, dia_vencimiento, activo').eq('user_id', user.id).order('nombre'),
      supabase.from('transacciones').select('concepto_id').eq('user_id', user.id).not('concepto_id', 'is', null),
      supabase.from('metas').select('id, nombre').eq('user_id', user.id).eq('activo', true).order('nombre'),
    ])
    if (e1) { setErrorMsg('Error: ' + e1.message); setLoading(false); return }
    const txCon = {}
    for (const t of txs || []) if (t.concepto_id) txCon[t.concepto_id] = (txCon[t.concepto_id] || 0) + 1
    const txCat = {}
    for (const c of cons || []) if (txCon[c.id]) txCat[c.categoria_id] = (txCat[c.categoria_id] || 0) + txCon[c.id]
    setCategorias(cats || []); setConceptos(cons || []); setMetas(mts || [])
    setTxConceptos(txCon); setTxCats(txCat); setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  // ── Categorías ──
  function abrirNuevaCat() { setEditCat(null); setFormCat({ nombre: '', tipo: 'Gasto' }); setModalCat(true) }
  function abrirEditarCat(cat) { setEditCat(cat.id); setFormCat({ nombre: cat.nombre, tipo: cat.tipo }); setModalCat(true) }
  async function guardarCat(e) {
    e.preventDefault(); if (!formCat.nombre.trim()) return; setSaving(true)
    const payload = { nombre: formCat.nombre.trim(), tipo: formCat.tipo }
    const { error } = editandoCat
      ? await supabase.from('categorias').update(payload).eq('id', editandoCat).eq('user_id', user.id)
      : await supabase.from('categorias').insert({ ...payload, user_id: user.id, orden: categorias.length })
    setSaving(false); if (error) { alert('Error: ' + error.message); return }
    setModalCat(false); load()
  }
  async function eliminarCat(cat) {
    const activos = conceptos.filter(c => c.categoria_id === cat.id && c.activo)
    if (activos.length > 0) { alert(`Tiene ${activos.length} concepto(s) activo(s). Primero elimínalos.`); return }
    const ids = conceptos.filter(c => c.categoria_id === cat.id).map(c => c.id)
    if (ids.length > 0) {
      const { count } = await supabase.from('transacciones').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('concepto_id', ids)
      if (count > 0) { alert(`Tiene ${count} movimiento(s). No se puede eliminar.`); return }
    }
    if (!confirm(`¿Eliminar "${cat.nombre}"?`)) return
    const { error } = await supabase.from('categorias').delete().eq('id', cat.id).eq('user_id', user.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  // ── Conceptos ──
  function abrirConceptos(cat) { setCatSel(cat); setVista('conceptos') }
  function abrirNuevoCon() {
    setEditCon(null)
    setFormCon({ nombre: '', esencial: 'E', fijo_variable: 'F', periodicidad: 'Mensual', monto_presupuestado: '', dia_pago: '', mes_ciclo: '', dia_vencimiento: '', observaciones: '', meta_id: '' })
    setModalCon(true)
  }
  function abrirEditarCon(con) {
    setEditCon(con.id)
    setFormCon({ nombre: con.nombre||'', esencial: con.esencial||'E', fijo_variable: con.fijo_variable||'F', periodicidad: con.periodicidad||'Mensual', monto_presupuestado: con.monto_presupuestado!=null?String(con.monto_presupuestado):'', dia_pago: con.dia_pago!=null?String(con.dia_pago):'', mes_ciclo: con.mes_ciclo!=null?String(con.mes_ciclo):'', dia_vencimiento: con.dia_vencimiento!=null?String(con.dia_vencimiento):'', observaciones: con.observaciones||'', meta_id: con.meta_id||'' })
    setModalCon(true)
  }
  async function guardarCon(e) {
    e.preventDefault(); if (!formCon.nombre.trim() || !catSel) return; setSaving(true)
    const payload = { nombre: formCon.nombre.trim(), esencial: formCon.esencial, fijo_variable: formCon.fijo_variable, periodicidad: formCon.periodicidad, monto_presupuestado: formCon.monto_presupuestado ? parseFloat(formCon.monto_presupuestado) : null, dia_pago: formCon.dia_pago ? parseInt(formCon.dia_pago) : null, mes_ciclo: formCon.mes_ciclo ? parseInt(formCon.mes_ciclo) : null, dia_vencimiento: formCon.dia_vencimiento ? parseInt(formCon.dia_vencimiento) : null, observaciones: formCon.observaciones || null, meta_id: formCon.meta_id || null }
    const { error } = editandoCon
      ? await supabase.from('conceptos').update(payload).eq('id', editandoCon).eq('user_id', user.id)
      : await supabase.from('conceptos').insert({ ...payload, user_id: user.id, categoria_id: catSel.id, activo: true })
    setSaving(false); if (error) { alert('Error: ' + error.message); return }
    setModalCon(false); load()
  }
  async function eliminarCon(con) {
    const { count } = await supabase.from('transacciones').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('concepto_id', con.id)
    if (count > 0) { alert(`Tiene ${count} movimiento(s). No se puede eliminar.`); return }
    if (!confirm(`¿Eliminar "${con.nombre}"?`)) return
    const { error } = await supabase.from('conceptos').delete().eq('id', con.id).eq('user_id', user.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }
  async function toggleActivo(con) {
    await supabase.from('conceptos').update({ activo: !con.activo }).eq('id', con.id).eq('user_id', user.id)
    load()
  }

  const porTipo        = TIPOS.map(tipo => ({ tipo, cats: categorias.filter(c => c.tipo === tipo) })).filter(g => g.cats.length > 0)
  const conceptosDeCat = catSel ? conceptos.filter(c => c.categoria_id === catSel.id) : []
  const maxCiclo       = { Bimensual: 2, Trimestral: 3, Semestral: 6, Anual: 12 }

  function labelFecha(con) {
    if (con.fijo_variable !== 'F') return null
    if (con.periodicidad === 'Mensual' && con.dia_pago) return `Día ${con.dia_pago} c/mes`
    if (con.mes_ciclo && con.dia_vencimiento) return `Mes ${con.mes_ciclo} · Día ${con.dia_vencimiento}`
    return null
  }

  return (
    <div className="page animate-in">
      <div className="page-header">
        {vista === 'conceptos' ? (
          <div>
            <button onClick={() => setVista('categorias')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font)', padding: 0, marginBottom: 6 }}>← Categorías</button>
            <h1 style={{ fontSize: '1.3rem' }}>{catSel?.nombre}</h1>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{conceptosDeCat.length} concepto{conceptosDeCat.length !== 1 ? 's' : ''}</p>
          </div>
        ) : vista === 'categorias' ? (
          <div>
            <button onClick={() => setVista('menu')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font)', padding: 0, marginBottom: 6 }}>← Configuración</button>
            <h1>Categorías y conceptos</h1>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{categorias.length} categorías · {conceptos.length} conceptos</p>
          </div>
        ) : vista === 'tarjetas' ? (
          <div>
            <button onClick={() => setVista('menu')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font)', padding: 0, marginBottom: 6 }}>← Configuración</button>
            <h1>Tarjetas de crédito</h1>
          </div>
        ) : (
          <div>
            <h1>Configuración</h1>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{user.email}</p>
          </div>
        )}
      </div>

      {/* ── VISTA MENÚ PRINCIPAL ── */}
      {vista === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={() => { setVista('categorias'); load() }}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1rem 1.25rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', width: '100%' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
            </div>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Administrar categorías</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>Categorías, conceptos y presupuestos</p>
            </div>
            <svg style={{ marginLeft: 'auto', color: 'var(--text3)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          <button
            onClick={() => setVista('tarjetas')}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1rem 1.25rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', width: '100%' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(247,180,79,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
            </div>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Administrar tarjetas de crédito</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>Deudas, cuotas y carga de extractos</p>
            </div>
            <svg style={{ marginLeft: 'auto', color: 'var(--text3)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          <div style={{ marginTop: '0.5rem', padding: '1rem 1.25rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 6 }}>Cuenta activa</p>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 12 }}>{user.email}</p>
            <button className="btn btn-ghost w-full" onClick={signOut} style={{ justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(247,95,95,0.3)' }}>Cerrar sesión</button>
          </div>
        </div>
      )}

      {/* ── VISTA TARJETAS ── */}
      {vista === 'tarjetas' && <TarjetasPage />}

      {errorMsg && <div style={{ background: 'rgba(247,95,95,0.1)', border: '1px solid rgba(247,95,95,0.3)', borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1rem' }}>{errorMsg}</div>}

      {/* ── VISTA CATEGORÍAS ── */}
      {vista === 'categorias' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={abrirNuevaCat}>+ Categoría</button>
          </div>
          {loading ? [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 10 }} />) :
           categorias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
              <p style={{ marginBottom: 12 }}>No tienes categorías aún</p>
              <button className="btn btn-primary" onClick={abrirNuevaCat}>Crear primera categoría</button>
            </div>
          ) : porTipo.map(({ tipo, cats }) => (
            <div key={tipo} style={{ marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIPO_COLORS[tipo], marginBottom: 8, paddingLeft: 2 }}>{tipo} · {cats.length}</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {cats.map((cat, i) => {
                  const nCon = conceptos.filter(c => c.categoria_id === cat.id).length
                  const nTx  = txCats[cat.id] || 0
                  const ok   = nTx === 0 && conceptos.filter(c => c.categoria_id === cat.id && c.activo).length === 0
                  return (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: i < cats.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[tipo], flexShrink: 0 }} />
                      <button onClick={() => abrirConceptos(cat)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'var(--font)' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>{cat.nombre}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginLeft: 8 }}>{nCon} concepto{nCon !== 1 ? 's' : ''}{nTx > 0 ? ` · ${nTx} mov.` : ''}</span>
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarCat(cat)} style={{ padding: '3px 10px', fontSize: '0.78rem', flexShrink: 0 }}>Editar</button>
                      <button onClick={() => eliminarCat(cat)} title={ok ? 'Eliminar' : 'Tiene movimientos o conceptos activos'} style={{ background: 'none', border: 'none', cursor: ok ? 'pointer' : 'not-allowed', color: ok ? 'var(--text3)' : 'var(--bg4)', fontSize: '1.1rem', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* fin lista categorías */}
        </>
      )}

      {/* ── VISTA CONCEPTOS ── */}
      {vista === 'conceptos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={abrirNuevoCon}>+ Concepto</button>
          </div>
          {loading ? [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8, borderRadius: 10 }} />) :
           conceptosDeCat.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
              <p style={{ marginBottom: 12 }}>Esta categoría no tiene conceptos</p>
              <button className="btn btn-primary" onClick={abrirNuevoCon}>Crear primer concepto</button>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {conceptosDeCat.map((con, i) => {
                const nTx = txConceptos[con.id] || 0
                const ok  = nTx === 0
                return (
                  <div key={con.id} style={{ padding: '11px 14px', borderBottom: i < conceptosDeCat.length - 1 ? '1px solid var(--border)' : 'none', opacity: con.activo ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{con.nombre}</span>
                          {!con.activo && <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>inactivo</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <span className={`badge ${con.esencial === 'E' ? 'badge-blue' : 'badge-purple'}`}>{con.esencial}</span>
                          <span className={`badge ${con.fijo_variable === 'F' ? 'badge-green' : 'badge-amber'}`}>{con.fijo_variable === 'F' ? 'Fijo' : 'Variable'}</span>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text2)' }}>{con.periodicidad}</span>
                          {con.monto_presupuestado != null && <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text2)' }}>${Number(con.monto_presupuestado).toLocaleString('es-CO')}</span>}
                          {labelFecha(con) && <span className="badge" style={{ background: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }}>{labelFecha(con)}</span>}
                          {con.meta_id && metas.find(m => m.id === con.meta_id) && (
                            <span className="badge" style={{ background: 'rgba(247,180,79,0.12)', color: 'var(--amber)' }}>
                              🎯 {metas.find(m => m.id === con.meta_id)?.nombre}
                            </span>
                          )}
                          {nTx > 0 && <span className="badge" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text3)' }}>{nTx} mov.</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarCon(con)} style={{ padding: '3px 8px', fontSize: '0.75rem' }}>Editar</button>
                        <button onClick={() => toggleActivo(con)} title={con.activo ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.85rem', padding: '3px 4px' }}>{con.activo ? '⏸' : '▶'}</button>
                        <button onClick={() => eliminarCon(con)} title={ok ? 'Eliminar' : `${nTx} movimientos`} style={{ background: 'none', border: 'none', cursor: ok ? 'pointer' : 'not-allowed', color: ok ? 'var(--text3)' : 'var(--bg4)', fontSize: '1.1rem', padding: '2px 4px', lineHeight: 1 }}>×</button>
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
              <div className="input-group"><label>Nombre</label><input className="input" required placeholder="Ej: Salud, Gym..." value={formCat.nombre} onChange={e => setFormCat(p => ({ ...p, nombre: e.target.value }))} autoFocus /></div>
              <div className="input-group"><label>Tipo</label>
                <select className="input" value={formCat.tipo} onChange={e => setFormCat(p => ({ ...p, tipo: e.target.value }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={() => setModalCat(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }} disabled={saving}>{saving ? 'Guardando...' : editandoCat ? 'Actualizar' : 'Crear'}</button>
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
            <h2>{editandoCon ? 'Editar concepto' : `Nuevo · ${catSel?.nombre}`}</h2>
            <form onSubmit={guardarCon} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="input-group"><label>Nombre</label><input className="input" required placeholder="Ej: Arriendo, Mercado..." value={formCon.nombre} onChange={e => setFormCon(p => ({ ...p, nombre: e.target.value }))} autoFocus /></div>
              <div className="grid-2">
                <div className="input-group"><label>Esencial</label>
                  <select className="input" value={formCon.esencial} onChange={e => setFormCon(p => ({ ...p, esencial: e.target.value }))}>
                    <option value="E">E — Esencial</option><option value="NE">NE — No esencial</option><option value="N/A">N/A</option>
                  </select>
                </div>
                <div className="input-group"><label>Fijo / Variable</label>
                  <select className="input" value={formCon.fijo_variable} onChange={e => setFormCon(p => ({ ...p, fijo_variable: e.target.value }))}>
                    <option value="F">F — Fijo</option><option value="V">V — Variable</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="input-group"><label>Periodicidad</label>
                  <select className="input" value={formCon.periodicidad} onChange={e => setFormCon(p => ({ ...p, periodicidad: e.target.value, dia_pago: '', mes_ciclo: '', dia_vencimiento: '' }))}>
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="input-group"><label>Monto presupuestado</label>
                  <input className="input" type="number" min="0" placeholder="0" value={formCon.monto_presupuestado} onChange={e => setFormCon(p => ({ ...p, monto_presupuestado: e.target.value }))} style={{ fontFamily: 'var(--mono)' }} />
                </div>
              </div>
              {formCon.fijo_variable === 'F' && (
                formCon.periodicidad === 'Mensual' ? (
                  <div className="input-group"><label>Día de pago (1–31)</label><input className="input" type="number" min="1" max="31" placeholder="Ej: 15" value={formCon.dia_pago} onChange={e => setFormCon(p => ({ ...p, dia_pago: e.target.value }))} /></div>
                ) : (
                  <div className="grid-2">
                    <div className="input-group"><label>Mes del ciclo (1–{maxCiclo[formCon.periodicidad]||12})</label><input className="input" type="number" min="1" max={maxCiclo[formCon.periodicidad]||12} value={formCon.mes_ciclo} onChange={e => setFormCon(p => ({ ...p, mes_ciclo: e.target.value }))} /></div>
                    <div className="input-group"><label>Día vencimiento</label><input className="input" type="number" min="1" max="31" placeholder="Ej: 20" value={formCon.dia_vencimiento} onChange={e => setFormCon(p => ({ ...p, dia_vencimiento: e.target.value }))} /></div>
                  </div>
                )
              )}
              <div className="input-group"><label>Observaciones (opcional)</label><input className="input" type="text" placeholder="Notas..." value={formCon.observaciones} onChange={e => setFormCon(p => ({ ...p, observaciones: e.target.value }))} /></div>

              {/* Meta asociada — solo para conceptos de Ahorro/Inversión */}
              {catSel?.tipo === 'Ahorro/Inversión' && (
                <div className="input-group">
                  <label>Meta asociada (opcional)</label>
                  <select className="input" value={formCon.meta_id}
                    onChange={e => setFormCon(p => ({ ...p, meta_id: e.target.value }))}>
                    <option value="">— Sin meta asociada —</option>
                    {metas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                    Si está asociada, al registrar un aporte se actualizará automáticamente el acumulado de la meta.
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={() => setModalCon(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }} disabled={saving}>{saving ? 'Guardando...' : editandoCon ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
