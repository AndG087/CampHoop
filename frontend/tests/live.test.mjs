import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
const api = await server.ssrLoadModule('/src/api/live.ts')
const clock = await server.ssrLoadModule('/src/api/liveTypes.ts')
const store = await server.ssrLoadModule('/src/api/mock/store.ts')
const { DEMO_USERS } = await server.ssrLoadModule('/src/auth/roles.ts')
const { getCompetition } = await server.ssrLoadModule('/src/api/competitions.ts')
const { getTeam } = await server.ssrLoadModule('/src/api/teams.ts')
const { getAthlete } = await server.ssrLoadModule('/src/api/athletes.ts')
const { getHomeSummary } = await server.ssrLoadModule('/src/api/home.ts')
const { listPublicGames } = await server.ssrLoadModule('/src/api/public.ts')
const { listSchedule } = await server.ssrLoadModule('/src/api/schedule.ts')
const stat = DEMO_USERS.estatistico
const id = 'm-110'
const home = 'qv-sub17-f'
const away = 'sa-sub17-f'

async function record(action, athleteId = 'luiza-martins', teamId = home, outAthleteId = null) {
  const m = await api.getMatch(id)
  await api.recordMatchAction(stat, id, m.state.revision, { action, athleteId, teamId, outAthleteId })
  return api.getMatch(id)
}
async function command(value) {
  const m = await api.getMatch(id)
  await api.controlMatch(stat, id, m.state.revision, value)
  return api.getMatch(id)
}
async function finish() {
  await command({ type: 'set', seconds: 0 })
  await command({ type: 'next-period' })
  await command({ type: 'set', seconds: 0 })
  return command({ type: 'finish' })
}

beforeEach(store.resetDemoData)
after(() => server.close())

test('snapshot inicial tem placar, estatísticas e parciais consistentes; consultas são públicas', async () => {
  const m = await api.getMatch(id)
  assert.equal(m.game.status, 'ao-vivo')
  assert.equal(m.homeScore, 42)
  assert.equal(m.awayScore, 38)
  assert.equal(m.state.period, 3)
  assert.equal(clock.clockSeconds(m.state), 272)
  assert.equal(m.box.filter((a) => a.teamId === home).reduce((n, a) => n + a.points, 0), 42)
  assert.equal(m.box.filter((a) => a.teamId === away).reduce((n, a) => n + a.points, 0), 38)
  assert.equal(m.quarters.reduce((n, q) => n + q.home, 0), 42)
  assert.equal(m.quarters.reduce((n, q) => n + q.away, 0), 38)
  for (const teamId of [home, away]) assert.equal(m.box.filter((a) => a.teamId === teamId && a.onCourt).length, 5)
  assert.equal(m.box.find((a) => a.athleteId === 'alice-barros').onCourt, false)
  assert.equal(JSON.stringify(m.box).includes('birthDate'), false)
  assert.equal(await api.getMatch('nao-existe'), null)
  assert.equal((await api.listMatches()).length, 11)
})

test('só o estatístico pode operar; perfis de técnico e organizador não registram ações', async () => {
  for (const viewer of [null, DEMO_USERS.tecnico, DEMO_USERS.organizador, DEMO_USERS.atleta, DEMO_USERS.basico]) {
    await assert.rejects(() => api.recordMatchAction(viewer, id, 0, { action: 'two', teamId: home, athleteId: 'luiza-martins' }), /Só o estatístico/)
    await assert.rejects(() => api.controlMatch(viewer, id, 0, { type: 'set', seconds: 0 }), /Só o estatístico/)
    await assert.rejects(() => api.startMatch(viewer, 'm-111', 0), /Só o estatístico/)
  }
  assert.equal((await api.getMatch(id)).state.events.length, 0)
})

test('lances das duas equipes alteram apenas os atletas e totais correspondentes', async () => {
  await record('two')
  await record('three')
  const m = await record('free', 'isabela-prado', away)
  assert.equal(m.homeScore, 47)
  assert.equal(m.awayScore, 39)
  assert.equal(m.box.find((a) => a.athleteId === 'luiza-martins').points, 23)
  assert.equal(m.box.find((a) => a.athleteId === 'isabela-prado').points, 23)
  assert.equal(m.quarters[2].home, 13)
  assert.equal(m.quarters[2].away, 9)
  assert.equal((await listPublicGames()).live[0].homeScore, 47)
  assert.equal((await getCompetition('liga-escolar-sp')).games.find((g) => g.id === id).awayScore, 39)
})

