import { test, expect, type Page } from '@playwright/test'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

const envFile = new URL('../../backend/.env', import.meta.url)
const password = process.env.CAMPHOOP_TEST_PASSWORD ?? (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^DEMO_PASSWORD=(.+)$/m)?.[1].trim() : undefined)
test.skip(!password, 'Set CAMPHOOP_TEST_PASSWORD or configure the local backend/.env')
// These legacy scenarios exercise the optional NCAA demonstration dataset.
test.beforeEach(async ({ request }) => {
  const meta = await (await request.get('/api/meta')).json()
  test.skip(!meta.availableSeasons?.some((s: { origin: string }) => s.origin === 'ncaa'), 'Requires the optional NCAA demonstration database')
})
async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail', { exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Entrar →', exact: true }).click()
  await expect(page.locator('.sidebar')).toBeVisible()
}

test('Marina can browse her imported UConn women roster and both seasonal profiles', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page, 'marina@camphoop.demo')
  await page.getByRole('combobox', { name: 'Temporada', exact: true }).selectOption('2026/27')
  await page.getByRole('link', { name: 'Ver elenco →', exact: true }).click()
  await expect(page).toHaveURL(/atletas\?equipe=ncaa-w-team-41$/)
  await expect(page.locator('.table-count')).toContainText('13 atletas')
  await page.getByRole('button', { name: 'Meus elencos', exact: true }).click()
  await expect(page.locator('.athlete-row')).toHaveCount(13)
  await page.getByRole('link', { name: 'KK Arnold', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'KK Arnold', level: 1 })).toBeVisible()
  await expect(page.locator('.roster-source')).toContainText('2026/27')
  await expect(page.getByRole('button', { name: 'Editar perfil', exact: true })).toHaveCount(0)
  await page.goto('/times?origem=proprio')
  await expect(page.locator('.team-card')).toHaveCount(1)
  await expect(page.locator('.team-card')).toContainText('UConn')
  await expect(page.locator('.team-card')).toContainText('Feminino')
  await page.getByRole('combobox', { name: 'Temporada', exact: true }).selectOption('2024/25')
  await page.getByRole('link', { name: 'Ver elenco →', exact: true }).click()
  await page.getByRole('button', { name: 'Meus elencos', exact: true }).click()
  await expect(page.locator('.athlete-row')).toHaveCount(14)
  await page.getByRole('link', { name: 'Paige Bueckers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Paige Bueckers', level: 1 })).toBeVisible()
  await expect(page.locator('.roster-source')).toContainText('2024/25')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Paige Bueckers', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('opening My rosters clears filters that hide Marina UConn women team', async ({ page }) => {
  await login(page, 'marina@camphoop.demo')
  await page.getByRole('combobox', { name: 'Temporada', exact: true }).selectOption('2026/27')
  await page.goto('/atletas?categoria=Sub-17&equipe=ncaa-m-team-41&busca=sem-resultado')
  await expect(page.locator('.table-count')).toContainText('0 atletas')
  await page.getByRole('button', { name: 'Meus elencos', exact: true }).click()
  await expect(page).toHaveURL(/\/atletas\?origem=proprio$/)
  await expect(page.locator('.athlete-row')).toHaveCount(13)
  await expect(page.getByRole('combobox', { name: 'Equipe', exact: true })).toHaveValue('')
  await expect(page.getByRole('searchbox', { name: 'Buscar atleta pelo nome', exact: true })).toHaveValue('')
  await expect(page.getByRole('group', { name: 'Categoria', exact: true }).getByRole('button', { name: 'Todas', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('.athlete-row')).toHaveCount(13)
  await page.goto('/times?genero=Masculino&clube=ncaa-club-41&campeonato=ncaa-m-2027')
  await expect(page.getByRole('group', { name: 'Gênero', exact: true }).getByRole('button', { name: 'Masculino', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Meus elencos', exact: true }).click()
  await expect(page).toHaveURL(/\/times\?origem=proprio$/)
  await expect(page.locator('.team-card')).toHaveCount(1)
  await expect(page.locator('.team-card')).toContainText('UConn')
  await expect(page.locator('.team-card')).toContainText('Feminino')
  await page.reload()
  await expect(page.locator('.team-card')).toHaveCount(1)
})

test('visitor explores the real NCAA final and historical source', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Temporada' }).selectOption('2024/25')
  await expect(page.getByRole('link', { name: /NCAA 2025.*Feminino/ })).toBeVisible()
  await page.goto('/ao-vivo?partida=ncaa-w-game-401746075&aba=box')
  await expect(page.locator('.match-scoreboard__score strong').first()).toHaveText('59')
  await expect(page.locator('.match-scoreboard__score strong').last()).toHaveText('82')
  await expect(page.locator('.match-box-grid')).toContainText('Paige Bueckers')
  await expect(page.locator('.data-source')).toContainText('2024/25')
  await expect(page.getByRole('button', { name: 'Iniciar partida ↗' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: 'test-results/ncaa-mobile.png', fullPage: true })
  await page.goto('/ao-vivo?partida=ncaa-m-game-401746082')
  await expect(page.locator('.match-quarters thead th')).toHaveCount(4)
  await page.goto('/ao-vivo?partida=ncaa-m-game-401746044&aba=box')
  await expect(page.locator('.match-footnote').first()).toContainText('divergência')
  expect(errors).toEqual([])
})

test('the create-team URL does not open a management dialog for other roles', async ({ page }) => {
  for (const email of ['beatriz@camphoop.demo', 'joao@camphoop.demo']) {
    await page.request.post('/api/auth/logout')
    await login(page, email)
    await page.goto('/times?nova=1')
    await expect(page.getByRole('heading', { name: 'Times', level: 1 })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Criar equipe', exact: true })).toHaveCount(0)
  }
})

test('coach signs in with a real password and persists a private tactical play', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail', { exact: true }).fill('marina@camphoop.demo')
  await page.getByLabel('Senha', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Entrar →', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('inválidos')
  await login(page, 'marina@camphoop.demo')
  await expect(page.locator('.home-dashboard')).toContainText('UConn')
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true })
  const original = await (await page.request.get('/api/tactics/ncaa-w-team-41')).json()
  let playId: string | undefined
  try {
    await page.goto('/quadro-tatico')
    const name = `CampHoop E2E ${Date.now()}`
    await page.getByLabel('Nome da jogada', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Salvar no caderno' }).click()
    await expect(page.locator('.tactics-notebook')).toContainText(name)
    const saved = await (await page.request.get('/api/tactics/ncaa-w-team-41')).json()
    const play = saved.plays.find((p: { name: string }) => p.name === name)
    playId = play.id
    await page.reload()
    await expect(page.getByLabel('Nome da jogada', { exact: true })).toHaveValue(name)
    await page.goto('/atletas/' + original.roster[0].id)
    await expect(page.locator('.facts')).toContainText('Não informada')
  } finally {
    if (playId) {
      const current = await (await page.request.get('/api/tactics/ncaa-w-team-41')).json()
      const play = current.plays.find((p: { id: string }) => p.id === playId)
      if (play) await page.request.delete(`/api/tactics/ncaa-w-team-41/plays/${playId}?revision=${play.revision}`)
    }
    await page.request.put('/api/tactics/ncaa-w-team-41/draft', { data: original.draft })
  }
})

test('two independent browser sessions receive the same persisted live score', async ({ page, browser }) => {
  await login(page, 'marina@camphoop.demo')
  const summaries = await (await page.request.get('/api/teams/summary?season=2026/27')).json()
  const away = summaries.find((s: { team: { id: string; category: string; gender: string }; athletes: number }) => s.team.id !== 'ncaa-w-team-41' && s.team.category === 'Universitário' && s.team.gender === 'Feminino' && s.athletes >= 5).team
  const result = await page.request.post('/api/games?season=2026/27', { data: { competitionId: null, homeTeamId: 'ncaa-w-team-41', awayTeamId: away.id, date: '2027-06-15', time: '18:00', venue: 'CampHoop E2E' } })
  expect(result.ok()).toBe(true)
  const { id } = await result.json()
  // Test-owned IDs are retained for the explicit database cleanup after the test run.
  const cleanup = new URL('../../backend/data/e2e-games.json', import.meta.url)
  const ids: string[] = existsSync(cleanup) ? JSON.parse(readFileSync(cleanup, 'utf8')) : []
  writeFileSync(cleanup, JSON.stringify([...ids, id]))
  const observerContext = await browser.newContext()
  try {
    const observer = await observerContext.newPage()
    await observer.goto(`/ao-vivo?partida=${id}`)
    await expect(observer.locator('.match-status').first()).toHaveText('AGENDADO')
    await page.request.post('/api/auth/logout')
    await login(page, 'carlos@camphoop.demo')
    await page.goto(`/ao-vivo?partida=${id}`)
    await page.getByRole('button', { name: 'Iniciar partida ↗' }).click()
    await expect(observer.locator('.match-status').first()).toHaveText('AO VIVO', { timeout: 5000 })
    await page.getByRole('button', { name: /Registrar Cesta de 2 para/ }).click()
    await expect(observer.locator('.match-scoreboard__score strong').first()).toHaveText('02', { timeout: 5000 })
    await observer.reload()
    await expect(observer.locator('.match-scoreboard__score strong').first()).toHaveText('02')
    await expect(page.locator('.match-scoreboard__score strong').first()).toHaveText('02')
  } finally { await observerContext.close() }
})

test('season selection preserves historical results and changes competition routes', async ({ page }) => {
  await page.goto('/campeonatos/ncaa-w-2027')
  await expect(page.getByRole('heading', { name: 'NCAA 2026/27 · Feminino', exact: true })).toBeVisible()
  await expect(page.locator('.data-source')).toContainText('Cobertura parcial')
  await page.getByRole('combobox', { name: 'Temporada' }).selectOption('2024/25')
  await expect(page).toHaveURL(/ncaa-w-2025$/)
  await expect(page.getByRole('heading', { name: 'NCAA 2025 · Feminino', exact: true })).toBeVisible()
  await expect(page.locator('.data-source')).toContainText('134 jogos encerrados')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Temporada' })).toHaveValue('2024/25')
  await page.getByRole('combobox', { name: 'Temporada' }).selectOption('2026/27')
  await expect(page).toHaveURL(/ncaa-w-2027$/)
})

test('published future NCAA games are read only and large rosters render progressively', async ({ page }) => {
  await login(page, 'carlos@camphoop.demo')
  const upcoming = (await (await page.request.get('/api/public/games?season=2026/27')).json()).upcoming[0]
  await page.goto(`/ao-vivo?partida=${upcoming.id}`)
  await expect(page.locator('.match-status').first()).toHaveText('AGENDADO')
  await expect(page.getByRole('button', { name: 'Iniciar partida ↗' })).toHaveCount(0)
  await page.goto('/atletas')
  await expect(page.locator('.athlete-row')).toHaveCount(50)
  await page.getByRole('button', { name: 'Carregar mais' }).click()
  await expect(page.locator('.athlete-row')).toHaveCount(100)
  await page.screenshot({ path: 'test-results/ncaa-2027-roster.png', fullPage: false })
})
