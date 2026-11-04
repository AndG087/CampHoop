import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { forgotPassword, getAccount, pendingInvitation, resendVerification, savePreferences } from '../api/accounts'
import { useApi } from '../api/useApi'
import { remoteApi } from '../api/client'
import { useSession } from '../auth/session'
import './AccountPages.css'

export default function AccountPage() {
  const { user, refresh } = useSession()
  const [params] = useSearchParams()
  const account = useApi(getAccount, `account:${user?.id}`)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  async function action(run: () => Promise<unknown>, success: string) { setBusy(true); setFeedback(''); setError(''); try { await run(); await refresh(); setFeedback(success) } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.') } finally { setBusy(false) } }
  if (!remoteApi) return <p className="account-note">A gestão de contas está disponível com o backend conectado.</p>
  const data = account.data
  return <><div className="page-head"><div><div className="eyebrow">SEU ESPAÇO NO CAMPHOOP</div><h1>Minha conta</h1><p>Seu acesso e suas preferências de mensagens.</p></div><Link className="btn btn--ghost" to="/clubes">Meus clubes →</Link></div>
    {params.has('cadastro') && <p className="account-success" role="status">Conta criada. Enviamos um link para confirmar seu e-mail.</p>}
    {pendingInvitation() && <p className="account-note">Você tem um convite em andamento. <Link to="/convite">Continuar convite →</Link></p>}
    {account.loading && !data && <p role="status">Carregando sua conta…</p>}{account.error && <p role="alert" className="account-error">{account.error.message}</p>}
    {error && <p className="account-error" role="alert">{error}</p>}{feedback && <p className="account-success" role="status">{feedback}</p>}
    {data && <div className="account-grid"><section className="card account-panel"><h2>{data.name}</h2><p>{data.email}</p><span className="pill">{data.isDemo ? 'CONTA DE TESTE' : data.emailVerified ? 'E-MAIL CONFIRMADO' : 'CONFIRMAÇÃO PENDENTE'}</span>
      {data.isDemo ? <p className="account-note">Esta é uma conta fictícia para testar o sistema. <Link to="/cadastro">Crie uma conta real</Link> para usar sua própria identidade no CampHoop.</p> : !data.emailVerified ? <><p>Confirme seu e-mail para criar um clube ou aceitar convites.</p><button className="btn btn--accent" disabled={busy} onClick={() => void action(resendVerification, 'Enviamos um novo link de confirmação.')}>Reenviar confirmação</button></> : <><p>Sua conta está pronta para participar de clubes e equipes.</p><Link className="btn btn--accent" to="/clubes">Organizar meus clubes</Link></>}
      {!data.isDemo && <button className="btn btn--ghost" disabled={busy} onClick={() => void action(() => forgotPassword(data.email), 'Se houver uma conta elegível, enviaremos um link para definir sua senha.')}>{data.hasPassword ? 'Redefinir minha senha' : 'Criar senha para entrar por e-mail'}</button>}
    </section><section className="card account-panel"><h2>Notificações por e-mail</h2><p>Receba novidades sobre os vínculos do seu clube. Mensagens de segurança e convites continuam sendo enviados quando necessários.</p><label className="account-check"><input type="checkbox" disabled={busy || data.isDemo} checked={data.emailNotifications ?? true} onChange={(e) => void action(() => savePreferences(e.target.checked), 'Preferência de e-mail atualizada.')} /> Receber avisos do meu clube por e-mail</label><Link className="btn btn--ghost" to="/notificacoes">Abrir notificações</Link>{data.mail.transport === 'capture' && <p className="account-note">As mensagens deste ambiente são salvas apenas na caixa local de desenvolvimento. O envio externo está desativado.</p>}</section>
    </div>}
  </>
}
