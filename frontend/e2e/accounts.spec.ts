import { test, expect, type Page } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const mailbox = process.env.CAMPHOOP_MAILBOX_DIR
const base = process.env.CAMPHOOP_URL ?? 'http://localhost:5173'
const password = 'Account-E2E-password-2026!'
test.skip(!mailbox, 'Run against an isolated account database with a local test mailbox')

function captured(email: string, subject: string): { to: string; subject: string; body: string } | undefined {
  if (!mailbox || !existsSync(mailbox)) return
  const files = readdirSync(mailbox).filter((name) => name.endsWith('.json')).map((name) => join(mailbox, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  for (const file of files) {
    const mail = JSON.parse(readFileSync(file, 'utf8'))
    if (mail.to === email && mail.subject.includes(subject)) return mail
  }
}
async function mailLink(email: string, subject: string) {
  await expect.poll(() => !!captured(email, subject), { timeout: 20000 }).toBe(true)
  const link = captured(email, subject)!.body.match(/https?:\/\/[^\s]+#token=[\w-]+/)?.[0]
  expect(!!link).toBe(true)
  return link!
}
async function register(page: Page, email: string, name: string) {
  await page.goto(base + '/cadastro')
  await page.getByLabel('Seu nome', { exact: true }).fill(name)
  await page.getByLabel('E-mail', { exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByLabel('Confirme a senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click()
  await expect(page).toHaveURL(/\/conta\?cadastro=1$/)
  await expect(page.getByText('CONFIRMAÇÃO PENDENTE', { exact: true })).toBeVisible()
  await page.goto(await mailLink(email, 'Confirme'))
  await page.getByRole('button', { name: 'Confirmar meu e-mail', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('E-mail confirmado')
}

test('real accounts create a club, accept an email invitation, read notifications and lose revoked access', async ({ page, browser }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(15000)
  const run = randomUUID().slice(0, 8)
  const ownerEmail = `owner-${run}@example.test`
  const coachEmail = `coach-${run}@example.test`
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await register(page, ownerEmail, 'Responsável E2E')
  await page.getByRole('link', { name: 'Continuar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Meus clubes', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '+ Criar clube', exact: true }).click()
  const clubForm = page.getByRole('dialog', { name: 'Criar meu clube', exact: true })
  await clubForm.getByLabel('Nome do clube', { exact: true }).fill('Clube E2E ' + run)
  await clubForm.getByLabel('Sigla', { exact: true }).fill('CE')
  await clubForm.getByLabel('Cidade', { exact: true }).fill('Campinas')
  await clubForm.getByRole('button', { name: 'Criar clube', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Clube E2E ' + run, level: 1 })).toBeVisible()
  const clubUrl = page.url()
  const clubId = new URL(clubUrl).pathname.split('/').pop()!
  await page.getByRole('link', { name: '+ Criar equipe', exact: true }).click()
  const teamForm = page.getByRole('dialog', { name: 'Criar equipe própria', exact: true })
  await teamForm.getByLabel('Nome da equipe', { exact: true }).fill('Equipe principal E2E')
  await teamForm.getByRole('button', { name: 'Criar equipe', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Equipe principal E2E', level: 1 })).toBeVisible()
  const teamId = new URL(page.url()).pathname.split('/').pop()!
  await page.getByRole('button', { name: '+ Adicionar atleta', exact: true }).click()
  const athleteForm = page.getByRole('dialog', { name: 'Adicionar atleta', exact: true })
  await athleteForm.getByLabel('Nome completo', { exact: true }).fill('Atleta E2E')
  await athleteForm.getByLabel('Número da camisa', { exact: true }).fill('8')
  await athleteForm.getByLabel('Posição', { exact: true }).fill('Armadora')
  await athleteForm.getByLabel('Data de nascimento (privada)', { exact: true }).fill('2009-03-14')
  await athleteForm.getByRole('button', { name: 'Cadastrar atleta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Atleta E2E', level: 1 })).toBeVisible()
  const athleteUrl = page.url()
  await page.goto(clubUrl)
  await page.getByRole('button', { name: '+ Convidar pessoa', exact: true }).click()
  const inviteForm = page.getByRole('dialog', { name: 'Convidar pessoa para o clube', exact: true })
  await inviteForm.getByLabel('E-mail da pessoa', { exact: true }).fill(coachEmail)
  await inviteForm.getByRole('combobox', { name: 'Equipe do convite', exact: true }).selectOption(teamId)
  await inviteForm.getByRole('button', { name: 'Enviar convite', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Convite criado')
  const inviteUrl = await mailLink(coachEmail, 'Convite')
  const coachContext = await browser.newContext({ baseURL: base })
  try {
    const coach = await coachContext.newPage()
    coach.on('pageerror', (error) => errors.push(error.message))
    await coach.goto(inviteUrl)
    await expect(coach.getByText('Clube E2E ' + run, { exact: true })).toBeVisible()
    await coach.getByRole('link', { name: 'Criar conta', exact: true }).click()
    await register(coach, coachEmail, 'Técnica E2E')
    await coach.getByRole('link', { name: 'Continuar', exact: true }).click()
    await coach.getByRole('button', { name: 'Aceitar convite', exact: true }).click()
    await expect(coach).toHaveURL(new RegExp(`/clubes/${clubId}$`))
    await expect(coach.getByRole('heading', { name: 'Seu vínculo', exact: true })).toBeVisible()
    await expect(coach.getByText(ownerEmail, { exact: true })).toHaveCount(0)
    await coach.goto(athleteUrl)
    await expect(coach.locator('.facts')).toContainText('14 mar 2009')
    await expect(coach.locator('.role-pill__demo')).toHaveCount(0)
    await page.getByRole('button', { name: /^Notificações/ }).click()
    await expect(page.getByRole('heading', { name: 'Notificações', level: 1 })).toBeVisible()
    await expect(page.locator('.notification-list')).toContainText('Novo membro no clube')
    await page.getByRole('button', { name: 'Marcar todas como lidas', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Notificações', exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'test-results/notifications-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(clubUrl)
    const member = page.locator('.account-list > li').filter({ hasText: coachEmail })
    await member.getByRole('button', { name: 'Encerrar vínculo', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar encerramento', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Vínculo encerrado')
    await coach.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(coach.locator('.facts')).not.toContainText('14 mar 2009')
    expect((await coach.request.get('/api/clubs/' + clubId)).status()).toBe(403)
    await coach.goto(base + '/recuperar-senha')
    await coach.getByLabel('E-mail', { exact: true }).fill(coachEmail)
    await coach.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click()
    await expect(coach.getByRole('status')).toContainText('Se houver uma conta')
    await coach.goto(await mailLink(coachEmail, 'Redefinir'))
    const newPassword = 'New-account-password-2026!'
    await coach.getByLabel('Nova senha', { exact: true }).fill(newPassword)
    await coach.getByLabel('Confirme a nova senha', { exact: true }).fill(newPassword)
    await coach.getByRole('button', { name: 'Salvar nova senha', exact: true }).click()
    await expect(coach).toHaveURL(/\/login\?senha=alterada$/)
    await coach.getByLabel('E-mail', { exact: true }).fill(coachEmail)
    await coach.getByLabel('Senha', { exact: true }).fill(newPassword)
    await coach.getByRole('button', { name: 'Entrar →', exact: true }).click()
    await expect(coach.locator('.sidebar')).toBeVisible()
    expect(errors).toEqual([])
  } finally { await coachContext.close() }
})
