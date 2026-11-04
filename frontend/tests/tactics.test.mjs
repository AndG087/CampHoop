import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
const api = await server.ssrLoadModule('/src/api/tactics.ts')
const model = await server.ssrLoadModule('/src/api/tacticsTypes.ts')
const store = await server.ssrLoadModule('/src/api/mock/store.ts')
const { DEMO_USERS } = await server.ssrLoadModule('/src/auth/roles.ts')
const { BoardScene } = await server.ssrLoadModule('/src/pages/TacticsCourt.tsx')
const coach = DEMO_USERS.tecnico
const teamId = coach.teamId
const workspace = () => api.getTacticsWorkspace(coach, teamId)
const newDraft = async (name = 'Chifre de teste') => ({ ...(await workspace()).initial, name })
const fromPlay = (p) => ({ playId: p.id, baseRevision: p.revision, name: p.name, kind: p.kind, notes: p.notes, board: p.board })

beforeEach(store.resetDemoData)
after(() => server.close())

test('prancheta e caderno são privados para o técnico da própria equipe', async () => {
  for (const viewer of [null, DEMO_USERS.atleta, DEMO_USERS.basico, DEMO_USERS.estatistico, DEMO_USERS.organizador]) {
    await assert.rejects(() => api.getTacticsWorkspace(viewer, teamId), /Só o técnico/)
    await assert.rejects(() => api.saveTacticalPlay(viewer, teamId, {}), /Só o técnico/)
    assert.throws(() => api.saveTacticsDraft(viewer, teamId, {}), /Só o técnico/)
  }
  await assert.rejects(() => api.getTacticsWorkspace(coach, 'sa-sub17-f'), /Só o técnico/)
})

test('formação inicial usa atletas reais da equipe, sem alterar a escalação ao vivo', async () => {
  const w = await workspace()
  assert.equal(w.team.id, teamId)
  assert.equal(w.plays.length, 0)
  assert.equal(w.draft.board.players.length, 5)
  assert.ok(w.draft.board.players.every((p) => w.roster.some((a) => a.id === p.athleteId && a.team.id === teamId)))
  assert.equal(w.draft.board.players.some((p) => p.athleteId === 'duda-alves'), false)
  assert.equal(w.draft.board.defenders.length, 5)
  assert.equal(w.draft.board.showDefenders, false)
  assert.equal(Object.keys(store.demoData().liveMatches).length, 0)
})

test('salvar e atualizar mantém o identificador, as posições, os desenhos e as orientações', async () => {
  const draft = await newDraft('  Saída   de tempo  ')
  draft.notes = 'A armadora inicia no topo.'
  draft.board.players[0].x = 42
  draft.board.drawings = [{ id: 'pass-1', kind: 'pass', color: 'ink', points: [{ x: 42, y: 77 }, { x: 66, y: 43 }] }]
  const saved = await api.saveTacticalPlay(coach, teamId, draft)
  assert.equal(saved.name, 'Saída de tempo')
  assert.equal(saved.revision, 1)
  const updated = await api.saveTacticalPlay(coach, teamId, { ...fromPlay(saved), notes: 'A ala corta pelo fundo.' })
  assert.equal(updated.id, saved.id)
  assert.equal(updated.revision, 2)
  const w = await workspace()
  assert.equal(w.plays.length, 1)
  assert.equal(w.plays[0].board.players[0].x, 42)
  assert.equal(w.plays[0].board.drawings[0].kind, 'pass')
  assert.equal(w.draft.baseRevision, 2)
  assert.equal(w.draft.notes, 'A ala corta pelo fundo.')
})

test('revisão impede sobrescrever ou excluir uma versão atualizada em outra tela', async () => {
  const first = await api.saveTacticalPlay(coach, teamId, await newDraft())
  const updated = await api.saveTacticalPlay(coach, teamId, { ...fromPlay(first), notes: 'Nova versão' })
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, { ...fromPlay(first), notes: 'Versão antiga' }), /outra tela/)
  await assert.rejects(() => api.deleteTacticalPlay(coach, teamId, first.id, first.revision), /outra tela/)
  assert.equal((await workspace()).plays[0].revision, updated.revision)
  assert.equal((await workspace()).plays[0].notes, 'Nova versão')
})

