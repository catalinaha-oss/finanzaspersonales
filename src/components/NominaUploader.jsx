import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const EDGE_URL = 'https://puvqxgsodwyhfdfnatpv.supabase.co/functions/v1/analizar-nomina'

const COP = v => v == null ? '—' : new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(v)

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function NominaUploader({ onClose, onSaved }) {
  const { user } = useAuth()

  // ── todos los hooks al inicio ──
  const [archivo,       setArchivo]       = useState(null)
  const [estado,        setEstado]        = useState('idle')       // idle | analizando | mapeo | guardando | listo | error
  const [errMsg,        setErrMsg]        = useState('')
  const [nominaData,    setNominaData]    = useState(null)         // resultado bruto de la Edge Function
  const [conceptos,     setConceptos]     = useState([])           // conceptos del usuario en Supabase
  const [categorias,    setCategorias]    = useState([])           // categorias del usuario
  const [mapaGuardado,  setMapaGuardado]  = useState({})           // { "codigo|nombre": concepto_id }
  const [items,         setItems]         = useState([])           // items enriquecidos con concepto_id asignado
  const [pendientes,    setPendientes]    = useState([])           // índices de items sin concepto_id aún
  const [indicePend,    setIndicePend]    = useState(0)            // cuál pendiente estamos resolviendo
  const [resultado,     setResultado]     = useState(null)
  const [fechaTx,       setFechaTx]       = useState(new Date().toISOString().split('T')[0])

  // Cargar conceptos, categorias y mapa guardado al montar
  useEffect(() => {
    async function loadCatalogo() {
      const [{ data: cats }, { data: cons }, { data: mapa }] = await Promise.all([
        supabase.from('categorias').select('id, nombre, tipo').order('nombre'),
        supabase.from('conceptos')
          .select('id, nombre, categoria_id')
          .eq('user_id', user.id)
          .eq('activo', true)
          .order('nombre'),
        supabase.from('nomina_conceptos_mapa')
          .select('clave_concepto, concepto_id')
          .eq('user_id', user.id),
      ])
      setCategorias(cats || [])
      setConceptos(cons || [])
      // Construir mapa { clave: concepto_id }
      const m = {}
      for (const row of (mapa || [])) m[row.clave_concepto] = row.concepto_id
      setMapaGuardado(m)
    }
    loadCatalogo()
  }, [user.id])

  // Clave única para buscar en el mapa: codigo si existe, sino nombre normalizado
  function claveConcepto(c) {
    if (c.codigo) return `cod:${c.codigo}`
    return `nom:${c.nombre.trim().toUpperCase()}`
  }

  async function analizar() {
    if (!archivo) return
    setEstado('analizando')
    setErrMsg('')

    try {
      const base64 = await fileToBase64(archivo)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')

      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        session.access_token,
        },
        body: JSON.stringify({ pdf_base64: base64 })
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Error del servidor (${res.status}): ${errBody}`)
      }

      const parsed = await res.json()
      if (parsed.error) throw new Error(parsed.error)
      if (!parsed.conceptos || !Array.isArray(parsed.conceptos)) throw new Error('Formato inesperado de la IA')

      setNominaData(parsed)

      // Enriquecer cada concepto con concepto_id del mapa o null
      const itemsEnriquecidos = parsed.conceptos.map(c => ({
        ...c,
        clave:       claveConcepto(c),
        concepto_id: mapaGuardado[claveConcepto(c)] || null,
      }))
      setItems(itemsEnriquecidos)

      // Detectar pendientes (sin concepto_id asignado)
      const idxPend = itemsEnriquecidos
        .map((it, i) => (it.concepto_id ? null : i))
        .filter(i => i !== null)
      setPendientes(idxPend)
      setIndicePend(0)

      if (idxPend.length === 0) {
        setEstado('revision')
      } else {
        setEstado('mapeo')
      }

    } catch (err) {
      setErrMsg('Error al analizar: ' + err.message)
      setEstado('error')
    }
  }

  // El usuario asignó un concepto_id al pendiente actual
  function asignarConcepto(concepto_id) {
    const idx = pendientes[indicePend]
    const nuevosItems = items.map((it, i) =>
      i === idx ? { ...it, concepto_id } : it
    )
    setItems(nuevosItems)

    if (indicePend + 1 < pendientes.length) {
      setIndicePend(i => i + 1)
    } else {
      setEstado('revision')
    }
  }

  // Omitir este concepto (no se registrará)
  function omitirConcepto() {
    const idx = pendientes[indicePend]
    const nuevosItems = items.map((it, i) =>
      i === idx ? { ...it, concepto_id: '__omitir__' } : it
    )
    setItems(nuevosItems)

    if (indicePend + 1 < pendientes.length) {
      setIndicePend(i => i + 1)
    } else {
      setEstado('revision')
    }
  }

  async function guardar() {
    setEstado('guardando')
    let insertados = 0
    const mapaActualizar = [] // { clave, concepto_id }

    for (const it of items) {
      if (!it.concepto_id || it.concepto_id === '__omitir__') continue

      // Insertar transacción
      const conceptoObj = conceptos.find(c => c.id === it.concepto_id)
      if (!conceptoObj) continue

      // Determinar tipo_movimiento según el concepto en Supabase
      // Se infiere de la categoría del concepto
      const catObj = categorias.find(c => c.id === conceptoObj.categoria_id)
      let tipo_movimiento = 'gasto'
      if (catObj?.tipo === 'Ingreso') tipo_movimiento = 'ingreso'
      else if (catObj?.tipo === 'Ahorro/Inversión') tipo_movimiento = 'ahorro'

      await supabase.from('transacciones').insert({
        user_id:         user.id,
        fecha:           fechaTx,
        valor:           it.valor,
        tipo_movimiento,
        concepto_id:     it.concepto_id,
        medio_pago:      'nómina',
        observaciones:   `${nominaData.periodo} · ${nominaData.empleador}`,
        origen:          'nomina',
      })
      insertados++

      // Si el mapa no tenía esta clave, guardarla
      if (!mapaGuardado[it.clave]) {
        mapaActualizar.push({ clave: it.clave, concepto_id: it.concepto_id, nombre: it.nombre })
      }
    }

    // Guardar nuevas claves en nomina_conceptos_mapa
    for (const m of mapaActualizar) {
      await supabase.from('nomina_conceptos_mapa').upsert({
        user_id:         user.id,
        clave_concepto:  m.clave,
        nombre_concepto: m.nombre,
        concepto_id:     m.concepto_id,
      }, { onConflict: 'user_id,clave_concepto' })
    }

    setResultado({ insertados, mapaActualizar: mapaActualizar.length })
    setEstado('listo')
  }

  // ── Helpers de UI ──
  const itemConcepto = items[pendientes[indicePend]] || null

  const conceptosFiltrados = (tipoNomina) => {
    // Sugerir conceptos del catálogo según si es devengo o descuento
    return conceptos.filter(c => {
      const cat = categorias.find(cat => cat.id === c.categoria_id)
      if (!cat) return true
      if (tipoNomina === 'devengo') return cat.tipo === 'Ingreso'
      if (tipoNomina === 'descuento') return cat.tipo === 'Gasto' || cat.tipo === 'Ahorro/Inversión'
      return true
    })
  }

  const itemsParaRevision = items.filter(it => it.concepto_id && it.concepto_id !== '__omitir__')
  const itemsOmitidos     = items.filter(it => it.concepto_id === '__omitir__')
  const itemsSinAsignar   = items.filter(it => !it.concepto_id)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-handle" />
        <h2 style={{ fontSize: '1rem' }}>Cargar comprobante de nómina</h2>

        {/* ── ESTADO: idle ── */}
        {estado === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
              Sube el PDF del comprobante. La IA extraerá todos los conceptos y los asociará
              a tus categorías automáticamente.
            </p>
            <div
              style={{
                border: '2px dashed var(--border2)', borderRadius: 12, padding: '2rem',
                textAlign: 'center', cursor: 'pointer',
                background: archivo ? 'rgba(79,142,247,0.06)' : 'transparent'
              }}
              onClick={() => document.getElementById('file-input-nomina').click()}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)"
                strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p style={{ fontSize: '0.85rem', color: archivo ? 'var(--accent)' : 'var(--text2)', fontWeight: archivo ? 600 : 400 }}>
                {archivo ? archivo.name : 'Toca para seleccionar el PDF de nómina'}
              </p>
              {archivo && <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>{(archivo.size / 1024).toFixed(0)} KB</p>}
            </div>
            <input id="file-input-nomina" type="file" accept="application/pdf"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) setArchivo(e.target.files[0]) }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                disabled={!archivo} onClick={analizar}>
                Analizar con IA
              </button>
            </div>
          </div>
        )}

        {/* ── ESTADO: analizando / guardando ── */}
        {(estado === 'analizando' || estado === 'guardando') && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{
              width: 36, height: 36, border: '3px solid var(--bg4)',
              borderTopColor: estado === 'guardando' ? 'var(--green)' : 'var(--accent)',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              {estado === 'analizando' ? 'Analizando comprobante con IA...' : 'Guardando transacciones...'}
            </p>
            {estado === 'analizando' && (
              <p style={{ color: 'var(--text3)', fontSize: '0.75rem', marginTop: 4 }}>Esto puede tardar unos segundos</p>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── ESTADO: mapeo — concepto nuevo encontrado ── */}
        {estado === 'mapeo' && itemConcepto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round((indicePend / pendientes.length) * 100)}%`,
                  height: '100%', background: 'var(--accent)', borderRadius: 3,
                  transition: 'width 0.3s'
                }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', flexShrink: 0 }}>
                {indicePend + 1} de {pendientes.length}
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
              Concepto nuevo encontrado. ¿A qué concepto de tus categorías corresponde?
            </p>

            {/* Card del concepto de nómina */}
            <div style={{
              background: 'var(--bg3)', borderRadius: 10, padding: '0.85rem 1rem',
              borderLeft: `3px solid ${itemConcepto.tipo_nomina === 'devengo' ? 'var(--green)' : 'var(--red)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {itemConcepto.codigo && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      #{itemConcepto.codigo} ·{' '}
                    </span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: itemConcepto.tipo_nomina === 'devengo' ? 'var(--green)' : 'var(--red)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {itemConcepto.tipo_nomina === 'devengo' ? 'Ingreso' : 'Descuento'}
                  </span>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 3 }}>{itemConcepto.nombre}</p>
                </div>
                <p style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.95rem', color: itemConcepto.tipo_nomina === 'devengo' ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginLeft: 12 }}>
                  {COP(itemConcepto.valor)}
                </p>
              </div>
            </div>

            {/* Selector de concepto */}
            <div className="input-group">
              <label>Asignar a concepto de MisFinanzas</label>
              <select className="input"
                onChange={e => { if (e.target.value) asignarConcepto(e.target.value) }}
                defaultValue="">
                <option value="">— Selecciona un concepto —</option>
                {conceptosFiltrados(itemConcepto.tipo_nomina).map(c => {
                  const cat = categorias.find(cat => cat.id === c.categoria_id)
                  return (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{cat ? ` · ${cat.nombre}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
              Esta asignación se guardará para futuras nóminas. No volverás a ver este concepto.
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center', fontSize: '0.82rem' }}
                onClick={omitirConcepto}>
                Omitir este concepto
              </button>
            </div>
          </div>
        )}

        {/* ── ESTADO: revision ── */}
        {estado === 'revision' && nominaData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Resumen de la nómina */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '0.85rem 1rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 3 }}>{nominaData.periodo}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{nominaData.empleador}</p>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Devengado</p>
                  <p style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', color: 'var(--green)' }}>{COP(nominaData.total_devengado)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Descuentos</p>
                  <p style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', color: 'var(--red)' }}>−{COP(nominaData.total_descuentos)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Neto</p>
                  <p style={{ fontFamily: 'var(--mono)', fontSize: '0.88rem', fontWeight: 700 }}>{COP(nominaData.neto_pagar)}</p>
                </div>
              </div>
            </div>

            {/* Fecha de registro */}
            <div className="input-group">
              <label style={{ fontSize: '0.82rem' }}>Fecha de registro de las transacciones</label>
              <input className="input" type="date" value={fechaTx} onChange={e => setFechaTx(e.target.value)} />
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 3 }}>Normalmente el día que el pago cayó a tu cuenta</p>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
              Se registrarán <strong>{itemsParaRevision.length}</strong> transacción{itemsParaRevision.length !== 1 ? 'es' : ''}
              {itemsOmitidos.length > 0 ? ` · ${itemsOmitidos.length} omitida${itemsOmitidos.length !== 1 ? 's' : ''}` : ''}
            </p>

            {/* Lista de transacciones a registrar */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {itemsParaRevision.map((it, i) => {
                const concObj = conceptos.find(c => c.id === it.concepto_id)
                const catObj  = categorias.find(c => c.id === concObj?.categoria_id)
                const esIngreso = catObj?.tipo === 'Ingreso'
                return (
                  <div key={i} style={{
                    background: 'var(--bg3)', borderRadius: 8, padding: '0.55rem 0.85rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 500 }}>{it.nombre}</p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                        {concObj?.nombre}{catObj ? ` · ${catObj.nombre}` : ''}
                      </p>
                    </div>
                    <p style={{
                      fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 700, flexShrink: 0, marginLeft: 10,
                      color: esIngreso ? 'var(--green)' : 'var(--red)'
                    }}>
                      {esIngreso ? '+' : '−'}{COP(it.valor)}
                    </p>
                  </div>
                )
              })}
            </div>

            {itemsOmitidos.length > 0 && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                Omitidos: {itemsOmitidos.map(it => it.nombre).join(', ')}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost w-full" style={{ justifyContent: 'center' }}
                onClick={() => setEstado('idle')}>← Volver</button>
              <button type="button" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                onClick={guardar}>
                Guardar {itemsParaRevision.length} transacción{itemsParaRevision.length !== 1 ? 'es' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── ESTADO: listo ── */}
        {estado === 'listo' && resultado && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(45,212,160,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 8 }}>¡Listo!</p>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 4 }}>
              {resultado.insertados} transacción{resultado.insertados !== 1 ? 'es' : ''} registrada{resultado.insertados !== 1 ? 's' : ''}
            </p>
            {resultado.mapaActualizar > 0 && (
              <p style={{ color: 'var(--text3)', fontSize: '0.78rem', marginBottom: '1.5rem' }}>
                {resultado.mapaActualizar} concepto{resultado.mapaActualizar !== 1 ? 's' : ''} nuevo{resultado.mapaActualizar !== 1 ? 's' : ''} aprendido{resultado.mapaActualizar !== 1 ? 's' : ''}
              </p>
            )}
            <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={onSaved}>Cerrar</button>
          </div>
        )}

        {/* ── ESTADO: error ── */}
        {estado === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(247,95,95,0.12)', border: '1px solid rgba(247,95,95,0.3)',
              borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--red)', fontSize: '0.85rem'
            }}>
              {errMsg}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={() => setEstado('idle')}>Reintentar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