test('arremesso errado e fundamentos atualizam estatísticas sem somar pontos', async () => {
  const before = await api.getMatch(id)
  for (const action of ['miss-two', 'miss-three', 'miss-free', 'off-rebound', 'def-rebound', 'assist', 'steal', 'block', 'turnover']) await record(action)
  const after = await api.getMatch(id)
  const a = before.box.find((a) => a.athleteId === 'luiza-martins')
  const b = after.box.find((a) => a.athleteId === 'luiza-martins')
  assert.equal(after.homeScore, before.homeScore)
  assert.equal(after.awayScore, before.awayScore)
  assert.equal(b.fieldAttempts, a.fieldAttempts + 2)
  assert.equal(b.freeAttempts, a.freeAttempts + 1)
  for (const key of ['offensiveRebounds', 'defensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers']) assert.equal(b[key], a[key] + 1)
})

test('validação rejeita equipe, atleta, ação inválidos e atleta fora de quadra', async () => {
  const cases = [
    [{ action: 'two', teamId: 'outra', athleteId: 'luiza-martins' }, /equipe desta partida/],
    [{ action: 'two', teamId: away, athleteId: 'luiza-martins' }, /atleta disponível/],
    [{ action: 'two', teamId: home, athleteId: 'duda-alves' }, /atleta disponível/],
    [{ action: 'two', teamId: home, athleteId: 'alice-barros' }, /em quadra/],
    [{ action: 'desconhecida', teamId: home, athleteId: 'luiza-martins' }, /desconhecida/],
  ]
  for (const [input, message] of cases) await assert.rejects(() => api.recordMatchAction(stat, id, 0, input), message)
  assert.equal((await api.getMatch(id)).state.revision, 0)
})

test('desfazer reconstrói placar e estatísticas sem alterar o snapshot inicial', async () => {
  const baseline = await api.getMatch(id)
  let m = await record('three')
  await api.undoMatchAction(stat, id, m.state.revision)
  m = await api.getMatch(id)
  assert.equal(m.homeScore, baseline.homeScore)
  assert.deepEqual(m.box, baseline.box)
  assert.deepEqual(m.quarters, baseline.quarters)
  await assert.rejects(() => api.undoMatchAction(stat, id, m.state.revision), /Não há ação/)
})

test('substituição mantém no máximo cinco atletas e também pode ser desfeita', async () => {
  let m = await record('substitution', 'alice-barros', home, 'luiza-martins')
  assert.equal(m.box.find((a) => a.athleteId === 'alice-barros').onCourt, true)
  assert.equal(m.box.find((a) => a.athleteId === 'luiza-martins').onCourt, false)
  assert.equal(m.box.filter((a) => a.teamId === home && a.onCourt).length, 5)
  await assert.rejects(() => api.recordMatchAction(stat, id, m.state.revision, { action: 'two', teamId: home, athleteId: 'luiza-martins' }), /em quadra/)
  m = await record('two', 'alice-barros')
  assert.equal(m.box.find((a) => a.athleteId === 'alice-barros').points, 2)
  await api.undoMatchAction(stat, id, m.state.revision)
  m = await api.getMatch(id)
  await api.undoMatchAction(stat, id, m.state.revision)
  m = await api.getMatch(id)
  assert.equal(m.box.find((a) => a.athleteId === 'luiza-martins').onCourt, true)
  assert.equal(m.box.find((a) => a.athleteId === 'alice-barros').played, false)
})

test('não é possível exceder cinco em quadra ou substituir por atleta adversário', async () => {
  await assert.rejects(() => api.recordMatchAction(stat, id, 0, { action: 'substitution', athleteId: 'alice-barros', teamId: home }), /Retire um atleta/)
  await assert.rejects(() => api.recordMatchAction(stat, id, 0, { action: 'substitution', athleteId: 'valentina-reis', teamId: home, outAthleteId: 'luiza-martins' }), /atleta disponível/)
  await assert.rejects(() => api.recordMatchAction(stat, id, 0, { action: 'substitution', athleteId: 'alice-barros', teamId: home, outAthleteId: 'julia-teixeira' }), /atleta em quadra/)
})

