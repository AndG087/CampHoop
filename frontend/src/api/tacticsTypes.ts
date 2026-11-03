export type CourtPoint = { x: number; y: number }
export type TacticPlayer = CourtPoint & { id: string; athleteId: string }
export type TacticDefender = CourtPoint & { id: string }
export type DrawingKind = 'move' | 'pass' | 'dribble' | 'screen' | 'freehand'
export type DrawingColor = 'ink' | 'orange' | 'red'
export type TacticDrawing = { id: string; kind: DrawingKind; color: DrawingColor; points: CourtPoint[] }
export type TacticKind = 'ataque' | 'defesa' | 'transicao' | 'reposicao'
export type TacticalBoard = {
  court: 'half' | 'full'
  players: TacticPlayer[]
  defenders: TacticDefender[]
  showDefenders: boolean
  ball: CourtPoint | null
  drawings: TacticDrawing[]
}
export type TacticContent = { name: string; kind: TacticKind; notes: string; board: TacticalBoard }
export type TacticDraft = TacticContent & { playId: string | null; baseRevision: number | null }
export type TacticalPlay = TacticContent & {
  id: string; teamId: string; revision: number; updatedAt: string
}
export type TacticTemplate = 'horns' | 'five-out' | 'zone'
export const TACTIC_KINDS: Record<TacticKind, string> = { ataque: 'Ataque', defesa: 'Defesa', transicao: 'Transição', reposicao: 'Reposição' }
export const DRAWING_COLORS: Record<DrawingColor, string> = { ink: '#233b50', orange: '#ae591b', red: '#a5443b' }
export const TACTIC_TEMPLATES: { id: TacticTemplate; name: string; kind: TacticKind; description: string }[] = [
  { id: 'horns', name: 'Chifre alto', kind: 'ataque', description: 'Dois apoios no alto do garrafão.' },
  { id: 'five-out', name: '5 abertos', kind: 'ataque', description: 'Cinco posições para criar espaço.' },
  { id: 'zone', name: 'Zona 2–3', kind: 'defesa', description: 'Duas linhas para organizar a defesa.' },
]

/** Coordenadas em porcentagem: independentes da tela e da orientação da quadra. */
export function makeTacticalBoard(roster: { id: string; status: string }[], template: TacticTemplate = 'horns'): TacticalBoard {
  const positions = template === 'zone' ? [[34, 52], [66, 52], [18, 25], [50, 24], [82, 25]] : template === 'five-out' ? [[50, 78], [14, 53], [86, 53], [8, 18], [92, 18]] : [[50, 77], [9, 18], [91, 18], [34, 43], [66, 43]]
  return {
    court: 'half', players: roster.filter((a) => a.status === 'ativo').slice(0, 5).map((a, i) => ({ id: `slot-${i + 1}`, athleteId: a.id, x: positions[i][0], y: positions[i][1] })),
    defenders: [[48, 64], [15, 28], [85, 28], [39, 34], [61, 34]].map(([x, y], i) => ({ id: `defender-${i + 1}`, x, y })),
    showDefenders: false, ball: { x: 56, y: 78 }, drawings: [],
  }
}

export const contentStamp = (content: TacticContent) => JSON.stringify({ name: content.name, kind: content.kind, notes: content.notes, board: content.board })
export const clampPoint = (p: CourtPoint, inset = 0): CourtPoint => ({ x: Math.max(inset, Math.min(100 - inset, p.x)), y: Math.max(inset, Math.min(100 - inset, p.y)) })

export type TacticHistory = { past: TacticDraft[]; present: TacticDraft; future: TacticDraft[] }
export function changeTactic(history: TacticHistory, draft: TacticDraft): TacticHistory {
  if (contentStamp(history.present) === contentStamp(draft) && history.present.playId === draft.playId && history.present.baseRevision === draft.baseRevision) return history
  return { past: [...history.past.slice(-49), structuredClone(history.present)], present: structuredClone(draft), future: [] }
}
export function undoTactic(history: TacticHistory): TacticHistory {
  if (!history.past.length) return history
  return { past: history.past.slice(0, -1), present: { ...history.past[history.past.length - 1], playId: history.present.playId, baseRevision: history.present.baseRevision }, future: [history.present, ...history.future] }
}
export function redoTactic(history: TacticHistory): TacticHistory {
  if (!history.future.length) return history
  return { past: [...history.past.slice(-49), history.present], present: { ...history.future[0], playId: history.present.playId, baseRevision: history.present.baseRevision }, future: history.future.slice(1) }
}
