import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
const api = await server.ssrLoadModule('/src/api/competitions.ts')
const { DEMO_USERS } = await server.ssrLoadModule('/src/auth/roles.ts')
const { allCompetitions, competitionTeamIds, resetDemoData } = await server.ssrLoadModule('/src/api/mock/store.ts')
const { scheduleGame } = await server.ssrLoadModule('/src/api/schedule.ts')
const { listTeamSummaries } = await server.ssrLoadModule('/src/api/teams.ts')
const { listCompetitions, listPublicGames } = await server.ssrLoadModule('/src/api/public.ts')
const { teamById } = await server.ssrLoadModule('/src/api/athletes.ts')
const organizer = DEMO_USERS.organizador
const division = { category: 'Sub-17', gender: 'Feminino' }
const create = (name = 'Copa de teste') => api.createCompetition(organizer, { name, divisions: [division] })
const official = (competitionId, date = '2025-11-10') => ({ competitionId, homeTeamId: 'qv-sub17-f', awayTeamId: 'sa-sub17-f', date, time: '15:30', venue: 'Quadra de teste' })

after(() => server.close())
beforeEach(resetDemoData)

test('classificação usa 2 por vitória e 1 por derrota, em divisões independentes', async () => {
  const league = await api.getCompetition('liga-escolar-sp')
  assert.equal(league.teams, 8)
  assert.deepEqual(league.standings.map((s) => s.rows.length), [4, 2, 2])
  const rows = league.standings[0].rows
  assert.deepEqual(rows.map((r) => [r.team.id, r.points]), [['qv-sub17-f', 7], ['fc-sub17-f', 2], ['sa-sub17-f', 2], ['vb-sub17-f', 1]])
  assert.deepEqual([rows[0].played, rows[0].wins, rows[0].losses, rows[0].pointsFor, rows[0].pointsAgainst, rows[0].difference], [4, 3, 1, 240, 215, 25])
  assert.deepEqual(rows[0].form, ['V', 'V', 'V', 'D'])
  assert.equal(league.games.filter((g) => g.status === 'ao-vivo').length, 1)
})

test('estar inscrito em outro campeonato não transporta resultados para ele', async () => {
  for (const id of ['copa-base-paulista', 'circuito-metropolitano']) {
    const c = await api.getCompetition(id)
    assert.equal(c.games.length, 0)
    assert.ok(c.standings.every((s) => s.rows.every((r) => r.played === 0 && r.points === 0)))
  }
  assert.equal(await api.getCompetition('inexistente'), null)
})

test('desempates seguem saldo, pontos feitos e ordenação estável', () => {
  const teams = ['qv-sub17-f', 'sa-sub17-f', 'vb-sub17-f', 'fc-sub17-f'].map(teamById)
  const game = (id, home, away, a, b, status = 'encerrado') => ({ id, date: '2025-10-01', status, home, away, homeScore: a, awayScore: b })
  const games = [game('a', teams[0], teams[1], 60, 50), game('b', teams[2], teams[3], 70, 50)]
  assert.deepEqual(api.buildStandings(teams, games).map((r) => r.team.id), ['vb-sub17-f', 'qv-sub17-f', 'sa-sub17-f', 'fc-sub17-f'])
  const tiedDifference = [game('a', teams[0], teams[1], 60, 50), game('b', teams[2], teams[3], 70, 60)]
  assert.equal(api.buildStandings(teams, tiedDifference)[0].team.id, 'vb-sub17-f')
  const identical = [game('a', teams[0], teams[1], 60, 50), game('b', teams[2], teams[3], 60, 50)]
  assert.equal(api.buildStandings(teams, identical)[0].team.id, 'qv-sub17-f')
  assert.ok(api.buildStandings(teams, [game('live', teams[0], teams[1], 99, 1, 'ao-vivo')]).every((r) => r.points === 0))
})

test('apenas organizadores criam e nomes/divisões são validados', async () => {
  for (const viewer of [null, DEMO_USERS.tecnico, DEMO_USERS.atleta, DEMO_USERS.basico, DEMO_USERS.estatistico]) {
    await assert.rejects(() => api.createCompetition(viewer, { name: 'Copa não autorizada', divisions: [division] }), /Só o organizador/)
  }
  await assert.rejects(() => api.createCompetition(organizer, { name: 'AB', divisions: [division] }), /nome/)
  await assert.rejects(() => api.createCompetition(organizer, { name: 'Copa', divisions: [] }), /divisão/)
  await assert.rejects(() => api.createCompetition(organizer, { name: 'Copa', divisions: [{ category: 'Sub-99', gender: 'Feminino' }] }), /divisão/)
  await create()
  await assert.rejects(() => create('  COPA DE TESTE  '), /Já existe/)
})

test('campeonato novo tem dono, inscrições abertas e contagens reais', async () => {
  const id = await create()
  const c = await api.getCompetition(id)
  assert.equal(c.organizerId, organizer.id)
  assert.equal(c.status, 'inscricoes')
  assert.equal(c.teams, 0)
  await api.enrollTeams(organizer, id, ['qv-sub17-f', 'sa-sub17-f', 'sa-sub17-f'])
  assert.equal(competitionTeamIds(id).length, 2)
  assert.equal((await api.getCompetition(id)).teams, 2)
  assert.equal((await listCompetitions()).find((c) => c.id === id).teams, 2)
  assert.ok((await listTeamSummaries()).find((s) => s.team.id === 'qv-sub17-f').competitions.some((c) => c.id === id))
})