test('quinta falta retira o atleta, bloqueia novos lances e permite preencher a vaga', async () => {
  await record('foul', 'julia-teixeira', away)
  let m = await record('foul', 'julia-teixeira', away)
  assert.equal(m.box.find((a) => a.athleteId === 'julia-teixeira').fouls, 5)
  assert.equal(m.box.find((a) => a.athleteId === 'julia-teixeira').onCourt, false)
  await assert.rejects(() => api.recordMatchAction(stat, id, m.state.revision, { action: 'two', athleteId: 'julia-teixeira', teamId: away }), /limite de faltas/)
  m = await record('substitution', 'valentina-reis', away)
  assert.equal(m.box.filter((a) => a.teamId === away && a.onCourt).length, 5)
  await api.undoMatchAction(stat, id, m.state.revision)
  m = await api.getMatch(id)
  await api.undoMatchAction(stat, id, m.state.revision)
  m = await api.getMatch(id)
  assert.equal(m.box.find((a) => a.athleteId === 'julia-teixeira').onCourt, true)
  assert.equal(m.box.find((a) => a.athleteId === 'julia-teixeira').fouls, 4)
})

test('revisão impede sobrescrever uma operação feita em outra tela', async () => {
  await record('two')
  await assert.rejects(() => api.recordMatchAction(stat, id, 0, { action: 'three', teamId: home, athleteId: 'luiza-martins' }), /outra tela/)
  assert.equal((await api.getMatch(id)).homeScore, 44)
})

test('relógio desconta pelo tempo real, pausa e mantém o valor após uma nova consulta', async () => {
  const originalNow = Date.now
  let now = 1_000_000
  Date.now = () => now
  try {
    let m = await command({ type: 'play' })
    now += 12_500
    assert.equal(clock.clockSeconds(m.state), 260)
    await assert.rejects(() => api.controlMatch(stat, id, m.state.revision, { type: 'set', seconds: 10 }), /Pause/)
    m = await command({ type: 'pause' })
    assert.equal(m.state.remainingSeconds, 260)
    now += 30_000
    assert.equal(clock.clockSeconds((await api.getMatch(id)).state), 260)
    m = await command({ type: 'play' })
    now += 999_000
    assert.equal(clock.clockSeconds(m.state), 0)
    assert.equal(clock.clockSeconds(m.state, 0), m.state.remainingSeconds)
  } finally { Date.now = originalNow }
})

test('períodos e ajustes são validados; partida agendada exige início', async () => {
  await assert.rejects(() => api.recordMatchAction(stat, 'm-111', 0, { action: 'two', athleteId: 'luiza-martins', teamId: home }), /Inicie/)
  await api.startMatch(stat, 'm-111', 0)
  assert.equal((await api.getMatch('m-111')).state.period, 1)
  for (const value of [-1, 601, 1.5, NaN]) await assert.rejects(() => api.controlMatch(stat, id, 0, { type: 'set', seconds: value }), /tempo válido/)
  await assert.rejects(() => api.controlMatch(stat, id, 0, { type: 'next-period' }), /zerado/)
  await assert.rejects(() => api.controlMatch(stat, id, 0, { type: 'finish' }), /último período/)
  await assert.rejects(() => api.controlMatch(stat, 'm-100', 0, { type: 'play' }), /não pode ser alterada/)
})

test('empate exige prorrogação e só permite encerrar com vencedor e relógio zerado', async () => {
  await record('two', 'isabela-prado', away)
  await record('two', 'isabela-prado', away)
  await command({ type: 'set', seconds: 0 })
  let m = await command({ type: 'next-period' })
  assert.equal(m.state.period, 4)
  assert.equal(m.state.remainingSeconds, 600)
  await command({ type: 'set', seconds: 0 })
  m = await api.getMatch(id)
  await assert.rejects(() => api.controlMatch(stat, id, m.state.revision, { type: 'finish' }), /empatado/)
  m = await command({ type: 'next-period' })
  assert.equal(m.state.period, 5)
  assert.equal(m.state.remainingSeconds, 300)
  await record('free')
  await command({ type: 'set', seconds: 0 })
  m = await command({ type: 'finish' })
  assert.equal(m.game.status, 'encerrado')
  assert.equal(m.quarters[4].home, 1)
  await assert.rejects(() => api.recordMatchAction(stat, id, m.state.revision, { action: 'two', athleteId: 'luiza-martins', teamId: home }), /encerrada/)
})

