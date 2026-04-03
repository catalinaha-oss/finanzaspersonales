import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const TIPOS = ['Ingreso', 'Gasto', 'Ahorro/Inversión']
const TIPO_COLORS = { 'Ingreso': 'var(--green)', 'Gasto': 'var(--red)', 'Ahorro/Inversión': 'var(--amber)' }

export default function ConfigPage() {
  const { user, signOut } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'Gasto' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('categorias')
      .select('id, tipo, nombre, orden, conceptos(id)').eq('user_id', user.id)
      .eq('user_id', user.id)
      .order('tipo').order('nombre')
    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  function abrirNueva() {
    setEditando(null)
    setForm({ nombre: '', tipo: 'Gasto' })
    setShowModal(true)
  }

  function abrirEditar(cat) {
    setEditando(cat.id)
    setForm({ nombre: cat.nombre, tipo: cat.tipo })
    setShowModal(true)
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    if (editando) {
      await supabase.from('categorias')
        .update({ nombre: form.nombre.trim(), tipo: form.tipo })
        .eq('id', editando).eq('user_id', user.id)
    } else {
      await supabase.from('categorias')
        .insert({ user_id: user.id, nombre: form.nombre.trim(), tipo: form.tipo, orden: categorias.length })
    }
    setSaving(false)
    setShowModal(false)
    load()
  }

  async function eliminar(id, nConceptos) {
    if (nConceptos > 0) {
      alert(`Esta categoría tiene ${nConceptos} concepto(s). Reasígnalos antes de eliminar.`)
      return
    }
    if (!confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categorias').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  const porTipo = TIPOS.map(tipo => ({
    tipo,
    cats: categorias.filter(c => c.tipo === tipo)
  })).filter(g => g.cats.length > 0)

  return (
    <div className="page animate-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Configuración</h1>
          <p>{categorias.length} categorías</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={abrirNueva}>+ Categoría</button>
      </div>

      {loading ? (
        [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 10 }} />)
      ) : categorias.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text2)' }}>
          <p style={{ marginBottom: 12 }}>No tienes categorías aún</p>
          <button className="btn btn-primary" onClick={abrirNueva}>Crear primera categoría</button>
        </div>
      ) : porTipo.map(({ tipo, cats }) => (
        <div key={tipo} style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIPO_COLORS[tipo], marginBottom: 8, paddingLeft: 2 }}>
            {tipo} · {cats.length}
          </p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {cats.map((cat, i) => (
              <div key={cat.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                borderBottom: i < cats.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[tipo], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{cat.nombre}</span>
                {cat.conceptos?.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginRight: 4 }}>
                    {cat.conceptos.length}
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(cat)}
                  style={{ padding: '3px 10px', fontSize: '0.78rem' }}>
                  Editar
                </button>
                <button onClick={() => eliminar(cat.id, cat.conceptos?.length || 0)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem', padding: '2px 4px', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

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

      {/* Modal agregar / editar — padding-bottom para no tapar con nav */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ paddingBottom: 'calc(1.5rem + var(--nav-h) + var(--safe-bot))' }}>
            <div className="modal-handle" />
            <h2>{editando ? 'Editar categoría' : 'Nueva categoría'}</h2>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Nombre</label>
                <input className="input" required placeholder="Ej: Salud, Gym, Mascotas..."
                  value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  autoFocus />
              </div>
              <div className="input-group">
                <label>Tipo</label>
                <select className="input" value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }}
                  onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                  disabled={saving}>
                  {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