test('outro técnico não consegue ler, sobrescrever ou apagar a jogada da equipe', async () => {
  const saved = await api.saveTacticalPlay(coach, teamId, await newDraft())
  const other = { ...coach, id: 'outro-tecnico', teamId: 'sa-sub17-f' }
  await assert.rejects(() => api.getTacticsWorkspace(other, teamId), /Só o técnico/)
  await assert.rejects(() => api.saveTacticalPlay(other, teamId, fromPlay(saved)), /Só o técnico/)
  await assert.rejects(() => api.deleteTacticalPlay(other, teamId, saved.id, saved.revision), /Só o técnico/)
  const otherWorkspace = await api.getTacticsWorkspace(other, other.teamId)
  assert.equal(otherWorkspace.plays.length, 0)
  assert.equal(otherWorkspace.draft.name, 'Nova jogada')
})

test('validação impede atleta adversário, duplicatas, sexto atleta e posições fora da quadra', async () => {
  const draft = await newDraft()
  for (const mutate of [
    (b) => { b.players[0].athleteId = 'isabela-prado' },
    (b) => { b.players[0].athleteId = b.players[1].athleteId },
    (b) => { b.players.push({ id: 'sexto', athleteId: 'alice-barros', x: 50, y: 70 }) },
    (b) => { b.players[0].x = -1 },
    (b) => { b.players[0].y = Infinity },
    (b) => { b.ball = { x: 101, y: 0 } },
    (b) => { b.defenders[0].x = NaN },
  ]) {
    const invalid = structuredClone(draft)
    mutate(invalid.board)
    await assert.rejects(() => api.saveTacticalPlay(coach, teamId, invalid), api.TacticsError)
  }
  assert.equal((await workspace()).plays.length, 0)
})

test('desenhos aceitam todas as ferramentas e recusam geometrias inválidas', async () => {
  const draft = await newDraft()
  draft.board.drawings = ['move', 'pass', 'dribble', 'screen', 'freehand'].map((kind, i) => ({ id: `s-${i}`, kind, color: 'ink', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }))
  const saved = await api.saveTacticalPlay(coach, teamId, draft)
  assert.equal(saved.board.drawings.length, 5)
  for (const mutate of [
    (b) => { b.drawings[0].points = [{ x: 10, y: 20 }] },
    (b) => { b.drawings[0].points[0].x = 110 },
    (b) => { b.drawings[0].kind = 'script' },
    (b) => { b.drawings[0].color = 'url(https://example.test)' },
    (b) => { b.drawings[1].id = b.drawings[0].id },
    (b) => { b.drawings[0].points = Array.from({ length: 401 }, () => ({ x: 10, y: 20 })) },
  ]) {
    const invalid = fromPlay(structuredClone(saved))
    mutate(invalid.board)
    await assert.rejects(() => api.saveTacticalPlay(coach, teamId, invalid), /Desenho inválido/)
  }
})

test('nome, tipo e orientações são validados; novo rascunho pode ter nome ainda vazio', async () => {
  const draft = await newDraft()
  api.saveTacticsDraft(coach, teamId, { ...draft, name: '' })
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, { ...draft, name: 'AB' }), /nome/)
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, { ...draft, notes: 'x'.repeat(1201) }), /1.200/)
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, { ...draft, kind: 'invalido' }), /tipo/)
  await api.saveTacticalPlay(coach, teamId, draft)
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, { ...draft, name: '  CHIFRE DE TESTE  ' }), /Já existe/)
})

test('copiar cria uma jogada independente e excluir preserva o desenho como rascunho', async () => {
  const original = await api.saveTacticalPlay(coach, teamId, await newDraft())
  const copy = await api.saveTacticalPlay(coach, teamId, { ...fromPlay(original), playId: null, baseRevision: null, name: 'Chifre (cópia)' })
  assert.notEqual(copy.id, original.id)
  assert.equal((await workspace()).plays.length, 2)
  await api.deleteTacticalPlay(coach, teamId, copy.id, copy.revision)
  const w = await workspace()
  assert.equal(w.plays.length, 1)
  assert.equal(w.plays[0].id, original.id)
  assert.equal(w.draft.playId, null)
  assert.equal(w.draft.baseRevision, null)
  assert.equal(w.draft.name, 'Chifre (cópia)')
  await assert.rejects(() => api.saveTacticalPlay(coach, teamId, fromPlay(copy)), /foi excluída/)
})

test('objetos devolvidos e rascunhos não permitem alterar o caderno por referência', async () => {
  const draft = await newDraft()
  const saved = await api.saveTacticalPlay(coach, teamId, draft)
  draft.board.players[0].x = 0
  saved.board.players[0].x = 1
  const w = await workspace()
  assert.equal(w.plays[0].board.players[0].x, 50)
  w.plays[0].board.players[0].x = 2
  w.draft.board.players[0].x = 3
  assert.equal((await workspace()).plays[0].board.players[0].x, 50)
})

