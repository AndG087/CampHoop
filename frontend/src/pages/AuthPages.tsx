import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { ROLE_INFO } from '../auth/roles'
import { acceptInvitation, forgotPassword, getProviders, pendingInvitation, previewInvitation, registerAccount, resetPassword, storeInvitation, verifyEmail } from '../api/accounts'
import { useApi } from '../api/useApi'
import './AccountPages.css'

const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.'
export function AuthFrame({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="account-auth"><aside className="account-auth__story"><Link className="account-auth__brand" to="/">CampHoop<small>GAME ON. GROW TOGETHER.</small></Link><div><div className="eyebrow">SUA EQUIPE COMEÇA AQUI</div><h1>Um clube.<br />Muitas histórias.</h1><p>Conecte sua comissão e seus atletas. Organize cada temporada com as pessoas certas ao seu lado.</p></div><footer>BASQUETE DE BASE, CONECTADO</footer></aside><main className="account-auth__body"><div className="account-auth__form"><Link to="/login" className="back-link">← Entrar no CampHoop</Link><h2>{title}</h2><p>{intro}</p>{children}</div></main></div>
}

export function GoogleButton({ mode = 'login', disabled = false }: { mode?: 'login' | 'link'; disabled?: boolean }) {
  const providers = useApi(getProviders, 'auth:providers')
  const available = !!providers.data?.google
  return <><button type="button" className="google-button" disabled={disabled || !available} onClick={() => location.assign(`/api/auth/google/start?mode=${mode}`)}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.31.31-1.91V7.5H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.5l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.88-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.35 2.59A6 6 0 0 1 12 5.96Z"/></svg>{mode === 'link' ? 'Conectar conta Google' : 'Continuar com Google'}</button>{providers.data && !available && <p className="muted" style={{ fontSize: 11 }}>A entrada com Google aguarda configuração neste ambiente.</p>}</>
}

export function RegisterPage() {
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirmation) { setError('As senhas precisam ser iguais.'); return }
    setBusy(true)
    try { await registerAccount({ name, email, password }); await refresh(); navigate('/conta?cadastro=1') }
    catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Crie sua conta" intro="Confirme seu e-mail para criar um clube ou aceitar o convite da sua equipe."><form className="account-form" onSubmit={submit}><fieldset disabled={busy}><label>Seu nome<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Senha<input aria-label="Senha" aria-describedby="signup-password-hint" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /><small id="signup-password-hint" className="muted">Use pelo menos 12 caracteres.</small></label><label>Confirme a senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button className="btn btn--accent">{busy ? 'Criando conta…' : 'Criar minha conta'}</button></fieldset>{error && <p role="alert" className="account-error">{error}</p>}</form><GoogleButton disabled={busy} /><p>Já tem conta? <Link to="/login">Entrar</Link></p></AuthFrame>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [feedback, setFeedback] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const result = await forgotPassword(email); setFeedback(result.message) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <AuthFrame title="Recuperar sua senha" intro="Informe o e-mail da sua conta para receber um link de recuperação.">{feedback ? <p className="account-success" role="status">{feedback}</p> : <form className="account-form" onSubmit={submit}><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button className="btn btn--accent" disabled={busy}>{busy ? 'Solicitando…' : 'Enviar link de recuperação'}</button>{error && <p className="account-error" role="alert">{error}</p>}</form>}<Link to="/login">Voltar para entrar</Link></AuthFrame>
}

function fragmentToken() { return new URLSearchParams(location.hash.slice(1)).get('token') ?? '' }
export function ResetPasswordPage() {
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [token] = useState(fragmentToken)
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [done, setDone] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirmation) { setError('As senhas precisam ser iguais.'); return }
    setBusy(true)
    try { await resetPassword(token, password); history.replaceState(null, '', location.pathname); await refresh(); setDone(true); navigate('/login?senha=alterada', { replace: true }) }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <AuthFrame title="Escolha uma nova senha" intro="O link vale por 30 minutos e pode ser utilizado uma única vez.">{done ? <><p className="account-success" role="status">Senha alterada. Entre novamente com a nova senha.</p><Link className="btn btn--accent" to="/login">Entrar</Link></> : !token ? <p className="account-error" role="alert">Abra o link recebido por e-mail. <Link to="/recuperar-senha">Solicitar outro link</Link></p> : <form className="account-form" onSubmit={submit}><fieldset disabled={busy}><label>Nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label><label>Confirme a nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button className="btn btn--accent">{busy ? 'Salvando…' : 'Salvar nova senha'}</button></fieldset>{error && <p className="account-error" role="alert">{error}</p>}</form>}</AuthFrame>
}