test('resultado final atualiza campeonato, equipes, atletas, agenda e início sem duplicar a partida', async () => {
  await record('three')
  const m = await finish()
  assert.equal(m.homeScore, 45)
  const league = await getCompetition('liga-escolar-sp')
  const row = league.standings[0].rows.find((r) => r.team.id === home)
  assert.equal(row.played, 5)
  assert.equal(row.points, 9)
  assert.equal(row.wins, 4)
  assert.equal(league.games.filter((g) => g.id === id).length, 1)
  assert.equal((await getTeam(home)).games, 5)
  const athlete = await getAthlete('luiza-martins', null)
  assert.equal(athlete.games, 5)
  assert.equal(athlete.recentGames[0].points, 21)
  assert.equal(athlete.recentGames[0].minutes, null)
  assert.equal((await getHomeSummary(DEMO_USERS.tecnico, 'minha')).games, 5)
  assert.equal((await listPublicGames()).live.some((g) => g.id === id), false)
  assert.equal(store.allUpcomingMatches().some((g) => g.id === id), false)
  assert.equal((await listSchedule('2025-10-29', '2025-10-29', null)).filter((e) => e.id === id).length, 1)
  await assert.rejects(() => api.controlMatch(stat, id, m.state.revision, { type: 'finish' }), /encerrada/)
})

test('observadores são notificados e os dados continuam válidos após restaurar a demonstração', async () => {
  let notifications = 0
  const stop = store.subscribeDemoData(() => notifications++)
  await record('two')
  assert.equal(notifications, 1)
  stop()
  store.resetDemoData()
  assert.equal(notifications, 1)
  assert.equal((await api.getMatch(id)).homeScore, 42)
  assert.equal(store.allFinishedMatches().length, 8)
})

test('simular o encerramento de um jogo agendado mantém a campanha consistente em todas as telas', async () => {
  const futureId = 'm-111'
  await api.startMatch(stat, futureId, 0)
  let m = await api.getMatch(futureId)
  await api.recordMatchAction(stat, futureId, m.state.revision, { action: 'two', teamId: home, athleteId: 'luiza-martins' })
  for (let period = 1; period <= 4; period++) {
    m = await api.getMatch(futureId)
    await api.controlMatch(stat, futureId, m.state.revision, { type: 'set', seconds: 0 })
    m = await api.getMatch(futureId)
    await api.controlMatch(stat, futureId, m.state.revision, { type: period === 4 ? 'finish' : 'next-period' })
  }
  const team = await getTeam(home)
  const summary = await getHomeSummary(DEMO_USERS.tecnico, 'minha')
  assert.equal(summary.games, team.games)
  assert.equal(summary.pointsPerGame, team.pointsFor)
  assert.equal(summary.teams[0].wins, 4)
  assert.equal(summary.live.length, 1)
  assert.equal(summary.upcoming.some((e) => e.id === futureId), false)
})

test('relógio e lances são recuperados após carregar o armazenamento novamente', async () => {
  const previous = globalThis.localStorage
  const saved = new Map()
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) }
  let reload
  try {
    await record('three')
    await command({ type: 'play' })
    reload = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
    const restored = await reload.ssrLoadModule('/src/api/live.ts')
    const m = await restored.getMatch(id)
    assert.equal(m.homeScore, 45)
    assert.equal(m.state.events.length, 1)
    assert.equal(m.state.events[0].action, 'three')
    assert.notEqual(m.state.runningSince, null)
    const rows = await restored.listMatches()
    assert.equal(rows.find((g) => g.id === id).homeScore, 45)
  } finally {
    if (reload) await reload.close()
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})