test('desfazer/refazer restaura a jogada e preserva a revisão atual depois de salvar', async () => {
  const draft = await newDraft()
  let h = { past: [], present: draft, future: [] }
  h = model.changeTactic(h, { ...draft, notes: 'Corte pelo fundo' })
  const moved = structuredClone(h.present)
  moved.board.players[0].x = 70
  h = model.changeTactic(h, moved)
  h = { ...h, present: { ...h.present, playId: 'salva', baseRevision: 7 } }
  h = model.undoTactic(h)
  assert.equal(h.present.board.players[0].x, 50)
  assert.equal(h.present.notes, 'Corte pelo fundo')
  assert.equal(h.present.baseRevision, 7)
  h = model.redoTactic(h)
  assert.equal(h.present.board.players[0].x, 70)
  assert.equal(h.present.playId, 'salva')
  h = model.undoTactic(h)
  h = model.changeTactic(h, { ...h.present, notes: 'Novo caminho' })
  assert.equal(h.future.length, 0)
  assert.equal(model.redoTactic(h), h)
  for (let i = 0; i < 70; i++) h = model.changeTactic(h, { ...h.present, notes: String(i) })
  assert.equal(h.past.length, 50)
})

test('modelos e coordenadas funcionam sem extrapolar os limites da quadra', async () => {
  const w = await workspace()
  const boards = model.TACTIC_TEMPLATES.map((t) => model.makeTacticalBoard(w.roster, t.id))
  assert.notDeepEqual(boards[0].players, boards[1].players)
  assert.notDeepEqual(boards[1].players, boards[2].players)
  assert.deepEqual(model.clampPoint({ x: -10, y: 150 }, 3), { x: 3, y: 97 })
  assert.ok(boards.every((b) => b.players.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)))
})

test('a quadra exportável renderiza ferramentas e marcadores como SVG sem recursos externos', async () => {
  const w = await workspace()
  const board = w.draft.board
  board.showDefenders = true
  board.drawings = ['move', 'pass', 'dribble', 'screen', 'freehand'].map((kind, i) => ({ id: `s-${i}`, kind, color: 'ink', points: [{ x: 10, y: 20 }, { x: 70, y: 60 }] }))
  for (const court of ['half', 'full']) {
    const markup = renderToStaticMarkup(createElement('svg', { viewBox: `0 0 1000 ${court === 'half' ? 940 : 560}` }, createElement(BoardScene, { board: { ...board, court }, roster: w.roster })))
    assert.ok(markup.includes('Luiza'))
    assert.ok(markup.includes('marker-end="url(#'))
    assert.ok(markup.includes('stroke-dasharray="14 11"'))
    assert.equal(markup.includes('NaN'), false)
    assert.equal(markup.includes('Infinity'), false)
    assert.equal(markup.includes('<image'), false)
  }
})

test('jogadas e rascunho sobrevivem à recarga e contas da comissão têm rascunhos separados', async () => {
  const previous = globalThis.localStorage
  const saved = new Map()
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) }
  let reload
  try {
    const play = await api.saveTacticalPlay(coach, teamId, await newDraft())
    api.saveTacticsDraft(coach, teamId, { ...fromPlay(play), notes: 'Rascunho ainda em edição' })
    const colleague = { ...coach, id: 'colega-da-comissao' }
    const shared = await api.getTacticsWorkspace(colleague, teamId)
    assert.equal(shared.plays.length, 1)
    assert.equal(shared.draft.name, 'Nova jogada')
    reload = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
    const restored = await reload.ssrLoadModule('/src/api/tactics.ts')
    const w = await restored.getTacticsWorkspace(coach, teamId)
    assert.equal(w.plays[0].id, play.id)
    assert.equal(w.plays[0].notes, '')
    assert.equal(w.draft.notes, 'Rascunho ainda em edição')
    assert.equal(w.draft.baseRevision, play.revision)
  } finally {
    if (reload) await reload.close()
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})

test('restaurar a demonstração limpa o caderno e os rascunhos', async () => {
  await api.saveTacticalPlay(coach, teamId, await newDraft())
  store.resetDemoData()
  const w = await workspace()
  assert.equal(w.plays.length, 0)
  assert.equal(w.draft.playId, null)
  assert.equal(w.draft.name, 'Nova jogada')
})
