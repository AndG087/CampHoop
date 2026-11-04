import { remoteApi, DATA_SEASON, SEASON_OPTIONS } from '../api/client'

export default function DataSource() {
  if (!remoteApi) return null
  const info = SEASON_OPTIONS.find((s) => s.season === DATA_SEASON)
  if (!info) return null
  if (info?.origin === 'local') return <p className="data-source">Temporada {DATA_SEASON} · Dados cadastrados no CampHoop: {info.counts.teams} equipes, {info.counts.athletes} atletas e {info.counts.games} jogos. Os dados das outras temporadas são preservados. Horários de Brasília.</p>
  return <p className="data-source">NCAA {DATA_SEASON} · {DATA_SEASON === '2024/25' ? 'Torneios nacionais históricos, masculino e feminino.' : 'Calendário e box scores publicados, masculino e feminino. Cobertura parcial; inclui adversários de outras divisões.'} {info && <span>{info.counts.completed ?? info.counts.games} jogos encerrados · {info.counts.scheduled ?? 0} agendados{info.importedAt && <> · Importado em {new Date(info.importedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</>}. </span>}Dados importados: <a href="https://github.com/sportsdataverse/sportsdataverse-data" target="_blank" rel="noreferrer">SportsDataverse / ESPN</a>. Recorte e cálculos adaptados pelo CampHoop. Créditos CC BY 4.0: <a href="https://github.com/sportsdataverse/hoopR-mbb-data/blob/main/LICENSE.md" target="_blank" rel="noreferrer">hoopR</a> e <a href="https://github.com/sportsdataverse/wehoop-wbb-data/blob/main/LICENSE.md" target="_blank" rel="noreferrer">wehoop</a>. {Boolean(info?.localCounts?.teams) && <>Há também {info!.localCounts!.teams} equipes próprias nesta temporada. </>}Horários de Brasília. Dados importados em lote; não é transmissão ao vivo da NCAA. Sem vínculo oficial com a NCAA.</p>
}
