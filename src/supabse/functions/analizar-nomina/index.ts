import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
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

    const prompt = `Eres un extractor de datos de comprobantes de nómina colombianos. Analiza este comprobante y extrae TODOS los conceptos, tanto devengos (ingresos) como descuentos.

Devuelve SOLO JSON válido, sin texto adicional, sin markdown:
{
  "periodo": "texto tal como aparece, ej: SEGUNDA QUINCENA DE ABRIL DE 2026",
  "fecha_pago": "YYYY-MM-DD o null",
  "empleador": "nombre de la empresa",
  "empleado": "nombre completo",
  "cargo": "cargo o null",
  "neto_pagar": número en COP,
  "total_devengado": número en COP,
  "total_descuentos": número en COP,
  "conceptos": [
    {
      "codigo": "código numérico del concepto tal como aparece, ej: 3010, o null si no hay",
      "nombre": "nombre del concepto tal como aparece en el PDF",
      "valor": número en COP (siempre positivo),
      "tipo_nomina": "devengo" o "descuento"
    }
  ]
}

Reglas:
- tipo_nomina = "devengo" si el concepto suma al salario bruto (sueldo, cátedra, auxilios, primas, vacaciones, asesorías, bonificaciones)
- tipo_nomina = "descuento" si el concepto resta del salario (aportes salud, pensión, retención fuente, préstamos, seguros, aportes voluntarios)
- Incluye TODOS los conceptos que aparezcan, sin omitir ninguno
- Los valores siempre positivos, el tipo_nomina indica si suma o resta
- El neto_pagar debe coincidir con el valor "NETO A PAGAR" del documento
- Extrae el código numérico si aparece antes del nombre (ej: "3010 APORTE SALUD" → codigo="3010")
- Si no hay código, codigo=null`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 3000,
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
