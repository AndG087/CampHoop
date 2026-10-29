import './PlaceholderPage.css'

const ISSUES_URL = 'https://github.com/AndG087/CampHoop/issues'

type Props = {
  title: string
  subtitle: string
  /** Etapa do plano em que a página será construída. */
  stage: number
  /** Número da issue no GitHub que acompanha a página. */
  issue: number
}

/** Página reservada: a rota e o menu já existem, o conteúdo chega na etapa indicada. */
export default function PlaceholderPage({ title, subtitle, stage, issue }: Props) {
  return (
    <>
      <div className="page-head">
        <div className="eyebrow">CENTRAL DE OPERAÇÕES · 2025/26</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="card placeholder">
        <span className="pill">EM CONSTRUÇÃO · ETAPA {stage}</span>
        <p>Esta página ainda não tem conteúdo. Ela será construída na etapa {stage} do plano.</p>
        <a className="placeholder__link" href={`${ISSUES_URL}/${issue}`} target="_blank" rel="noreferrer">
          Acompanhar na issue #{issue} →
        </a>
      </div>
    </>
  )
}
