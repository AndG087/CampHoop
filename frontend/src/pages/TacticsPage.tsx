import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { deleteTacticalPlay, getTacticsWorkspace, saveTacticalPlay, saveTacticsDraft, TacticsError, type TacticsWorkspace } from '../api/tactics'
import { changeTactic, contentStamp, DRAWING_COLORS, makeTacticalBoard, redoTactic, TACTIC_KINDS, TACTIC_TEMPLATES, undoTactic, type DrawingColor, type TacticalPlay, type TacticDraft, type TacticHistory } from '../api/tacticsTypes'
import { newId } from '../api/mock/store'
import { useApi } from '../api/useApi'
import type { DemoUser } from '../auth/roles'
import { useSession } from '../auth/session'
import Modal from '../components/Modal'
import { Icon } from './HomeWidgets'
import { BoardScene, TacticsCourt, type TacticTool } from './TacticsCourt'
import './TacticsPage.css'

const TOOLS: { id: TacticTool; symbol: string; label: string; hint: string }[] = [
  { id: 'select', symbol: '↖', label: 'Mover', hint: 'Arraste atletas, defensores e bola. Pelo teclado, use Tab e as setas.' },
  { id: 'move', symbol: '↗', label: 'Corte', hint: 'Arraste do início ao fim para desenhar uma movimentação.' },
  { id: 'pass', symbol: '⇢', label: 'Passe', hint: 'Arraste para indicar a direção do passe com uma seta tracejada.' },
  { id: 'dribble', symbol: '〰', label: 'Drible', hint: 'Arraste para desenhar um deslocamento com a bola.' },
  { id: 'screen', symbol: '⊣', label: 'Bloqueio', hint: 'Arraste até o ponto onde o bloqueio deve acontecer.' },
  { id: 'freehand', symbol: '✎', label: 'Livre', hint: 'Desenhe livremente com o mouse ou o dedo.' },
  { id: 'ball', symbol: '●', label: 'Bola', hint: 'Toque na quadra para posicionar a bola.' },
  { id: 'erase', symbol: '⌫', label: 'Apagar', hint: 'Toque em um traço ou na bola para apagar. Você pode desfazer.' },
]
const fromPlay = (p: TacticalPlay): TacticDraft => ({ playId: p.id, baseRevision: p.revision, name: p.name, kind: p.kind, notes: p.notes, board: structuredClone(p.board) })

