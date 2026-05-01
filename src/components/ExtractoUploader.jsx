import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const COP = v => v == null ? '—' : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v)

// Convierte File a base64 string (solo la parte de datos)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ExtractoUploader({ tarjeta, onClose, onSaved }) {
  const { user } = useAuth()

  // ── todos los hooks al inicio ──
  const [archivo,    setArchivo]    = useState(null)
  const [estado,     setEstado]     = useState('idle') // idle | analizando | revision | guardando | listo | error
  const [deudas,     setDeudas]     = useState([])     // deudas parseadas por IA
  const [errMsg,     setErrMsg]     = useState('')
  const [resultado,  setResultado]  = useState(null)   // { creadas, actualizadas }

  async function analizar() {
    if (!archivo) return
    setEstado('analizando')
    setErrMsg('')

    try {
      const base64 = await fileToBase64(archivo)

      const prompt = `Eres un extractor de datos financieros. Analiza este extracto de tarjeta de crédito y extrae TODAS las deudas/compras que aparecen en la sección de movimientos o cuotas.

Para cada deuda extrae exactamente estos campos (devuelve SOLO JSON válido, sin texto adicional, sin markdown):
{
  "deudas": [
    {
      "descripcion": "nombre del comercio o compra tal como aparece",
      "fecha_compra": "YYYY-MM-DD o null si no está",
      "valor_total_cop": número en COP (convierte si está en USD usando la tasa de cambio del extracto), 
      "cuotas_totales": número entero,
      "cuotas_pagadas": número de cuotas ya pagadas (cuota actual - 1),
      "cuota_mes": valor de la cuota mensual en COP,
      "saldo_pendiente": valor pendiente en COP,
      "tasa_ea": tasa efectiva anual como número decimal (ej: 25.50),
      "observaciones": "moneda original y tasa de cambio si aplica, o null"
    }
  ]
}

Reglas:
- Si dice "14 de 24", cuotas_totales=24 y cuotas_pagadas=13 (la actual es 14, ya van 13 pagadas)
- Si dice "1 de 1", es compra de contado: cuotas_totales=1, cuotas_pagadas=0
- Si es pago (valor negativo), NO lo incluyas
- Si es cobro de seguro o cuota de manejo sin cuotas, NO lo incluyas
- Convierte fechas a formato YYYY-MM-DD
- Solo incluye filas con valor_del_movimiento positivo y que representen compras/deudas`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 }
              },
              { type: 'text', text: prompt }
            ]
          }]
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Error en la API')

      const texto = data.content?.find(b => b.type === 'text')?.text || ''
      // Limpiar posibles bloques markdown
      const jsonStr = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed  = JSON.parse(jsonStr)

      if (!parsed.deudas || !Array.isArray(parsed.deudas)) throw new Error('Formato inesperado de la IA')

      setDeudas(parsed.deudas)
      setEstado('revision')
    } catch (err) {
      setErrMsg('Error al analizar: ' + err.message)
      setEstado('error')
    }
  }

  async function guardar() {
    setEstado('guardando')
    let creadas = 0, actualizadas = 0

    for (const d of deudas) {
      // Buscar si ya existe: match por descripcion + fecha_compra + tarjeta_id
      const { data: existentes } = await supabase
        .from('deudas_tc')
        .select('id')
        .eq('user_id', user.id)
        .eq('tarjeta_id', tarjeta.id)
        .eq('descripcion', d.descripcion)
        .eq('fecha_compra', d.fecha_compra)

      if (existentes && existentes.length > 0) {
        // ACTUALIZAR: solo saldo_pendiente y cuotas_pagadas
        await supabase.from('deudas_tc')
          .update({
            saldo_pendiente: d.saldo_pendiente,
            cuotas_pagadas:  d.cuotas_pagadas,
            cuota_mes:       d.cuota_mes,
          })
          .eq('id', existentes[0].id)
          .eq('user_id', user.id)
        actualizadas++
      } else {
        // INSERTAR nueva
        await supabase.from('deudas_tc').insert({
          user_id:         user.id,
          tarjeta_id:      tarjeta.id,
          descripcion:     d.descripcion,
          fecha_compra:    d.fecha_compra || null,
          valor_total_cop: d.valor_total_cop || null,
          cuotas_totales:  d.cuotas_totales || 1,
          cuotas_pagadas:  d.cuotas_pagadas || 0,
          cuota_mes:       d.cuota_mes || null,
          saldo_pendiente: d.saldo_pendiente || null,
          tasa_ea:         d.tasa_ea || null,
          observaciones:   d.observaciones || null,
        })
        creadas++
      }
    }

    setResultado({ creadas, actualizadas })
    setEstado('listo')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:520 }}>
        <div className="modal-handle" />
        <h2 style={{ fontSize:'1rem' }}>Cargar extracto · {tarjeta.nombre}</h2>

        {/* ── ESTADO: idle ── */}
        {estado === 'idle' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <p style={{ fontSize:'0.82rem', color:'var(--text2)' }}>
              Sube el extracto PDF. La IA extraerá automáticamente todas las deudas y actualizará las existentes.
            </p>
            <div
              style={{ border:'2px dashed var(--border2)', borderRadius:12, padding:'2rem', textAlign:'center', cursor:'pointer', background: archivo ? 'rgba(79,142,247,0.06)' : 'transparent' }}
              onClick={() => document.getElementById('file-input-extracto').click()}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:8 }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p style={{ fontSize:'0.85rem', color: archivo ? 'var(--accent)' : 'var(--text2)', fontWeight: archivo ? 600 : 400 }}>
                {archivo ? archivo.name : 'Toca para seleccionar el PDF del extracto'}
              </p>
              {archivo && <p style={{ fontSize:'0.72rem', color:'var(--text3)', marginTop:4 }}>{(archivo.size/1024).toFixed(0)} KB</p>}
            </div>
            <input id="file-input-extracto" type="file" accept="application/pdf"
              style={{ display:'none' }}
              onChange={e => { if (e.target.files[0]) setArchivo(e.target.files[0]) }} />
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-primary w-full" style={{ justifyContent:'center' }}
                disabled={!archivo} onClick={analizar}>
                Analizar con IA
              </button>
            </div>
          </div>
        )}

        {/* ── ESTADO: analizando ── */}
        {estado === 'analizando' && (
          <div style={{ textAlign:'center', padding:'2rem 0' }}>
            <div style={{ width:36, height:36, border:'3px solid var(--bg4)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
            <p style={{ color:'var(--text2)', fontSize:'0.85rem' }}>Analizando extracto con IA...</p>
            <p style={{ color:'var(--text3)', fontSize:'0.75rem', marginTop:4 }}>Esto puede tardar unos segundos</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── ESTADO: revision ── */}
        {estado === 'revision' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <p style={{ fontSize:'0.82rem', color:'var(--text2)' }}>
              Se encontraron <strong>{deudas.length}</strong> deuda{deudas.length!==1?'s':''}.
              Revisa antes de guardar:
            </p>
            <div style={{ maxHeight:320, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
              {deudas.map((d, i) => (
                <div key={i} style={{ background:'var(--bg3)', borderRadius:8, padding:'0.65rem 0.85rem' }}>
                  <p style={{ fontSize:'0.82rem', fontWeight:500, marginBottom:3 }}>{d.descripcion}</p>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', fontSize:'0.72rem', color:'var(--text2)' }}>
                    <span>{d.fecha_compra || 'Sin fecha'}</span>
                    <span>Cuota {(d.cuotas_pagadas||0)+1}/{d.cuotas_totales||1}</span>
                    <span style={{ color:'var(--accent)' }}>{COP(d.cuota_mes)}/mes</span>
                    <span style={{ color:'var(--red)', fontWeight:600 }}>Saldo: {COP(d.saldo_pendiente)}</span>
                    {d.tasa_ea && <span>TEA {d.tasa_ea}%</span>}
                  </div>
                  {d.observaciones && <p style={{ fontSize:'0.68rem', color:'var(--text3)', marginTop:3 }}>{d.observaciones}</p>}
                </div>
              ))}
            </div>
            <p style={{ fontSize:'0.72rem', color:'var(--text3)' }}>
              Las deudas existentes (mismo comercio + fecha) solo actualizarán saldo y cuotas pagadas.
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={() => setEstado('idle')}>← Volver</button>
              <button type="button" className="btn btn-primary w-full" style={{ justifyContent:'center' }} onClick={guardar}>
                Guardar {deudas.length} deuda{deudas.length!==1?'s':''}
              </button>
            </div>
          </div>
        )}

        {/* ── ESTADO: guardando ── */}
        {estado === 'guardando' && (
          <div style={{ textAlign:'center', padding:'2rem 0' }}>
            <div style={{ width:36, height:36, border:'3px solid var(--bg4)', borderTopColor:'var(--green)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
            <p style={{ color:'var(--text2)', fontSize:'0.85rem' }}>Guardando en Supabase...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── ESTADO: listo ── */}
        {estado === 'listo' && resultado && (
          <div style={{ textAlign:'center', padding:'1.5rem 0' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(45,212,160,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <p style={{ fontWeight:600, fontSize:'0.95rem', marginBottom:8 }}>¡Listo!</p>
            <p style={{ color:'var(--text2)', fontSize:'0.85rem', marginBottom:4 }}>
              {resultado.creadas} deuda{resultado.creadas!==1?'s':''} nueva{resultado.creadas!==1?'s':''}
            </p>
            <p style={{ color:'var(--text2)', fontSize:'0.85rem', marginBottom:'1.5rem' }}>
              {resultado.actualizadas} deuda{resultado.actualizadas!==1?'s':''} actualizada{resultado.actualizadas!==1?'s':''}
            </p>
            <button className="btn btn-primary" style={{ justifyContent:'center' }} onClick={onSaved}>
              Cerrar
            </button>
          </div>
        )}

        {/* ── ESTADO: error ── */}
        {estado === 'error' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div style={{ background:'rgba(247,95,95,0.12)', border:'1px solid rgba(247,95,95,0.3)', borderRadius:8, padding:'0.75rem 1rem', color:'var(--red)', fontSize:'0.85rem' }}>
              {errMsg}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost w-full" style={{ justifyContent:'center' }} onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary w-full" style={{ justifyContent:'center' }} onClick={() => setEstado('idle')}>Reintentar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
