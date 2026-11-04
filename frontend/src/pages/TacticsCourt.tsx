import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { clampPoint, DRAWING_COLORS, type CourtPoint, type DrawingColor, type DrawingKind, type TacticalBoard, type TacticDrawing } from '../api/tacticsTypes'
import type { AthleteSummary } from '../api/types'
import { newId } from '../api/mock/store'

export type TacticTool = 'select' | DrawingKind | 'ball' | 'erase'
type TokenType = 'player' | 'defender' | 'ball'
type Gesture = { type: 'token'; tokenType: TokenType; id: string; start: CourtPoint; origin: CourtPoint; current: CourtPoint } | { type: 'draw'; points: CourtPoint[]; kind: DrawingKind; color: DrawingColor }
const distance = (a: CourtPoint, b: CourtPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const sizeOf = (board: TacticalBoard) => ({ width: 1000, height: board.court === 'half' ? 940 : 560 })

export function CourtArtwork({ full }: { full: boolean }) {
  const h = full ? 560 : 940
  return <>
    <rect width="1000" height={h} fill="#e4c59b" />
    {Array.from({ length: Math.ceil(h / 32) }, (_, i) => <g key={i}><rect x="0" y={i * 32} width="1000" height="32" fill={i % 2 ? '#edd3af' : '#e7cba4'} /><path d={`M0 ${i * 32}h1000M${i % 2 ? 175 : 425} ${i * 32}v32M${i % 2 ? 675 : 925} ${i * 32}v32`} stroke="#bc956234" strokeWidth="1" /></g>)}
    <g fill="none" stroke="#fff9ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {full ? <>
        <rect x="28" y="25" width="944" height="510" rx="2" /><path d="M500 25v510" /><circle cx="500" cy="280" r="87" />
        <path d="M28 185h170v190H28M972 185H802v190h170" fill="#c5a1713b" /><circle cx="198" cy="280" r="95" /><circle cx="802" cy="280" r="95" />
        <path d="M28 55h50a225 225 0 0 1 0 450H28M972 55h-50a225 225 0 0 0 0 450h50" />
        <path d="M62 245v70M938 245v70" stroke="#31495a" strokeWidth="5" /><circle cx="76" cy="280" r="13" stroke="#bd7433" /><circle cx="924" cy="280" r="13" stroke="#bd7433" />
      </> : <>
        <rect x="30" y="35" width="940" height="875" rx="2" /><path d="M350 35v345h300V35" fill="#c5a1713b" /><circle cx="500" cy="380" r="150" />
        <path d="M76 35v128a424 424 0 0 0 848 0V35M360 910a140 140 0 0 1 280 0" />
        <path d="M450 79h100" stroke="#31495a" strokeWidth="6" /><circle cx="500" cy="99" r="17" stroke="#bd7433" /><path d="M432 99a68 68 0 0 0 136 0" strokeWidth="3" />
      </>}
    </g>
    <text x="500" y={full ? 295 : 710} textAnchor="middle" fill="#9b72431f" fontFamily="Arial, sans-serif" fontSize={full ? 48 : 68} fontWeight="800" letterSpacing="-3">CH</text>
    {!full && <text x="500" y="865" textAnchor="middle" fill="#8e704c" fontFamily="monospace" fontSize="12" letterSpacing="4">CAMPHOOP · COACH'S BOARD</text>}
  </>
}

function Drawing({ stroke, width, height, markerId, onErase }: { stroke: TacticDrawing; width: number; height: number; markerId: string; onErase?: (id: string) => void }) {
  const pts = stroke.points.map((p) => ({ x: p.x * width / 100, y: p.y * height / 100 }))
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (!first || !last) return null
  let path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
  if (stroke.kind === 'dribble') {
    const length = Math.hypot(last.x - first.x, last.y - first.y)
    const steps = Math.max(4, Math.ceil(length / 20))
    const nx = length ? -(last.y - first.y) / length : 0
    const ny = length ? (last.x - first.x) / length : 0
    path = Array.from({ length: steps + 1 }, (_, i) => {
      const shift = i === 0 || i === steps ? 0 : i % 2 ? 5 : -5
      return `${i ? 'L' : 'M'}${first.x + (last.x - first.x) * i / steps + nx * shift} ${first.y + (last.y - first.y) * i / steps + ny * shift}`
    }).join(' ')
  }
  const angle = Math.atan2(last.y - first.y, last.x - first.x) + Math.PI / 2
  return <g>
    <path d={path} fill="none" stroke={DRAWING_COLORS[stroke.color]} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={stroke.kind === 'pass' ? '14 11' : undefined} markerEnd={['move', 'pass', 'dribble'].includes(stroke.kind) ? `url(#${markerId}-${stroke.color})` : undefined} />
    {stroke.kind === 'screen' && <path d={`M${last.x - Math.cos(angle) * 17} ${last.y - Math.sin(angle) * 17}L${last.x + Math.cos(angle) * 17} ${last.y + Math.sin(angle) * 17}`} stroke={DRAWING_COLORS[stroke.color]} strokeWidth="6" strokeLinecap="round" />}
    {onErase && <path d={path} fill="none" stroke="transparent" strokeWidth="55" style={{ cursor: 'crosshair' }} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onErase(stroke.id) }} />}
  </g>
}

