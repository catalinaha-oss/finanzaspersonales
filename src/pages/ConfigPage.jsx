import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import TarjetasPage   from './TarjetasPage'
import NominaUploader from '../components/NominaUploader'

export default function ConfigPage() {
  const { user } = useAuth()

  // ── todos los hooks al inicio ──
  const [vista,         setVista]         = useState('menu')   // 'menu' | 'categorias' | 'tarjetas'
  const [modalNomina,   setModalNomina]   = useState(false)
  const [categorias,    setCategorias]    = useState([])
  const [conceptos,     setConceptos]     = useState([])
  const [loading,       setLoading]       = useState(false)
  const [editCat,       setEditCat]       = useState(null)
  const [editCon,       setEditCon]       = useState(null)
  const [formCat,       setFormCat]       = useState({ nombre: '', tipo: 'Gasto' })
  const [formCon,       setFormCon]       = useState({ nombre: '', categoria_id: '', activo: true })
  const [savingCat,     setSavingCat]     = useState(false)
  const [savingCon,     setSavingCon]     = useState(false)
  const [catFiltro,     setCatFiltro]     = useState('')

  async function loadCatalogo() {
    setLoading(true)
    const [{ data: cats }, { data: cons }] = await Promise.all([
      supabase.from('categorias').select('id, nombre, tipo').order('nombre'),
      supabase.from('conceptos').select('id, nombre, categoria_id, activo')
        .eq('user_id', user.id).order('nombre'),
    ])
    setCategorias(cats || [])
    setConceptos(cons || [])
    setLoading(false)
  }

  useEffect(() => {
    if (vista === 'categorias') loadCatalogo()
  }, [vista])

  // ── Categorías ──
  async function saveCat(e) {
    e.preventDefault()
    setSavingCat(true)
    if (editCat) {
      await supabase.from('categorias').update({ nombre: formCat.nombre, tipo: formCat.tipo }).eq('id', editCat.id)
    } else {
      await supabase.from('categorias').insert({ nombre: formCat.nombre, tipo: formCat.tipo, user_id: user.id })
    }
    setEditCat(null)
    setFormCat({ nombre: '', tipo: 'Gasto' })
    setSavingCat(false)
    loadCatalogo()
  }

  function startEditCat(c) {
    setEditCat(c)
    setFormCat({ nombre: c.nombre, tipo: c.tipo })
  }

  async function deleteCat(id) {
    await supabase.from('categorias').delete().eq('id', id)
    loadCatalogo()
  }

  // ── Conceptos ──
  async function saveCon(e) {
    e.preventDefault()
    setSavingCon(true)
    if (editCon) {
      await supabase.from('conceptos').update({
        nombre: formCon.nombre,
        categoria_id: formCon.categoria_id || null,
        activo: formCon.activo,
      }).eq('id', editCon.id).eq('user_id', user.id)
    } else {
      await supabase.from('conceptos').insert({
        nombre: formCon.nombre,
        categoria_id: formCon.categoria_id || null,
        activo: true,
        user_id: user.id,
      })
    }
    setEditCon(null)
    setFormCon({ nombre: '', categoria_id: '', activo: true })
    setSavingCon(false)
    loadCatalogo()
  }

  function startEditCon(c) {
    setEditCon(c)
    setFormCon({ nombre: c.nombre, categoria_id: c.categoria_id || '', activo: c.activo })
  }

  async function toggleActivoCon(c) {
    await supabase.from('conceptos').update({ activo: !c.activo }).eq('id', c.id).eq('user_id', user.id)
    loadCatalogo()
  }

  async function deleteCon(id) {
    await supabase.from('conceptos').delete().eq('id', id).eq('user_id', user.id)
    loadCatalogo()
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  const catMap = {}
  for (const c of categorias) catMap[c.id] = c

  const conceptosFiltrados = catFiltro
    ? conceptos.filter(c => c.categoria_id === catFiltro)
    : conceptos

  // ─────────────────────────────────────────────────────────────
  // VISTA: MENÚ HUB
  // ─────────────────────────────────────────────────────────────
  if (vista === 'menu') {
    return (
      <div className="page">
        <h1 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>Configuración</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Administrar categorías */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 14, padding: '1rem 1.1rem', borderRadius: 12, border: '1px solid var(--border)' }}
            onClick={() => setVista('categorias')}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 6h16M4 10h16M4 14h8"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Administrar categorías</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Categorías y conceptos de gasto e ingreso</p>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>›</span>
          </button>

          {/* Administrar tarjetas */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 14, padding: '1rem 1.1rem', borderRadius: 12, border: '1px solid var(--border)' }}
            onClick={() => setVista('tarjetas')}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Administrar tarjetas de crédito</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Deudas, extractos y proyecciones TC</p>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>›</span>
          </button>

          {/* Cargar nómina — NUEVO */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 14, padding: '1rem 1.1rem', borderRadius: 12, border: '1px solid var(--border)' }}
            onClick={() => setModalNomina(true)}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Cargar comprobante de nómina</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Registra todos los conceptos automáticamente</p>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>›</span>
          </button>

          {/* Cerrar sesión */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 14, padding: '1rem 1.1rem', borderRadius: 12, border: '1px solid var(--border)', marginTop: '0.5rem' }}
            onClick={cerrarSesion}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--red)' }}>Cerrar sesión</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Salir de tu cuenta</p>
            </div>
          </button>
        </div>

        {/* Modal nómina */}
        {modalNomina && (
          <NominaUploader
            onClose={() => setModalNomina(false)}
            onSaved={() => setModalNomina(false)}
          />
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // VISTA: TARJETAS (inline, igual que antes)
  // ─────────────────────────────────────────────────────────────
  if (vista === 'tarjetas') {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setVista('menu')} style={{ padding: '4px 10px' }}>← Volver</button>
          <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Tarjetas de crédito</h1>
        </div>
        <TarjetasPage />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // VISTA: CATEGORÍAS (igual que antes)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setVista('menu')} style={{ padding: '4px 10px' }}>← Volver</button>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Categorías y conceptos</h1>
      </div>

      {loading ? (
        <div style={{ paddingTop: '1rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 10, borderRadius: 10 }} />)}
        </div>
      ) : (
        <>
          {/* ── Formulario categoría ── */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              {editCat ? `Editar: ${editCat.nombre}` : 'Nueva categoría'}
            </h3>
            <form onSubmit={saveCat} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input className="input" placeholder="Nombre" value={formCat.nombre}
                onChange={e => setFormCat(p => ({ ...p, nombre: e.target.value }))} required />
              <select className="input" value={formCat.tipo}
                onChange={e => setFormCat(p => ({ ...p, tipo: e.target.value }))}>
                <option value="Gasto">Gasto</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Ahorro/Inversión">Ahorro/Inversión</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                {editCat && (
                  <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => { setEditCat(null); setFormCat({ nombre: '', tipo: 'Gasto' }) }}>Cancelar</button>
                )}
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={savingCat}>
                  {savingCat ? 'Guardando...' : editCat ? 'Actualizar' : 'Agregar categoría'}
                </button>
              </div>
            </form>
          </div>

          {/* ── Lista categorías ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            {['Ingreso', 'Gasto', 'Ahorro/Inversión'].map(tipo => {
              const cats = categorias.filter(c => c.tipo === tipo)
              if (cats.length === 0) return null
              return (
                <div key={tipo} style={{ marginBottom: '0.75rem' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>{tipo}</p>
                  {cats.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, fontSize: '0.88rem' }}>{c.nombre}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEditCat(c)} style={{ fontSize: '0.75rem' }}>Editar</button>
                      <button onClick={() => deleteCat(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* ── Formulario concepto ── */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              {editCon ? `Editar: ${editCon.nombre}` : 'Nuevo concepto'}
            </h3>
            <form onSubmit={saveCon} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input className="input" placeholder="Nombre del concepto" value={formCon.nombre}
                onChange={e => setFormCon(p => ({ ...p, nombre: e.target.value }))} required />
              <select className="input" value={formCon.categoria_id}
                onChange={e => setFormCon(p => ({ ...p, categoria_id: e.target.value }))}>
                <option value="">— Sin categoría —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
              </select>
              {editCon && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={formCon.activo}
                    onChange={e => setFormCon(p => ({ ...p, activo: e.target.checked }))} />
                  Activo
                </label>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {editCon && (
                  <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => { setEditCon(null); setFormCon({ nombre: '', categoria_id: '', activo: true }) }}>Cancelar</button>
                )}
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={savingCon}>
                  {savingCon ? 'Guardando...' : editCon ? 'Actualizar' : 'Agregar concepto'}
                </button>
              </div>
            </form>
          </div>

          {/* ── Lista conceptos ── */}
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', alignItems: 'center' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Conceptos</p>
              <select className="input" value={catFiltro}
                onChange={e => setCatFiltro(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '4px 8px', height: 30, flex: 1 }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {conceptosFiltrados.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0', borderBottom: '1px solid var(--border)', opacity: c.activo ? 1 : 0.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem' }}>{c.nombre}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{catMap[c.categoria_id]?.nombre || 'Sin categoría'}</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => startEditCon(c)} style={{ fontSize: '0.72rem' }}>Editar</button>
                <button onClick={() => toggleActivoCon(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.activo ? 'var(--amber)' : 'var(--text3)', fontSize: '0.72rem', fontFamily: 'var(--font)' }}>
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => deleteCon(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