function TacticsEditor({ workspace, user }: { workspace: TacticsWorkspace; user: DemoUser }) {
  const [history, setHistory] = useState<TacticHistory>(() => ({ past: [], present: workspace.draft, future: [] }))
  const historyRef = useRef(history)
  const [cleanStamp, setCleanStamp] = useState(() => contentStamp(workspace.plays.find((p) => p.id === workspace.draft.playId) ?? workspace.initial))
  const [tool, setTool] = useState<TacticTool>('select')
  const [color, setColor] = useState<DrawingColor>('ink')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<{ action: () => void; label: string } | null>(null)
  const [deleting, setDeleting] = useState<TacticalPlay | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const draft = history.present
  const dirty = contentStamp(draft) !== cleanStamp
  const toolInfo = TOOLS.find((t) => t.id === tool)!
  const plays = workspace.plays.filter((p) => p.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const available = workspace.roster.filter((a) => !draft.board.players.some((p) => p.athleteId === a.id))

  function install(next: TacticHistory) { historyRef.current = next; setHistory(next) }
  function apply(next: TacticHistory) {
    if (next === historyRef.current) return
    try { saveTacticsDraft(user, workspace.team.id, next.present); install(next) }
    catch (e) { setFeedback({ error: true, text: e instanceof TacticsError ? e.message : 'Não foi possível preservar o rascunho.' }) }
  }
  function change(patch: Partial<TacticDraft>) { apply(changeTactic(historyRef.current, { ...historyRef.current.present, ...patch })) }
  function requestSwitch(action: () => void, label: string) {
    if (dirty) setPending({ action, label })
    else action()
  }
  function open(d: TacticDraft, clean: string) {
    try {
      saveTacticsDraft(user, workspace.team.id, d)
      install({ past: [], present: structuredClone(d), future: [] })
      setCleanStamp(clean); setFeedback(null); setTool('select')
    } catch (e) { setFeedback({ error: true, text: e instanceof Error ? e.message : 'Não foi possível abrir a jogada.' }) }
  }
  async function save(asCopy = false, source = historyRef.current.present) {
    setBusy(true); setFeedback(null)
    try {
      let name = source.name
      if (asCopy) {
        let suffix = 1
        const base = source.name.slice(0, 60)
        name = `${base} (cópia)`
        while (workspace.plays.some((p) => p.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) name = `${base} (cópia ${++suffix})`
      }
      const saved = await saveTacticalPlay(user, workspace.team.id, asCopy ? { ...source, playId: null, baseRevision: null, name } : source)
      const next = fromPlay(saved)
      install(asCopy ? { past: [], present: next, future: [] } : { ...historyRef.current, present: next })
      setCleanStamp(contentStamp(next))
      setFeedback({ error: false, text: `${saved.name} salva no caderno da equipe.` })
    } catch (e) { setFeedback({ error: true, text: e instanceof TacticsError ? e.message : 'Não foi possível salvar a jogada. Tente novamente.' }) }
    finally { setBusy(false) }
  }
  async function removePlay() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteTacticalPlay(user, workspace.team.id, deleting.id, deleting.revision)
      if (historyRef.current.present.playId === deleting.id) {
        const next = { ...historyRef.current.present, playId: null, baseRevision: null }
        apply({ past: [], present: next, future: [] })
        setCleanStamp(contentStamp(workspace.initial))
      }
      setDeleting(null)
      setFeedback({ error: false, text: 'Jogada removida do caderno.' })
    } catch (e) { setFeedback({ error: true, text: e instanceof Error ? e.message : 'Não foi possível excluir a jogada.' }); setDeleting(null) }
    finally { setBusy(false) }
  }
  function exportSvg() {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    const height = draft.board.court === 'half' ? 940 : 560
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', '1000'); clone.setAttribute('height', String(height))
    clone.removeAttribute('class'); clone.setAttribute('role', 'img')
    clone.setAttribute('aria-label', `${draft.name} · ${workspace.team.club.name} · ${workspace.team.name}`)
    clone.querySelectorAll('[tabindex]').forEach((node) => node.removeAttribute('tabindex'))
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    title.textContent = `${draft.name} · ${workspace.team.club.name} · ${workspace.team.name}`
    clone.prepend(title)
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${draft.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'jogada'}.svg`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setFeedback({ error: false, text: 'Quadra exportada em SVG.' })
  }
  function keyboard(e: KeyboardEvent<HTMLDivElement>) {
    if (busy || pending || deleting) return
    const target = e.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); apply(e.shiftKey ? redoTactic(historyRef.current) : undoTactic(historyRef.current)) }
  }

  return (
    <div className="tactics-page" onKeyDown={keyboard}>
      <header className="tactics-heading"><div><div className="eyebrow">PRANCHETA DO TÉCNICO · TEMPORADA 2025/26</div><h1>O próximo ponto<br />começa aqui<span>.</span></h1><p>Posicione. Desenhe. Prepare a próxima jogada.</p></div><div className="tactics-heading__actions"><span className="tactics-private"><span /> ACESSO DA COMISSÃO TÉCNICA</span><div><button type="button" className="btn btn--ghost" disabled={busy} onClick={() => requestSwitch(() => open(structuredClone(workspace.initial), contentStamp(workspace.initial)), 'começar uma nova jogada')}>+ Nova jogada</button><button type="button" className="btn btn--accent" disabled={busy} onClick={() => void save()}><Icon name="trophy" /> Salvar no caderno</button></div></div></header>
      <div className="tactics-context"><span><b>{workspace.team.club.name}</b> · {workspace.team.name}</span><Link to={`/times/${workspace.team.id}`}>Ver minha equipe ↗</Link><span className="tactics-draft-status">{draft.playId && !dirty ? '● Jogada salva no caderno' : '● Rascunho preservado neste navegador'}</span></div>
      {feedback && <div className={`tactics-feedback${feedback.error ? ' tactics-feedback--error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</div>}
      <div className="tactics-layout" inert={busy}>
        <section className="tactics-workbench" aria-label="Editor da jogada">
          <div className="tactics-board-heading"><div><span className="eyebrow">O PLANO GANHA FORMA</span><h2>{draft.name || 'Sua próxima jogada'}</h2></div><div className="tactics-court-switch" role="group" aria-label="Tipo de quadra"><button type="button" aria-pressed={draft.board.court === 'half'} onClick={() => change({ board: { ...draft.board, court: 'half' } })}>Meia quadra</button><button type="button" aria-pressed={draft.board.court === 'full'} onClick={() => change({ board: { ...draft.board, court: 'full' } })}>Quadra inteira</button></div></div>
          <div className="tactics-tools" role="group" aria-label="Ferramentas de desenho">{TOOLS.map((t) => <button key={t.id} type="button" aria-pressed={tool === t.id} onClick={() => setTool(t.id)} title={t.hint}><span aria-hidden="true">{t.symbol}</span>{t.label}</button>)}</div>
          <div className="tactics-options-bar"><div className="tactics-colors" role="group" aria-label="Cor do desenho">{Object.entries(DRAWING_COLORS).map(([key, value]) => <button key={key} type="button" style={{ background: value }} aria-label={key === 'ink' ? 'Azul-marinho' : key === 'orange' ? 'Laranja' : 'Vermelho'} aria-pressed={color === key} onClick={() => setColor(key as DrawingColor)} />)}</div><label><input type="checkbox" checked={draft.board.showDefenders} onChange={(e) => change({ board: { ...draft.board, showDefenders: e.target.checked } })} /> Mostrar defesa</label><div className="tactics-history"><button type="button" aria-label="Desfazer alteração" title="Desfazer · Ctrl+Z" disabled={!history.past.length} onClick={() => apply(undoTactic(historyRef.current))}>↶</button><button type="button" aria-label="Refazer alteração" title="Refazer · Ctrl+Shift+Z" disabled={!history.future.length} onClick={() => apply(redoTactic(historyRef.current))}>↷</button></div><button type="button" className="tactics-clear" disabled={!draft.board.drawings.length} onClick={() => change({ board: { ...draft.board, drawings: [] } })}>Limpar traços</button></div>
          <div className={`tactics-court-frame tactics-court-frame--${draft.board.court}`}><TacticsCourt board={draft.board} roster={workspace.roster} tool={tool} color={color} svgRef={svgRef} onChange={(board) => change({ board })} onToolChange={setTool} /></div>
          <div className="tactics-board-footer"><span><i /> {draft.board.players.length} atletas <i /> {draft.board.drawings.length} traços</span><button type="button" onClick={exportSvg}>Exportar SVG ↗</button></div>
          <div className="tactics-tool-hint" role="status"><b>{toolInfo.symbol} {toolInfo.label}</b><span>{toolInfo.hint}</span></div>
          <section className="tactics-details"><div className="tactics-section-heading"><h2>O que a equipe precisa saber</h2><span>ORIENTAÇÕES DA JOGADA</span></div><div className="tactics-details__fields"><label>Nome da jogada<input value={draft.name} maxLength={80} onChange={(e) => change({ name: e.target.value })} placeholder="Dê um nome à sua jogada" /></label><label>Momento do jogo<select value={draft.kind} onChange={(e) => change({ kind: e.target.value as TacticDraft['kind'] })}>{Object.entries(TACTIC_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label>Orientações<textarea value={draft.notes} maxLength={1200} onChange={(e) => change({ notes: e.target.value })} placeholder="Ex.: a armadora inicia no topo; a pivô sobe para o bloqueio e a ala corta pelo fundo." rows={4} /></label><span className="tactics-character-count">{draft.notes.length} / 1.200</span></section>
        </section>
        <aside className="tactics-sidebar">
          <section className="tactics-panel"><div className="tactics-section-heading"><h2>Sua equipe em quadra</h2><span>{draft.board.players.length}/5</span></div><p className="tactics-section-intro">Os marcadores usam os números do elenco.</p><div className="tactics-roster">{draft.board.players.map((p) => {
            const athlete = workspace.roster.find((a) => a.id === p.athleteId)!
            return <div key={p.id}><span className="tactics-jersey">{String(athlete.number).padStart(2, '0')}</span><label><span>{athlete.position}</span><select aria-label={`Atleta da posição de ${athlete.name}`} value={p.athleteId} onChange={(e) => change({ board: { ...draft.board, players: draft.board.players.map((a) => a.id === p.id ? { ...a, athleteId: e.target.value } : a) } })}>{workspace.roster.filter((a) => a.id === p.athleteId || !draft.board.players.some((m) => m.athleteId === a.id)).map((a) => <option key={a.id} value={a.id}>#{a.number} · {a.name}</option>)}</select></label><button type="button" aria-label={`Retirar ${athlete.name} da prancheta`} onClick={() => change({ board: { ...draft.board, players: draft.board.players.filter((a) => a.id !== p.id) } })}>×</button></div>
          })}</div><button type="button" className="tactics-add-player" disabled={draft.board.players.length >= 5 || !available.length} onClick={() => { const a = available.find((a) => a.status === 'ativo') ?? available[0]; if (a) change({ board: { ...draft.board, players: [...draft.board.players, { id: newId('posicao'), athleteId: a.id, x: 50, y: 70 }] } }) }}>+ Adicionar atleta à quadra</button><div className="tactics-legend"><span><i /> Minha equipe</span><span><i /> Defesa simulada</span></div>{draft.board.ball && <button type="button" className="tactics-remove-ball" onClick={() => change({ board: { ...draft.board, ball: null } })}>Retirar bola da quadra</button>}<p className="tactics-footnote">Esta formação pertence à prancheta. A escalação da partida é registrada na central ao vivo.</p></section>
          <section className="tactics-panel tactics-notebook"><div className="tactics-section-heading"><h2>Caderno de jogadas</h2><span>{workspace.plays.length.toString().padStart(2, '0')}</span></div><input className="tactics-search" type="search" aria-label="Buscar no caderno de jogadas" placeholder="Encontrar uma jogada…" value={query} onChange={(e) => setQuery(e.target.value)} /><ul>{plays.map((p) => <li key={p.id} className={draft.playId === p.id ? 'tactics-notebook__active' : ''}><button type="button" className="tactics-notebook__open" aria-pressed={draft.playId === p.id} onClick={() => requestSwitch(() => open(fromPlay(p), contentStamp(p)), `abrir ${p.name}`)}><svg viewBox={`0 0 1000 ${p.board.court === 'half' ? 940 : 560}`} aria-hidden="true"><BoardScene board={p.board} roster={workspace.roster} compact /></svg><span><b>{p.name}</b><small>{TACTIC_KINDS[p.kind]} · {p.board.court === 'half' ? 'Meia quadra' : 'Quadra inteira'}</small></span></button><div className="tactics-notebook__actions"><button type="button" disabled={busy} aria-label={`Duplicar ${p.name}`} onClick={() => requestSwitch(() => void save(true, fromPlay(p)), `duplicar ${p.name}`)}>Duplicar</button><button type="button" disabled={busy} aria-label={`Excluir ${p.name} do caderno`} onClick={() => setDeleting(p)}>Excluir</button></div></li>)}</ul>{!plays.length && <div className="tactics-notebook__empty"><Icon name="ball" /><b>{query ? 'Nenhuma jogada encontrada.' : 'Seu repertório começa aqui.'}</b><p>{query ? 'Experimente outro nome.' : 'Desenhe uma ideia e salve no caderno para usar no próximo treino.'}</p></div>}{draft.playId && <button type="button" className="tactics-save-copy" disabled={busy} onClick={() => void save(true)}>Salvar edição como cópia ↗</button>}</section>
          <section className="tactics-models"><div className="eyebrow">UM PONTO DE PARTIDA</div><h2>Ideias para sair do papel.</h2>{TACTIC_TEMPLATES.map((t, i) => <button type="button" key={t.id} onClick={() => change({ name: t.name, kind: t.kind, board: makeTacticalBoard(workspace.roster, t.id) })}><span>{String(i + 1).padStart(2, '0')}</span><span><b>{t.name}</b><small>{t.description}</small></span><span aria-hidden="true">↗</span></button>)}<p>Os modelos são exemplos editáveis. Adapte à sua equipe.</p></section>
        </aside>
      </div>
      {pending && <Modal title="Há alterações no rascunho" onClose={() => setPending(null)}><p className="tactics-dialog-text">Você quer substituir a edição atual e {pending.label}? Para guardá-la no caderno, continue editando e salve primeiro.</p><div className="form__actions"><button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>Continuar editando</button><button type="button" className="btn btn--accent" onClick={() => { const action = pending.action; setPending(null); action() }}>Substituir rascunho</button></div></Modal>}
      {deleting && <Modal title="Excluir do caderno" onClose={() => setDeleting(null)}><p className="tactics-dialog-text">Excluir a jogada “{deleting.name}” do caderno da equipe?</p><div className="form__actions"><button type="button" className="btn btn--ghost" onClick={() => setDeleting(null)}>Cancelar</button><button type="button" className="btn btn--danger" disabled={busy} onClick={() => void removePlay()}>Excluir jogada</button></div></Modal>}
    </div>
  )
}

export default function TacticsPage() {
  const { user } = useSession()
  const [retry, setRetry] = useState(0)
  const teamId = user?.teamId ?? ''
  const { data, loading, error } = useApi(() => getTacticsWorkspace(user, teamId), `tactics:${user?.id}:${teamId}:${retry}`)
  if (!user) return null
  if (error) return <div className="card" role="alert"><p>{error instanceof TacticsError ? error.message : 'Não foi possível abrir a prancheta.'}</p><button type="button" className="btn btn--ghost" onClick={() => setRetry((n) => n + 1)}>Tentar novamente</button></div>
  if (!data && loading) return <p className="muted" role="status">Preparando a prancheta da sua equipe…</p>
  if (!data) return null
  return <TacticsEditor key={`${user.id}:${teamId}`} workspace={data} user={user} />
}
