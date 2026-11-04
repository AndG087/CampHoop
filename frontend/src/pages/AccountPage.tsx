import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { disconnectGmail, forgotPassword, getAccount, pendingInvitation, resendVerification, savePreferences } from '../api/accounts'
import { useApi } from '../api/useApi'
import { remoteApi } from '../api/client'
import { useSession } from '../auth/session'
import { GoogleButton } from './AuthPages'
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
  return <><div className="page-head"><div><div className="eyebrow">SEU ESPAÇO NO CAMPHOOP</div><h1>Minha conta</h1><p>Acesso, mensagens e conexões em um só lugar.</p></div><Link className="btn btn--ghost" to="/clubes">Meus clubes →</Link></div>
    {params.has('cadastro') && <p className="account-success" role="status">Conta criada. Enviamos um link para confirmar seu e-mail.</p>}
    {params.get('google') === 'connected' && <p className="account-success" role="status">Sua conta Google foi conectada.</p>}
    {params.get('google') === 'gmail_connected' && <p className="account-success" role="status">Gmail autorizado para enviar as mensagens do CampHoop.</p>}
    {pendingInvitation() && <p className="account-note">Você tem um convite em andamento. <Link to="/convite">Continuar convite →</Link></p>}
    {account.loading && !data && <p role="status">Carregando sua conta…</p>}{account.error && <p role="alert" className="account-error">{account.error.message}</p>}
    {error && <p className="account-error" role="alert">{error}</p>}{feedback && <p className="account-success" role="status">{feedback}</p>}
    {data && <div className="account-grid"><section className="card account-panel"><h2>{data.name}</h2><p>{data.email}</p><span className="pill">{data.isDemo ? 'CONTA DE TESTE' : data.emailVerified ? 'E-MAIL CONFIRMADO' : 'CONFIRMAÇÃO PENDENTE'}</span>
      {data.isDemo ? <p className="account-note">Esta é uma conta fictícia para testar o sistema. <Link to="/cadastro">Crie uma conta real</Link> para gerenciar convites e conectar o Google.</p> : !data.emailVerified ? <><p>Confirme seu e-mail para criar um clube ou aceitar convites.</p><button className="btn btn--accent" disabled={busy} onClick={() => void action(resendVerification, 'Enviamos um novo link de confirmação.')}>Reenviar confirmação</button></> : <><p>Sua conta está pronta para participar de clubes e equipes.</p><Link className="btn btn--accent" to="/clubes">Organizar meus clubes</Link></>}
      {!data.isDemo && <button className="btn btn--ghost" disabled={busy} onClick={() => void action(() => forgotPassword(data.email), 'Se houver uma conta elegível, enviaremos um link para definir sua senha.')}>{data.hasPassword ? 'Redefinir minha senha' : 'Criar senha para entrar por e-mail'}</button>}
    </section><section className="card account-panel"><h2>Notificações por e-mail</h2><p>Receba novidades sobre os vínculos do seu clube. Mensagens de segurança e convites continuam sendo enviados quando necessários.</p><label className="account-check"><input type="checkbox" disabled={busy || data.isDemo} checked={data.emailNotifications ?? true} onChange={(e) => void action(() => savePreferences(e.target.checked), 'Preferência de e-mail atualizada.')} /> Receber avisos do meu clube por e-mail</label><Link className="btn btn--ghost" to="/notificacoes">Abrir notificações</Link>{data.mail.transport === 'capture' && <p className="account-note">Este ambiente usa entrega local durante os testes. Os e-mails começam a sair pelo Gmail após a autorização do remetente.</p>}</section>
    <section className="card account-panel"><h2>Entrada com Google</h2><p>Use a mesma conta Google do e-mail cadastrado. Sua senha do Google não é compartilhada com o CampHoop.</p>{data.googleLinked ? <span className="pill">GOOGLE CONECTADO</span> : <GoogleButton mode="link" disabled={data.isDemo || !data.emailVerified} />}</section>
    {data.canConnectGmail && <section className="card account-panel"><h2>Gmail do aplicativo</h2><p>Autorize o envio de convites e mensagens de conta pelo remetente configurado para o CampHoop. A autorização de envio é separada da entrada com Google.</p>{data.mail.gmailConnected ? <><span className="pill">GMAIL CONECTADO</span><br /><button className="btn btn--ghost" disabled={busy} onClick={() => location.assign('/api/auth/google/start?mode=gmail')}>Renovar autorização</button><button className="btn btn--ghost" disabled={busy} onClick={() => void action(disconnectGmail, 'A autorização Gmail foi revogada.')}>Desconectar Gmail</button></> : <button className="btn btn--accent" disabled={busy} onClick={() => location.assign('/api/auth/google/start?mode=gmail')}>Autorizar envio pelo Gmail</button>}</section>}
    </div>}
  </>
}
