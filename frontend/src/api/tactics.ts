import { coachesTeam } from '../auth/access'
import { roleCan, type DemoUser } from '../auth/roles'
import { delay, teamById, toSummary } from './athletes'
import { athletes } from './mock/data'
import { changeDemoData, demoData, newId } from './mock/store'
import { DRAWING_COLORS, makeTacticalBoard, TACTIC_KINDS, type CourtPoint, type TacticalBoard, type TacticDraft, type TacticalPlay } from './tacticsTypes'

export class TacticsError extends Error {}
function requireCoach(viewer: DemoUser | null, teamId: string) {
  if (!viewer || !roleCan(viewer.role, 'tactics.use') || !coachesTeam(viewer, teamId)) throw new TacticsError('Só o técnico da equipe pode acessar suas jogadas.')
}
const draftKey = (viewer: DemoUser, teamId: string) => `${viewer.id}:${teamId}`
const validPoint = (p: CourtPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100

function validateBoard(board: TacticalBoard, teamId: string) {
  if (!board || !['half', 'full'].includes(board.court) || typeof board.showDefenders !== 'boolean') throw new TacticsError('Configuração da quadra inválida.')
  if (!Array.isArray(board.players) || board.players.length > 5 || !Array.isArray(board.defenders) || board.defenders.length > 5 || !Array.isArray(board.drawings) || board.drawings.length > 200) throw new TacticsError('Use até cinco atletas, cinco defensores e 200 traços.')
  const ownIds = new Set(athletes.filter((a) => a.teamId === teamId).map((a) => a.id))
  if (board.players.some((p) => !ownIds.has(p.athleteId) || !validPoint(p) || typeof p.id !== 'string' || !p.id) || new Set(board.players.map((p) => p.athleteId)).size !== board.players.length || new Set(board.players.map((p) => p.id)).size !== board.players.length) throw new TacticsError('Escolha atletas diferentes da própria equipe, dentro da quadra.')
  if (board.defenders.some((p) => !validPoint(p) || typeof p.id !== 'string' || !p.id) || new Set(board.defenders.map((p) => p.id)).size !== board.defenders.length) throw new TacticsError('Posições de defesa inválidas.')
  if (board.ball !== null && !validPoint(board.ball)) throw new TacticsError('A bola precisa estar dentro da quadra.')
  if (new Set(board.drawings.map((s) => s.id)).size !== board.drawings.length || board.drawings.some((s) => typeof s.id !== 'string' || !s.id || !['move', 'pass', 'dribble', 'screen', 'freehand'].includes(s.kind) || !Object.hasOwn(DRAWING_COLORS, s.color) || !Array.isArray(s.points) || s.points.length < 2 || s.points.length > 400 || s.points.some((p) => !validPoint(p)))) throw new TacticsError('Desenho inválido. Use traços com até 400 pontos dentro da quadra.')
}

function validateDraft(draft: TacticDraft, teamId: string, saving = false) {
  if (!draft || typeof draft.name !== 'string' || draft.name.length > 80 || (saving && draft.name.trim().length < 3)) throw new TacticsError('Dê um nome de 3 a 80 caracteres à jogada.')
  if (!Object.hasOwn(TACTIC_KINDS, draft.kind) || typeof draft.notes !== 'string' || draft.notes.length > 1200) throw new TacticsError('Escolha o tipo da jogada e use até 1.200 caracteres nas orientações.')
  validateBoard(draft.board, teamId)
}

export async function getTacticsWorkspace(viewer: DemoUser | null, teamId: string) {
  await delay()
  requireCoach(viewer, teamId)
  const roster = athletes.filter((a) => a.teamId === teamId).map(toSummary)
  const initial: TacticDraft = { playId: null, baseRevision: null, name: 'Nova jogada', kind: 'ataque', notes: '', board: makeTacticalBoard(roster) }
  return {
    team: teamById(teamId), roster,
    plays: structuredClone(demoData().tacticalPlays.filter((p) => p.teamId === teamId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))),
    draft: structuredClone(demoData().tacticsDrafts[draftKey(viewer!, teamId)] ?? initial), initial,
  }
}
export type TacticsWorkspace = Awaited<ReturnType<typeof getTacticsWorkspace>>

/** Rascunho privado por técnico e equipe, preservado também ao sair da página. */
export function saveTacticsDraft(viewer: DemoUser | null, teamId: string, draft: TacticDraft) {
  requireCoach(viewer, teamId)
  validateDraft(draft, teamId)
  changeDemoData((d) => { d.tacticsDrafts[draftKey(viewer!, teamId)] = structuredClone(draft) })
}

export async function saveTacticalPlay(viewer: DemoUser | null, teamId: string, draft: TacticDraft): Promise<TacticalPlay> {
  await delay()
  requireCoach(viewer, teamId)
  validateDraft(draft, teamId, true)
  const existing = draft.playId ? demoData().tacticalPlays.find((p) => p.id === draft.playId && p.teamId === teamId) : null
  if (draft.playId && !existing) throw new TacticsError('Essa jogada foi excluída. Salve como uma nova jogada.')
  if (existing && existing.revision !== draft.baseRevision) throw new TacticsError('A jogada foi atualizada em outra tela. Reabra a versão do caderno ou salve uma cópia.')
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (demoData().tacticalPlays.some((p) => p.teamId === teamId && p.id !== draft.playId && p.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new TacticsError('Já existe uma jogada com esse nome. Escolha outro nome.')
  const play: TacticalPlay = { id: existing?.id ?? newId('jogada'), teamId, revision: (existing?.revision ?? 0) + 1, name, kind: draft.kind, notes: draft.notes.trim(), board: structuredClone(draft.board), updatedAt: new Date().toISOString() }
  changeDemoData((d) => {
    const index = d.tacticalPlays.findIndex((p) => p.id === play.id)
    if (index >= 0) d.tacticalPlays[index] = play
    else d.tacticalPlays.push(play)
    d.tacticsDrafts[draftKey(viewer!, teamId)] = { ...draft, playId: play.id, baseRevision: play.revision, name: play.name, notes: play.notes, board: structuredClone(play.board) }
  })
  return structuredClone(play)
}

export async function deleteTacticalPlay(viewer: DemoUser | null, teamId: string, id: string, revision: number) {
  await delay()
  requireCoach(viewer, teamId)
  const play = demoData().tacticalPlays.find((p) => p.id === id && p.teamId === teamId)
  if (!play) throw new TacticsError('Jogada não encontrada.')
  if (play.revision !== revision) throw new TacticsError('A jogada foi atualizada em outra tela. Atualize o caderno.')
  changeDemoData((d) => {
    d.tacticalPlays = d.tacticalPlays.filter((p) => p.id !== id)
    for (const [key, draft] of Object.entries(d.tacticsDrafts)) if (draft.playId === id) d.tacticsDrafts[key] = { ...draft, playId: null, baseRevision: null }
  })
}