export function VerifyEmailPage() {
  const { user, refresh } = useSession()
  const [token] = useState(fragmentToken)
  const [done, setDone] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function confirm() { setBusy(true); setError(''); try { await verifyEmail(token); history.replaceState(null, '', location.pathname); await refresh(); setDone(true) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <AuthFrame title="Confirme seu e-mail" intro="Este passo protege sua conta e os dados privados do clube.">{done ? <><p role="status" className="account-success">E-mail confirmado. Sua conta está pronta.</p><Link className="btn btn--accent" to={pendingInvitation() ? '/convite' : user ? '/clubes' : '/login'}>Continuar</Link></> : token && !user ? <><p className="account-note">Entre na conta que você criou antes de confirmar o e-mail.</p><Link className="btn btn--accent" to="/login" state={{ from: location.pathname + location.hash }}>Entrar para confirmar</Link></> : token ? <button className="btn btn--accent" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirmando…' : 'Confirmar meu e-mail'}</button> : <p className="account-note">Abra o link de confirmação recebido por e-mail.</p>}{error && <p className="account-error" role="alert">{error}</p>}</AuthFrame>
}

export function InvitationPage() {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const [token] = useState(() => fragmentToken() || pendingInvitation())
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInvitation>> | null>(null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (!token) return; storeInvitation(token); let active = true; void previewInvitation(token).then((data) => { if (active) setPreview(data) }, (e: Error) => { if (active) setError(e.message) }); return () => { active = false } }, [token])
  async function accept() { setBusy(true); setError(''); try { const result = await acceptInvitation({ token }); storeInvitation(''); history.replaceState(null, '', location.pathname); await refresh(); navigate('/clubes/' + result.clubId) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <AuthFrame title="Você foi convidado" intro="Entre com o mesmo e-mail que recebeu o convite para participar do clube.">{preview && <div className="account-note"><strong>{preview.club}</strong><p>Perfil: {ROLE_INFO[preview.role].label}</p><small>Válido até {new Date(preview.expiresAt).toLocaleDateString('pt-BR')}</small></div>}{!token && <p className="account-note">Abra o link recebido por e-mail ou consulte seus convites.</p>}{error && <p className="account-error" role="alert">{error}</p>}{preview && (!user ? <div className="account-links"><Link className="btn btn--accent" to="/login">Entrar para aceitar</Link><Link className="btn btn--ghost" to="/cadastro">Criar conta</Link></div> : !user.emailVerified || user.isDemo ? <><p className="account-note">Use uma conta real com e-mail confirmado para aceitar.</p><Link to="/conta">Minha conta</Link></> : <button className="btn btn--accent" disabled={busy} onClick={() => void accept()}>{busy ? 'Aceitando…' : 'Aceitar convite'}</button>)}</AuthFrame>
}

export const GOOGLE_MESSAGES: Record<string, string> = {
  invalid_state: 'A tentativa de entrada não é válida. Comece novamente.', expired: 'A tentativa de entrada expirou. Tente novamente.', cancelled: 'A conexão com Google foi cancelada.', identity_invalid: 'Não foi possível confirmar sua identidade no Google.', wrong_account: 'Escolha a mesma conta Google do e-mail cadastrado no CampHoop.', link_required: 'Este e-mail já tem conta. Entre com sua senha e conecte o Google em Minha conta.', already_linked: 'Esta conta Google já tem um vínculo diferente.', inactive: 'Esta conta está indisponível.', provider_unavailable: 'Não foi possível concluir a conexão com Google. Tente novamente.', mail_scope: 'Autorize o envio de e-mails para conectar o Gmail do aplicativo.', email_changed: 'O e-mail da conta Google mudou. Entre com sua senha para revisar o cadastro.',
}