export function BoardScene({ board, roster, onTokenDown, onTokenKey, onErase, compact = false }: {
  board: TacticalBoard; roster: Pick<AthleteSummary, 'id' | 'name' | 'number'>[]; compact?: boolean
  onTokenDown?: (e: PointerEvent<SVGGElement>, type: TokenType, id: string, point: CourtPoint) => void
  onTokenKey?: (e: KeyboardEvent<SVGGElement>, type: TokenType, id: string, point: CourtPoint) => void
  onErase?: (id: string) => void
}) {
  const markerId = useId().replace(/:/g, '')
  const { width, height } = sizeOf(board)
  return <>
    <CourtArtwork full={board.court === 'full'} />
    <defs>{Object.entries(DRAWING_COLORS).map(([key, color]) => <marker key={key} id={`${markerId}-${key}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1L11 6L1 11" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></marker>)}</defs>
    {board.drawings.map((stroke) => <Drawing key={stroke.id} stroke={stroke} width={width} height={height} markerId={markerId} onErase={onErase} />)}
    {board.showDefenders && board.defenders.map((p, i) => <g key={p.id} className="tactics-token" transform={`translate(${p.x * width / 100} ${p.y * height / 100})`} role={onTokenDown ? 'button' : undefined} tabIndex={onTokenDown ? 0 : undefined} aria-label={onTokenDown ? `Defensor ${i + 1}. Arraste ou use as setas do teclado.` : undefined} onPointerDown={onTokenDown ? (e) => onTokenDown(e, 'defender', p.id, p) : undefined} onKeyDown={onTokenKey ? (e) => onTokenKey(e, 'defender', p.id, p) : undefined}>
      <circle r="44" fill="transparent" /><circle r="26" fill="#fffdf4" stroke="#31495a" strokeWidth="3" /><text y="7" textAnchor="middle" fill="#31495a" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="700">{i + 1}</text>
    </g>)}
    {board.players.map((p) => {
      const athlete = roster.find((a) => a.id === p.athleteId)
      return <g key={p.id} className="tactics-token" transform={`translate(${p.x * width / 100} ${p.y * height / 100})`} role={onTokenDown ? 'button' : undefined} tabIndex={onTokenDown ? 0 : undefined} aria-label={onTokenDown ? `${athlete?.name ?? 'Atleta'}, camisa ${athlete?.number ?? ''}. Arraste ou use as setas do teclado.` : undefined} onPointerDown={onTokenDown ? (e) => onTokenDown(e, 'player', p.id, p) : undefined} onKeyDown={onTokenKey ? (e) => onTokenKey(e, 'player', p.id, p) : undefined}>
        <circle r="44" fill="transparent" /><circle cy="3" r="28" fill="#76523520" /><circle r="27" fill="#e88a32" stroke="#fff9ec" strokeWidth="4" /><text y="7" textAnchor="middle" fill="#172638" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="800">{athlete?.number ?? '—'}</text>
        {!compact && <text y="49" textAnchor="middle" fill="#4f402e" fontFamily="Arial, sans-serif" fontSize="17" fontWeight="600" pointerEvents="none">{athlete?.name.split(' ')[0] ?? 'Atleta'}</text>}
      </g>
    })}
    {board.ball && <g className="tactics-token tactics-ball" transform={`translate(${board.ball.x * width / 100} ${board.ball.y * height / 100})`} role={onTokenDown ? 'button' : undefined} tabIndex={onTokenDown ? 0 : undefined} aria-label={onTokenDown ? 'Bola. Arraste ou use as setas do teclado.' : undefined} onPointerDown={onTokenDown ? (e) => onTokenDown(e, 'ball', 'ball', board.ball!) : undefined} onKeyDown={onTokenKey ? (e) => onTokenKey(e, 'ball', 'ball', board.ball!) : undefined}>
      <circle r="34" fill="transparent" /><circle r="13" fill="#7b4320" stroke="#fff5dc" strokeWidth="2" /><path d="M-12 0h24M0-12v24M-9-9c12 4 6 10 18 18" fill="none" stroke="#eac28b" strokeWidth="1.5" />
    </g>}
  </>
}

function moveToken(board: TacticalBoard, type: TokenType, id: string, point: CourtPoint): TacticalBoard {
  const p = clampPoint(point, 3)
  return type === 'ball' ? { ...board, ball: p } : type === 'player' ? { ...board, players: board.players.map((a) => a.id === id ? { ...a, ...p } : a) } : { ...board, defenders: board.defenders.map((a) => a.id === id ? { ...a, ...p } : a) }
}

export function TacticsCourt({ board, roster, tool, color, svgRef, onChange, onToolChange }: {
  board: TacticalBoard; roster: AthleteSummary[]; tool: TacticTool; color: DrawingColor
  svgRef: RefObject<SVGSVGElement | null>; onChange: (board: TacticalBoard) => void; onToolChange: (tool: TacticTool) => void
}) {
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const { width, height } = sizeOf(board)
  function updateGesture(g: Gesture | null) { gestureRef.current = g; setGesture(g) }
  useEffect(() => { gestureRef.current = null; setGesture(null) }, [tool, board.court])

  function pointOf(e: PointerEvent): CourtPoint | null {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    return { x: p.x / width * 100, y: p.y / height * 100 }
  }
  function tokenDown(e: PointerEvent<SVGGElement>, type: TokenType, id: string, origin: CourtPoint) {
    if (tool === 'erase' && type === 'ball') { e.stopPropagation(); onChange({ ...board, ball: null }); return }
    if (tool !== 'select') return
    const point = pointOf(e)
    if (!point || e.button !== 0) return
    e.currentTarget.focus()
    e.stopPropagation(); e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    updateGesture({ type: 'token', tokenType: type, id, start: point, origin, current: origin })
  }
  function tokenKey(e: KeyboardEvent<SVGGElement>, type: TokenType, id: string, point: CourtPoint) {
    const step = e.shiftKey ? 5 : 1
    const delta: Record<string, CourtPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }
    if (delta[e.key] && tool === 'select') { e.preventDefault(); onChange(moveToken(board, type, id, { x: point.x + delta[e.key].x, y: point.y + delta[e.key].y })) }
  }
  function pointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || tool === 'select' || tool === 'erase') return
    const point = pointOf(e)
    if (!point || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return
    e.preventDefault()
    if (tool === 'ball') { onChange({ ...board, ball: clampPoint(point, 3) }); onToolChange('select'); return }
    svgRef.current?.setPointerCapture(e.pointerId)
    updateGesture({ type: 'draw', kind: tool, color, points: [clampPoint(point)] })
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    const current = gestureRef.current
    const p = pointOf(e)
    if (!current || !p) return
    if (current.type === 'token') updateGesture({ ...current, current: clampPoint({ x: current.origin.x + p.x - current.start.x, y: current.origin.y + p.y - current.start.y }, 3) })
    else {
      const point = clampPoint(p)
      if (current.kind === 'freehand') {
        if (distance(current.points[current.points.length - 1], point) < .35) return
        updateGesture({ ...current, points: [...current.points.slice(0, 399), point] })
      } else updateGesture({ ...current, points: [current.points[0], point] })
    }
  }
  function pointerUp(e: PointerEvent<SVGSVGElement>) {
    const current = gestureRef.current
    if (!current) return
    const ending = pointOf(e)
    updateGesture(null)
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (current.type === 'token') {
      const position = ending ? clampPoint({ x: current.origin.x + ending.x - current.start.x, y: current.origin.y + ending.y - current.start.y }, 3) : current.current
      if (distance(current.origin, position) > .1) onChange(moveToken(board, current.tokenType, current.id, position))
    } else {
      const points = current.kind === 'freehand' ? ending && distance(current.points[current.points.length - 1], ending) > .1 ? [...current.points.slice(0, 399), clampPoint(ending)] : current.points : [current.points[0], clampPoint(ending ?? current.points[current.points.length - 1])]
      if (points.length < 2 || points.every((p) => distance(p, points[0]) < .8)) return
      onChange({ ...board, drawings: [...board.drawings, { id: newId('traco'), kind: current.kind, color: current.color, points }] })
    }
  }
  const preview = gesture?.type === 'token' ? moveToken(board, gesture.tokenType, gesture.id, gesture.current) : gesture?.type === 'draw' && gesture.points.length > 1 ? { ...board, drawings: [...board.drawings, { id: 'preview', kind: gesture.kind, color: gesture.color, points: gesture.points }] } : board
  return <svg ref={svgRef} className={`tactics-court tactics-court--${tool}`} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Quadra interativa. Arraste os atletas ou use as setas do teclado. Para desenhar, selecione uma ferramenta e arraste pela quadra." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => updateGesture(null)} onLostPointerCapture={() => updateGesture(null)} onKeyDown={(e) => { if (e.key === 'Escape') { updateGesture(null); onToolChange('select') } }}>
    <BoardScene board={preview} roster={roster} onTokenDown={tool === 'select' || tool === 'erase' ? tokenDown : undefined} onTokenKey={tool === 'select' ? tokenKey : undefined} onErase={tool === 'erase' ? (id) => onChange({ ...board, drawings: board.drawings.filter((s) => s.id !== id) }) : undefined} />
  </svg>
}
