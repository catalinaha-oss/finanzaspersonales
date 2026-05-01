import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Leer body: { pdf_base64: string }
    const { pdf_base64 } = await req.json()
    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: 'pdf_base64 requerido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

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
- Solo incluye filas con valor_del_movimiento positivo que representen compras/deudas`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      return new Response(JSON.stringify({ error: `Anthropic error: ${errBody}` }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const data    = await anthropicRes.json()
    const texto   = data.content?.find((b: any) => b.type === 'text')?.text || ''
    const jsonStr = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed  = JSON.parse(jsonStr)

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