test('inscrições são atômicas, compatíveis com a divisão e sem duplicatas', async () => {
  const id = await create()
  await assert.rejects(() => api.enrollTeams(organizer, id, ['qv-sub17-f', 'qv-sub15-m']), /categoria e o gênero/)
  assert.equal(competitionTeamIds(id).length, 0)
  await assert.rejects(() => api.enrollTeams(organizer, id, ['inexistente']), /não existe/)
  await api.enrollTeams(organizer, id, ['qv-sub17-f'])
  await assert.rejects(() => api.enrollTeams(organizer, id, ['qv-sub17-f']), /já está inscrita/)
  assert.equal((await api.getCompetition(id)).teams, 1)
  await assert.rejects(() => api.enrollTeams(organizer, 'liga-escolar-sp', ['qv-sub17-f']), /fechadas/)
})

test('outro organizador e perfis sem permissão não gerenciam o campeonato', async () => {
  const id = await create()
  const other = { ...organizer, id: 'outro-organizador', competitionIds: [] }
  for (const viewer of [other, null, DEMO_USERS.tecnico, DEMO_USERS.atleta, DEMO_USERS.basico, DEMO_USERS.estatistico]) {
    await assert.rejects(() => api.enrollTeams(viewer, id, ['qv-sub17-f']), /Só o organizador/)
    await assert.rejects(() => scheduleGame(viewer, official(id)), /Só o organizador/)
  }
})

test('organizador agenda campeonato criado e o jogo aparece na tabela e página pública', async () => {
  const id = await create()
  await assert.rejects(() => scheduleGame(organizer, official(id)), /precisam estar inscritas/)
  await api.enrollTeams(organizer, id, ['qv-sub17-f', 'sa-sub17-f'])
  await scheduleGame(organizer, official(id))
  const profile = await api.getCompetition(id)
  assert.equal(profile.games.length, 1)
  assert.equal(profile.games[0].competition, 'Copa de teste')
  assert.ok(profile.standings[0].rows.every((r) => r.points === 0))
  assert.ok((await listPublicGames()).upcoming.some((g) => g.competition === 'Copa de teste'))
  await assert.rejects(() => scheduleGame(organizer, official(id)), /já tem jogo/)
})

test('amistosos não aparecem em campeonatos e dados de jogo são validados', async () => {
  await scheduleGame(DEMO_USERS.tecnico, { ...official(null), awayTeamId: 'fc-sub17-f' })
  assert.equal((await api.getCompetition('liga-escolar-sp')).games.length, 11)
  await assert.rejects(() => scheduleGame(organizer, { ...official('liga-escolar-sp'), date: '2025-02-30' }), /válidos/)
  await assert.rejects(() => scheduleGame(organizer, { ...official('liga-escolar-sp'), time: '25:00' }), /válidos/)
  await assert.rejects(() => scheduleGame(organizer, { ...official('liga-escolar-sp'), venue: '  ' }), /válidos/)
  const withClosed = { ...organizer, competitionIds: ['circuito-metropolitano'] }
  await assert.rejects(() => scheduleGame(withClosed, official('circuito-metropolitano')), /finalizado/)
})

test('restaurar a demonstração remove campeonatos e inscrições criados', async () => {
  const id = await create()
  await api.enrollTeams(organizer, id, ['qv-sub17-f'])
  assert.equal(allCompetitions().length, 4)
  resetDemoData()
  assert.equal(allCompetitions().length, 3)
  assert.deepEqual(competitionTeamIds(id), [])
  assert.equal(await api.getCompetition(id), null)
})

test('cadastros sobrevivem à recarga e dados antigos da agenda são preservados', async () => {
  const previousStorage = globalThis.localStorage
  const saved = new Map()
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  }
  let reloaded
  try {
    const id = await create('Copa persistente')
    await api.enrollTeams(organizer, id, ['qv-sub17-f', 'sa-sub17-f'])
    await scheduleGame(organizer, official(id))
    reloaded = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
    const restoredApi = await reloaded.ssrLoadModule('/src/api/competitions.ts')
    const profile = await restoredApi.getCompetition(id)
    assert.equal(profile.teams, 2)
    assert.equal(profile.games.length, 1)
    assert.equal(profile.organizerId, organizer.id)
    await reloaded.close()
    reloaded = undefined
    const legacy = { slots: [], changes: [], matches: [{ id: 'legacy', ...official('liga-escolar-sp'), live: null }] }
    saved.set('camphoop.demoData.v1', JSON.stringify(legacy))
    reloaded = await createServer({ server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' })
    const legacyStore = await reloaded.ssrLoadModule('/src/api/mock/store.ts')
    assert.equal(legacyStore.allUpcomingMatches().some((m) => m.id === 'legacy'), true)
    assert.equal(legacyStore.allCompetitions().length, 3)
  } finally {
    if (reloaded) await reloaded.close()
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
