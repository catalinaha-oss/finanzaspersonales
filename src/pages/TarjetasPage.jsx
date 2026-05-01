import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import TarjetaModal    from '../components/TarjetaModal'
import DeudaModal      from '../components/DeudaModal'
import ExtractoUploader from '../components/ExtractoUploader'

const COP = v => v == null ? '—' : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v)

export default function TarjetasPage() {
  const { user } = useAuth()

  // ── todos los hooks al inicio ──
  const [tarjetas,        setTarjetas]        = useState([])
  const [deudas,          setDeudas]          = useState([])
  const [loading,         setLoading]         = useState(true)
  const [expandida,       setExpandida]        = useState(null)
  const [modalTarjeta,    setModalTarjeta]    = useState(false)
  const [editTarjeta,     setEditTarjeta]     = useState(null)
  const [modalDeuda,      setModalDeuda]      = useState(false)
  const [editDeuda,       setEditDeuda]       = useState(null)
  const [tarjetaActiva,   setTarjetaActiva]   = useState(null)
  const [modalExtracto,   setModalExtracto]   = useState(false)
  const [tarjetaExtracto, setTarjetaExtracto] = useState(null)
  const [confirmDel,      setConfirmDel]      = useState(null) // {tipo:'tarjeta'|'deuda', id, nombre}

  async function load() {
    setLoading(true)
    const [{ data: tcs }, { data: deus }] = await Promise.all([
      supabase.from('tarjetas_credito').select('id, nombre, fecha_corte, ultimos_digitos').eq('user_id', user.id).order('nombre'),
      supabase.from('deudas_tc').select('*').eq('user_id', user.id).order('fecha_compra', { ascending: false }),
    ])
    setTarjetas(tcs || [])
    setDeudas(deus || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  function deudaDeTC(tarjetaId) { return deudas.filter(d => d.tarjeta_id === tarjetaId) }

  function saldoTC(tarjetaId) {
    return deudaDeTC(tarjetaId).reduce((s, d) => s + (Number(d.saldo_pendiente) || 0), 0)
  }
  function cuotaMesTC(tarjetaId) {
    return deudaDeTC(tarjetaId).reduce((s, d) => s + (Number(d.cuota_mes) || 0), 0)
  }

  function abrirNuevaTarjeta()       { setEditTarjeta(null); setModalTarjeta(true) }
  function abrirEditarTarjeta(tc)    { setEditTarjeta(tc);   setModalTarjeta(true) }
  function abrirNuevaDeuda(tc)       { setEditDeuda(null);  setTarjetaActiva(tc); setModalDeuda(true) }
  function abrirEditarDeuda(d, tc)   { setEditDeuda(d);     setTarjetaActiva(tc); setModalDeuda(true) }
  function abrirExtracto(tc)         { setTarjetaExtracto(tc); setModalExtracto(true) }

  async function eliminarTarjeta(id) {
    await supabase.from('deudas_tc').delete().eq('tarjeta_id', id).eq('user_id', user.id)
    await supabase.from('tarjetas_credito').delete().eq('id', id).eq('user_id', user.id)
    setConfirmDel(null)
    load()
  }
  async function eliminarDeuda(id) {
    await supabase.from('deudas_tc').delete().eq('id', id).eq('user_id', user.id)
    setConfirmDel(null)
    load()
  }

  const pctUsado = (pagadas, totales) => totales > 0 ? Math.round((pagadas / totales) * 100) : 0
  const cuotaActual = d => (d.cuotas_pagadas || 0) + 1

  const barColor = pct => pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'

  if (loading) return (
    <div style={{ paddingTop:'1rem' }}>
      {[1,2].map(i => <div key={i} className="skeleton" style={{ height:80, marginBottom:10, borderRadius:12 }} />)}
    </div>
  )

  return (
    <div style={{ paddingTop:'0.5rem' }}>

      {/* Header acción */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'0.75rem' }}>
        <button className="btn btn-primary btn-sm" onClick={abrirNuevaTarjeta}>+ Nueva tarjeta</button>
      </div>

      {tarjetas.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--text2)' }}>
          <p style={{ marginBottom:12 }}>No tienes tarjetas de crédito registradas</p>
          <button className="btn btn-primary" onClick={abrirNuevaTarjeta}>Agregar primera tarjeta</button>
        </div>
      )}

      {/* Lista de tarjetas */}
      {tarjetas.map(tc => {
        const deudasTC  = deudaDeTC(tc.id)
        const saldo     = saldoTC(tc.id)
        const cuotaMes  = cuotaMesTC(tc.id)
        const abierta   = expandida === tc.id

        return (
          <div key={tc.id} className="card" style={{ padding:0, overflow:'hidden', marginBottom:'0.75rem' }}>

            {/* Cabecera tarjeta */}
            <div
              onClick={() => setExpandida(abierta ? null : tc.id)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'0.9rem 1rem', cursor:'pointer', userSelect:'none' }}>
              {/* Ícono tarjeta */}
              <div style={{ width:42, height:28, borderRadius:5, background:'var(--bg4)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:'0.95rem' }}>{tc.nombre}{tc.ultimos_digitos ? <span style={{ fontFamily:'var(--mono)', fontWeight:400, color:'var(--text2)', fontSize:'0.8rem' }}> ···· {tc.ultimos_digitos}</span> : ''}</p>
                <p style={{ fontSize:'0.75rem', color:'var(--text2)' }}>Corte: día {tc.fecha_corte} · {deudasTC.length} deuda{deudasTC.length!==1?'s':''}</p>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <p style={{ fontFamily:'var(--mono)', fontSize:'0.9rem', fontWeight:700, color:'var(--red)' }}>{COP(saldo)}</p>
                <p style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Cuota/mes: {COP(cuotaMes)}</p>
              </div>
              <span style={{ color:'var(--text3)', fontSize:'0.75rem', marginLeft:4 }}>{abierta ? '▲' : '▼'}</span>
            </div>

            {/* Detalle expandido */}
            {abierta && (
              <div style={{ borderTop:'1px solid var(--border)' }}>

                {/* Acciones de la tarjeta */}
                <div style={{ display:'flex', gap:8, padding:'0.6rem 1rem', background:'var(--bg3)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarTarjeta(tc)} style={{ fontSize:'0.78rem' }}>Editar tarjeta</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => abrirExtracto(tc)} style={{ fontSize:'0.78rem' }}>
                    ↑ Cargar extracto
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => abrirNuevaDeuda(tc)} style={{ fontSize:'0.78rem' }}>+ Deuda manual</button>
                  <button onClick={() => setConfirmDel({ tipo:'tarjeta', id:tc.id, nombre:tc.nombre })}
                    style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--red)', fontSize:'0.78rem', fontFamily:'var(--font)' }}>
                    Eliminar
                  </button>
                </div>

                {/* Lista de deudas */}
                {deudasTC.length === 0 ? (
                  <div style={{ padding:'1.5rem', textAlign:'center', color:'var(--text2)', fontSize:'0.85rem' }}>
                    Sin deudas. Agrega una manualmente o carga un extracto.
                  </div>
                ) : (
                  deudasTC.map((d, i) => {
                    const pct     = pctUsado(d.cuotas_pagadas || 0, d.cuotas_totales || 1)
                    const curQ    = cuotaActual(d)
                    const restantes = (d.cuotas_totales || 1) - (d.cuotas_pagadas || 0)
                    return (
                      <div key={d.id} style={{ padding:'0.75rem 1rem', borderTop: i===0?'1px solid var(--border)':'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'flex-start', gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:'0.88rem', fontWeight:500, marginBottom:3 }}>{d.descripcion}</p>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                            <span style={{ fontSize:'0.7rem', color:'var(--text3)' }}>{d.fecha_compra || '—'}</span>
                            {d.tasa_ea && <span style={{ fontSize:'0.7rem', color:'var(--text3)' }}>TEA {d.tasa_ea}%</span>}
                            <span style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Cuota {curQ} de {d.cuotas_totales} · {restantes} restante{restantes!==1?'s':''}</span>
                          </div>
                          {/* Barra de progreso */}
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, height:4, background:'var(--bg4)', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ width:`${pct}%`, height:'100%', background: barColor(pct), borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:'0.68rem', color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0 }}>{pct}%</span>
                          </div>
                          {d.observaciones && <p style={{ fontSize:'0.72rem', color:'var(--text3)', marginTop:4 }}>{d.observaciones}</p>}
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ fontFamily:'var(--mono)', fontSize:'0.88rem', fontWeight:700, color:'var(--text)', marginBottom:2 }}>{COP(d.saldo_pendiente)}</p>
                          <p style={{ fontSize:'0.7rem', color:'var(--text2)', marginBottom:6 }}>{COP(d.cuota_mes)}/mes</p>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarDeuda(d, tc)} style={{ padding:'2px 8px', fontSize:'0.72rem' }}>Editar</button>
                            <button onClick={() => setConfirmDel({ tipo:'deuda', id:d.id, nombre:d.descripcion })}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'1rem', lineHeight:1, padding:'2px 4px' }}>×</button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* MODAL TARJETA */}
      {modalTarjeta && (
        <TarjetaModal
          editData={editTarjeta}
          onClose={() => setModalTarjeta(false)}
          onSaved={() => { setModalTarjeta(false); load() }}
        />
      )}

      {/* MODAL DEUDA */}
      {modalDeuda && tarjetaActiva && (
        <DeudaModal
          tarjeta={tarjetaActiva}
          editData={editDeuda}
          onClose={() => setModalDeuda(false)}
          onSaved={() => { setModalDeuda(false); load() }}
        />
      )}

      {/* MODAL EXTRACTO */}
      {modalExtracto && tarjetaExtracto && (
        <ExtractoUploader
          tarjeta={tarjetaExtracto}
          onClose={() => setModalExtracto(false)}
          onSaved={() => { setModalExtracto(false); load() }}
        />
      )}

      {/* CONFIRM ELIMINAR */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:340 }}>
            <div className="modal-handle" />
            <h2 style={{ fontSize:'1rem', marginBottom:8 }}>¿Eliminar?</h2>
            <p style={{ fontSize:'0.85rem', color:'var(--text2)', marginBottom:'1.25rem' }}>
              {confirmDel.tipo === 'tarjeta'
                ? `Se eliminará la tarjeta "${confirmDel.nombre}" y todas sus deudas. Esta acción no se puede deshacer.`
                : `Se eliminará la deuda "${confirmDel.nombre}".`}
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn w-full" style={{ justifyContent:'center', background:'var(--red)', color:'#fff', border:'none' }}
                onClick={() => confirmDel.tipo === 'tarjeta' ? eliminarTarjeta(confirmDel.id) : eliminarDeuda(confirmDel.id)}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
