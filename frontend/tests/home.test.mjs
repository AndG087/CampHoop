import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// Carrega o mesmo TypeScript da aplicação sem criar uma segunda configuração.
const server = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
const { getHomeSummary } = await server.ssrLoadModule('/src/api/home.ts')
const { DEMO_USERS } = await server.ssrLoadModule('/src/auth/roles.ts')
const { changeDemoData, resetDemoData } = await server.ssrLoadModule('/src/api/mock/store.ts')
const { listTrainingSlots, cancelTraining, scheduleGame } = await server.ssrLoadModule('/src/api/schedule.ts')
const { getTeam } = await server.ssrLoadModule('/src/api/teams.ts')
after(() => server.close())
beforeEach(() => resetDemoData())

test('resumo geral conta partidas únicas e não expõe treinos a perfis sem equipe', async () => {
  for (const role of ['basico', 'organizador', 'estatistico']) {
    const summary = await getHomeSummary(DEMO_USERS[role], 'todas')
    assert.equal(summary.games, 8)
    assert.equal(summary.teams.length, 8)
    assert.equal(summary.activeCompetitions, 1)
    assert.equal(summary.upcoming.some((e) => e.kind === 'treino'), false)
    assert.equal(summary.live.length, 1)
  }
})

test('resumo da equipe usa a campanha e filtra adversários, resultados e treinos', async () => {
  for (const role of ['tecnico', 'atleta']) {
    const summary = await getHomeSummary(DEMO_USERS[role], 'minha')
    assert.equal(summary.teams.length, 1)
    assert.equal(summary.games, 4)
    assert.equal(summary.teams[0].wins, 3)
    assert.equal(summary.teams[0].losses, 1)
    assert.equal(summary.athletes, summary.teams[0].athletes)
    assert.ok(summary.results.every((g) => [g.home.id, g.away.id].includes('qv-sub17-f')))
    assert.ok(summary.upcoming.some((e) => e.kind === 'treino'))
    assert.ok(summary.upcoming.every((e) => e.kind === 'treino' ? e.team.id === 'qv-sub17-f' : [e.game.home.id, e.game.away.id].includes('qv-sub17-f')))
  }
})

test('escopo geral mantém os treinos restritos à equipe de quem está conectado', async () => {
  const summary = await getHomeSummary(DEMO_USERS.tecnico, 'todas')
  assert.equal(summary.games, 8)
  assert.ok(summary.upcoming.filter((e) => e.kind === 'treino').every((e) => e.team.id === DEMO_USERS.tecnico.teamId))
})

test('treino cancelado sai dos próximos compromissos', async () => {
  const viewer = DEMO_USERS.tecnico
  const [slot] = await listTrainingSlots(viewer.teamId)
  await cancelTraining(viewer, viewer.teamId, slot.id, '2025-11-03')
  const summary = await getHomeSummary(viewer, 'minha')
  assert.equal(summary.upcoming.some((e) => e.kind === 'treino' && e.slotId === slot.id && e.date === '2025-11-03'), false)
})

test('amistoso criado na agenda aparece no início sem alterar a campanha', async () => {
  await scheduleGame(DEMO_USERS.tecnico, { competitionId: null, homeTeamId: 'qv-sub17-f', awayTeamId: 'fc-sub17-f', date: '2025-10-30', time: '10:00', venue: 'Quadra teste' })
  const summary = await getHomeSummary(DEMO_USERS.tecnico, 'minha')
  assert.ok(summary.upcoming.some((e) => e.kind === 'jogo' && e.game.competition === 'Amistoso' && e.game.venue === 'Quadra teste'))
  assert.equal(summary.games, 4)
})

test('resultados vêm do histórico completo, antes do limite de cinco itens', async () => {
  const viewer = { ...DEMO_USERS.tecnico, teamId: 'sa-sub17-f' }
  const summary = await getHomeSummary(viewer, 'minha')
  assert.equal(summary.results.length, 2)
  assert.deepEqual(summary.results.map((g) => g.id), ['m-101', 'm-100'])
})

test('agenda vazia, jogos passados e eventos além de 30 dias', async () => {
  changeDemoData((d) => { d.slots = [] })
  const summary = await getHomeSummary(DEMO_USERS.tecnico, 'minha', '2026-01-01')
  assert.deepEqual(summary.upcoming, [])
  assert.deepEqual(summary.live, [])
  assert.equal(summary.games, 4)
})

test('médias e evolução do painel conferem com o perfil da equipe', async () => {
  const viewer = DEMO_USERS.tecnico
  const summary = await getHomeSummary(viewer, 'minha')
  const profile = await getTeam(viewer.teamId)
  assert.equal(summary.pointsPerGame, profile.pointsFor)
  assert.equal(summary.pointsAgainst, profile.pointsAgainst)
  assert.equal(summary.pointsPerGame, 60)
  assert.equal(summary.pointsAgainst, 53.8)
  assert.deepEqual(summary.performance.map((g) => g.scored), [62, 68, 59, 51])
  assert.deepEqual(summary.performance.map((g) => g.allowed), [58, 54, 48, 55])
  assert.equal(summary.weekGames, 1)
  assert.equal(summary.weekTrainings, 1)
})

test('destaques calculam médias de estatísticas sem expor dados privados', async () => {
  const summary = await getHomeSummary(DEMO_USERS.tecnico, 'minha')
  const luiza = summary.leaders.find((a) => a.id === 'luiza-martins')
  assert.equal(luiza.points, 18.3)
  assert.equal(luiza.rebounds, 4.8)
  assert.equal(luiza.assists, 6.5)
  assert.equal(luiza.games, 4)
  assert.ok(summary.leaders.every((a) => a.team.id === 'qv-sub17-f'))
  assert.equal(JSON.stringify(summary.leaders).includes('birthDate'), false)
  assert.equal(JSON.stringify(summary.leaders).includes('development'), false)
})

test('média geral usa os dois lados das partidas, e amistosos não alteram estatísticas', async () => {
  const summary = await getHomeSummary(DEMO_USERS.basico, 'todas')
  assert.equal(summary.pointsPerGame, 51.3)
  assert.equal(summary.performance.length, 6)
  assert.equal(summary.weekGames, 2)
  assert.equal(summary.weekTrainings, 0)
  assert.equal(summary.activeAthletes, 17)
  await scheduleGame(DEMO_USERS.tecnico, { competitionId: null, homeTeamId: 'qv-sub17-f', awayTeamId: 'fc-sub17-f', date: '2025-10-30', time: '10:00', venue: 'Quadra teste' })
  const updated = await getHomeSummary(DEMO_USERS.basico, 'todas')
  assert.equal(updated.pointsPerGame, summary.pointsPerGame)
  assert.deepEqual(updated.performance, summary.performance)
})
