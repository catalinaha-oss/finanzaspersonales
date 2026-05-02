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
    const { sms_texto } = await req.json()
    if (!sms_texto) {
      return new Response(JSON.stringify({ error: 'sms_texto requerido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const prompt = `Eres un extractor de datos financieros de mensajes de texto de bancos y apps de pago colombianas (Bancolombia, Nequi, Daviplata, etc).

Analiza este mensaje y extrae la información. Devuelve SOLO JSON válido, sin texto adicional, sin markdown:
{
  "tipo_movimiento": "ingreso" o "gasto",
  "valor": número en COP (siempre positivo, sin puntos ni comas),
  "fecha": "YYYY-MM-DD o null si no aparece",
  "comercio": "nombre del comercio, banco o persona que envió/recibió, tal como aparece",
  "observaciones": "resumen corto y claro en español, máximo 60 caracteres",
  "medio_pago": "débito",
  "categoria_sugerida": "una de estas opciones exactas según el comercio: Alimentación, Transporte, Salud, Entretenimiento, Servicios públicos, Educación, Ropa y calzado, Hogar, Tecnología, Deudas y créditos, Nómina, Otros ingresos, Transferencias, Otro"
}

Reglas para tipo_movimiento:
- "ingreso": Recibiste, pago de nómina, pago de proveedor, abono, consignación
- "gasto": Pagaste, Retiraste, compra, débito

Reglas para categoria_sugerida:
- UBER, DiDi, taxi, bus → Transporte
- restaurante, comida, supermercado, food → Alimentación
- farmacia, médico, clínica, EPS → Salud
- Netflix, Spotify, cine, juegos, Anthropic → Entretenimiento
- luz, agua, gas, internet, teléfono → Servicios públicos
- universidad, colegio, curso → Educación
- banco, tarjeta, cuota → Deudas y créditos
- nómina, salario, sueldo → Nómina
- Retiro cajero, efectivo → Otro
- Si no se puede clasificar → Otro

Reglas para observaciones (máximo 60 caracteres, en español):
- Pago Nequi UBER RIDES → "Uber Rides"
- Retiraste $300.000 en HALLMOTA3 → "Retiro cajero HALLMOTA3"
- Recibiste pago Nomina UNIVERSIDAD EAF → "Nómina EAFIT"
- Pagaste a BANCO FALABELLA → "Pago tarjeta Falabella"

Mensaje a analizar:
${sms_texto}`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
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