import { remoteApi, SEASON_OPTIONS, selectSeason } from '../api/client'
import { useSeason } from '../api/useSeason'
import { useLocation, useNavigate } from 'react-router'

export default function SeasonSelector() {
  const season = useSeason()
  const navigate = useNavigate()
  const location = useLocation()
  if (!remoteApi) return null
  function change(value: string) {
    selectSeason(value)
    let path = location.pathname
    const competition = path.match(/^\/campeonatos\/ncaa-([mw])-\d{4}$/)
    if (competition) path = `/campeonatos/ncaa-${competition[1]}-${Number(value.slice(0, 4)) + 1}`
    if (path.startsWith('/atletas/')) path = '/atletas'
    navigate({ pathname: path, search: '' }, { replace: true })
  }
  return <label className="season-selector"><span>TEMPORADA</span><select aria-label="Temporada NCAA" value={season} onChange={(e) => change(e.target.value)}>{SEASON_OPTIONS.map((s) => <option key={s.season} value={s.season}>{s.season}{s.season === '2024/25' ? ' · Torneio histórico' : ' · Em andamento'}</option>)}</select></label>
}
