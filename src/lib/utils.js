// ── Formatters ───────────────────────────────────────────────
export function formatCOP(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(value)
}

export function formatCompact(value) {
  if (value == null) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(value / 1_000).toFixed(0)}K`
  return formatCOP(value)
}

export function formatPct(value) {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

// ── Date helpers ─────────────────────────────────────────────
export function today() {
  return new Date().toISOString().split('T')[0]
}

export function currentYearMonth() {
  const d = new Date()
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

export function monthLabel(anio, mes) {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${MESES[mes - 1]} ${anio}`
}

export function dateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

// ── Alert calculator ─────────────────────────────────────────
const MESES_STR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function calcularMesesAlerta(periodicidad, mesCiclo) {
  if (!mesCiclo) return 'Todos los meses'
  const ciclos = { Bimensual: 2, Trimestral: 3, Semestral: 6, Anual: 12 }
  const n = ciclos[periodicidad]
  if (!n) return ''
  const result = []
  for (let m = 1; m <= 12; m++) {
    if (((m - 1) % n) + 1 === mesCiclo) result.push(MESES_STR[m - 1])
  }
  return result.join(', ')
}

export function getUpcomingAlerts(conceptos, daysAhead = 7) {
  const now  = new Date()
  const year = now.getFullYear()
  const month= now.getMonth() + 1
  const day  = now.getDate()
  const alerts = []

  for (const c of conceptos) {
    if (c.fijo_variable !== 'F') continue

    if (c.periodicidad === 'Mensual' && c.dia_pago) {
      const diff = c.dia_pago - day
      if (diff >= 0 && diff <= daysAhead) {
        alerts.push({ concepto: c, dias: diff, fecha: `Día ${c.dia_pago} de este mes` })
      }
    } else if (c.mes_ciclo && c.dia_vencimiento) {
      const ciclos = { Bimensual: 2, Trimestral: 3, Semestral: 6, Anual: 12 }
      const n = ciclos[c.periodicidad]
      if (n && ((month - 1) % n) + 1 === c.mes_ciclo) {
        const diff = c.dia_vencimiento - day
        if (diff >= 0 && diff <= daysAhead) {
          alerts.push({ concepto: c, dias: diff, fecha: `Día ${c.dia_vencimiento} de este mes` })
        }
      }
    }
  }
  return alerts.sort((a, b) => a.dias - b.dias)
}

// ── Category colors ──────────────────────────────────────────
export const CAT_COLORS = {
  'Ingreso Personal':    '#4f8ef7',
  'Cuota Alimentaria':   '#a78bfa',
  'Hogar':               '#2dd4a0',
  'Mascota':             '#f7b44f',
  'Comida':              '#f7855f',
  'Transporte':          '#60c8f7',
  'Nicolás':             '#f76fa0',
  'Créditos/Deudas':     '#f75f5f',
  'Entretenimiento':     '#c084fc',
  'Personal':            '#4ade80',
  'Ahorro/Inversión':    '#fbbf24',
}

export function getCatColor(nombre) {
  return CAT_COLORS[nombre] || '#8b93a8'
}
