import type { AthleteStatus } from './api/types'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2009-03-14" → "14 mar 2009" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "2025-10-12" → "12 out" */
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** "2024-03" → "Março de 2024" */
export function formatMonthYear(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const month = MONTHS_LONG[m - 1]
  return `${month[0].toUpperCase()}${month.slice(1)} de ${y}`
}

/** 168 → "1,68 m" */
export function formatHeight(cm: number): string {
  return `${(cm / 100).toFixed(2).replace('.', ',')} m`
}

/** 18.25 → "18,3" */
export function formatAverage(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

export const STATUS_LABEL: Record<AthleteStatus, string> = {
  ativo: 'EM ATIVIDADE',
  lesionado: 'LESÃO',
  afastado: 'AFASTAMENTO',
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
