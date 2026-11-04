import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { ROLE_INFO } from '../auth/roles'
import { acceptInvitation, forgotPassword, pendingInvitation, previewInvitation, registerAccount, resetPassword, storeInvitation, verifyEmail } from '../api/accounts'
import './AccountPages.css'

const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.'
export function AuthFrame({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="account-auth"><aside className="account-auth__story"><Link className="account-auth__brand" to="/">CampHoop<small>GAME ON. GROW TOGETHER.</small></Link><div><div className="eyebrow">SUA EQUIPE COMEÇA AQUI</div><h1>Um clube.<br />Muitas histórias.</h1><p>Conecte sua comissão e seus atletas. Organize cada temporada com as pessoas certas ao seu lado.</p></div><footer>BASQUETE DE BASE, CONECTADO</footer></aside><main className="account-auth__body"><div className="account-auth__form"><Link to="/login" className="back-link">← Entrar no CampHoop</Link><h2>{title}</h2><p>{intro}</p>{children}</div></main></div>
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
  return <AuthFrame title="Crie sua conta" intro="Confirme seu e-mail para criar um clube ou aceitar o convite da sua equipe."><form className="account-form" onSubmit={submit}><fieldset disabled={busy}><label>Seu nome<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Senha<input aria-label="Senha" aria-describedby="signup-password-hint" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /><small id="signup-password-hint" className="muted">Use pelo menos 12 caracteres.</small></label><label>Confirme a senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button className="btn btn--accent">{busy ? 'Criando conta…' : 'Criar minha conta'}</button></fieldset>{error && <p role="alert" className="account-error">{error}</p>}</form><p>Já tem conta? <Link to="/login">Entrar</Link></p></AuthFrame>
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
