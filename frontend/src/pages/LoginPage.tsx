import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { DEMO_USERS, ROLES, ROLE_INFO } from '../auth/roles'
import { useSession } from '../auth/session'
import './LoginPage.css'

export default function LoginPage() {
  const { user, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (user) return <Navigate to={from} replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.')
      return
    }
    if (!signIn(email, password)) {
      setError('E-mail não encontrado. Use uma das contas de demonstração abaixo.')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="login">
      <div className="login__side">
        <Link to="/" className="brand">
          <span className="brand__ball" aria-hidden="true" />
          <span>
            CampHoop
            <small>GAME ON. GROW TOGETHER.</small>
          </span>
        </Link>
        <div className="login__pitch">
          <div className="eyebrow login__eyebrow">BASQUETE DE BASE, CONECTADO</div>
          <h1>O jogo cresce com você.</h1>
          <p>Um espaço para equipes, atletas e comunidades viverem o basquete com mais dados, conexão e propósito.</p>
        </div>
        <small className="login__legal">© 2025 CampHoop · Protótipo demonstrativo</small>
      </div>

      <div className="login__box">
        <form className="login__form" onSubmit={submit} noValidate>
          <Link to="/" className="login__back">← Voltar para o CampHoop</Link>
          <h2>Entrar</h2>
          <p className="login__intro">Acesse sua conta para gerenciar equipes, acompanhar seu desempenho ou registrar partidas.</p>

          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} />
          </label>
          {error && <p className="login__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--accent login__submit">Entrar →</button>

          <details className="demo-accounts">
            <summary>Contas de demonstração</summary>
            <p>Não há login real ainda: qualquer senha funciona.</p>
            <ul>
              {ROLES.map((role) => (
                <li key={role}>
                  <button type="button" onClick={() => { setEmail(DEMO_USERS[role].email); setError('') }}>
                    {DEMO_USERS[role].email}
                  </button>
                  <span>{ROLE_INFO[role].label}</span>
                </li>
              ))}
            </ul>
          </details>
        </form>
      </div>
    </div>
  )
}
