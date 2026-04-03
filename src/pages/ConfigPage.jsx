import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const TIPOS = ['Ingreso', 'Gasto', 'Ahorro/Inversión']

export default function ConfigPage() {
  const { user, signOut } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [editando, setEditando]     = useState(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'Gasto' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('categorias')
      .select('*, conceptos(id)')
      .eq('user_id', user.id)
      .order('tipo').order('nombre')
    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

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
    setShowAdd(false); setEditando(null)
    setForm({ nombre: '', tipo: 'Gasto' })
    load()
  }

  async function eliminar(id, totalConceptos) {
    if (totalConceptos > 0) {
      alert(`Esta categoría tiene ${totalConceptos} concepto(s) asociado(s). Reasígnalos antes de eliminar.`)
      return
    }
    if (!confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categorias').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  function iniciarEdicion(cat) {
    setEditando(cat.id)
    setForm({ nombre: cat.nombre, tipo: cat.tipo })
    setShowAdd(true)
  }

  const porTipo = TIPOS.map(tipo => ({
    tipo,
    cats: categorias.filter(c => c.tipo === tipo)
  })).filter(g => g.cats.length > 0)

  const TIPO_COLORS = {
    'Ingreso': 'var(--green)',
    'Gasto': 'var(--red)',
    'Ahorro/Inversión': 'var(--amber)'
  }

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Categorías y cuenta</p>
      </div>

      {/* Categorías */}
      <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Mis categorías</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditando(null); setForm({ nombre: '', tipo: 'Gasto' }) }}>
          + Nueva
        </button>
      </div>

      {loading ? (
        [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8, borderRadius: 10 }} />)
      ) : (
        porTipo.map(({ tipo, cats }) => (
          <div key={tipo} style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIPO_COLORS[tipo], marginBottom: 8 }}>
              {tipo} · {cats.length}
            </p>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {cats.map((cat, i) => (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 16px',
                  borderBottom: i < cats.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[tipo], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{cat.nombre}</span>
                    {cat.conceptos?.length > 0 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                        {cat.conceptos.length} conceptos
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => iniciarEdicion(cat)}
                      style={{ padding: '3px 10px' }}>
                      Editar
                    </button>
                    <button onClick={() => eliminar(cat.id, cat.conceptos?.length || 0)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.78rem', padding: '3px 6px' }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Cuenta */}
      <div className="divider" style={{ margin: '1.5rem 0' }} />
      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Cuenta</h2>
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: 4 }}>Usuario activo</p>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '0.875rem' }}>{user.email}</p>
      </div>
      <button className="btn btn-ghost w-full" onClick={signOut}
        style={{ justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(247,95,95,0.3)' }}>
        Cerrar sesión
      </button>

      {/* Modal agregar/editar categoría */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-handle" />
            <h2>{editando ? 'Editar categoría' : 'Nueva categoría'}</h2>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Nombre</label>
                <input className="input" required placeholder="Ej: Salud, Mascota, Gym..."
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
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-ghost w-full"
                  style={{ justifyContent: 'center' }}
                  onClick={() => { setShowAdd(false); setEditando(null) }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary w-full"
                  style={{ justifyContent: 'center' }} disabled={saving}>
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
