-- =====================================================================
--  Modelo relacional – Plataforma de campeonatos (basquete)
--  SGBD alvo: PostgreSQL 14+
-- =====================================================================

-- ---------- Tipos enumerados ----------
CREATE TYPE naipe_t          AS ENUM ('MASCULINO', 'FEMININO', 'MISTO');
CREATE TYPE posicao_t        AS ENUM ('ARMADOR', 'ALA_ARMADOR', 'ALA', 'ALA_PIVO', 'PIVO');
CREATE TYPE mao_t            AS ENUM ('DESTRO', 'CANHOTO', 'AMBIDESTRO');
CREATE TYPE status_camp_t    AS ENUM ('RASCUNHO', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO');
CREATE TYPE tipo_fase_t      AS ENUM ('PONTOS_CORRIDOS', 'GRUPOS', 'MATA_MATA');
CREATE TYPE status_partida_t AS ENUM ('AGENDADA', 'EM_ANDAMENTO', 'INTERVALO', 'FINALIZADA', 'ADIADA', 'CANCELADA', 'WO');
CREATE TYPE funcao_oficial_t AS ENUM ('ARBITRO_PRINCIPAL', 'ARBITRO_AUXILIAR', 'APONTADOR', 'CRONOMETRISTA',
                                      'OPERADOR_24S', 'REPRESENTANTE');
CREATE TYPE funcao_comissao_t AS ENUM ('TECNICO', 'ASSISTENTE', 'PREPARADOR_FISICO', 'FISIOTERAPEUTA', 'MEDICO');
CREATE TYPE tipo_evento_t    AS ENUM ('CESTA_2', 'CESTA_3', 'LANCE_LIVRE_CONVERTIDO', 'ARREMESSO_ERRADO_2',
                                      'ARREMESSO_ERRADO_3', 'LANCE_LIVRE_ERRADO', 'REBOTE_OFENSIVO',
                                      'REBOTE_DEFENSIVO', 'ASSISTENCIA', 'ROUBO', 'TOCO', 'ERRO',
                                      'FALTA_PESSOAL', 'FALTA_TECNICA', 'FALTA_ANTIDESPORTIVA',
                                      'FALTA_DESQUALIFICANTE', 'SUBSTITUICAO', 'PEDIDO_TEMPO',
                                      'INICIO_PERIODO', 'FIM_PERIODO');

-- =====================================================================
--  1. USUÁRIOS E PAPÉIS (especialização 1:1 – PK = FK para usuario)
-- =====================================================================
CREATE TABLE usuario (
    id               BIGSERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL UNIQUE,
    senha_hash       VARCHAR(255) NOT NULL,              -- nunca a senha em texto puro
    nome_completo    VARCHAR(150) NOT NULL,
    cpf              CHAR(11)     UNIQUE,                -- opcional p/ usuário comum; obrigatório p/ papéis (ver trigger)
    data_nascimento  DATE         NOT NULL,
    telefone         VARCHAR(20),
    foto_url         TEXT,
    email_verificado BOOLEAN      NOT NULL DEFAULT FALSE,
    ativo            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Garante que só quem vira atleta/técnico/mesário/árbitro/organizador precise ter CPF
CREATE OR REPLACE FUNCTION fn_exige_cpf() RETURNS trigger AS $$
BEGIN
    IF (SELECT cpf FROM usuario WHERE id = NEW.usuario_id) IS NULL THEN
        RAISE EXCEPTION 'Usuário % precisa informar CPF para assumir o papel %', NEW.usuario_id, TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE atleta (
    usuario_id         BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    registro_esportivo VARCHAR(30) UNIQUE,               -- antigo "CPF Esportivo" (registro na federação)
    apelido            VARCHAR(50),
    posicao_principal  posicao_t,
    mao_dominante      mao_t
);

-- Medidas mudam com o tempo → histórico em vez de colunas fixas no atleta
CREATE TABLE avaliacao_fisica (
    id              BIGSERIAL PRIMARY KEY,
    atleta_id       BIGINT  NOT NULL REFERENCES atleta(usuario_id) ON DELETE CASCADE,
    data_avaliacao  DATE    NOT NULL DEFAULT CURRENT_DATE,
    altura_cm       SMALLINT     CHECK (altura_cm BETWEEN 100 AND 260),
    peso_kg         NUMERIC(5,2) CHECK (peso_kg > 0),
    envergadura_cm  SMALLINT     CHECK (envergadura_cm BETWEEN 100 AND 280),
    impulsao_cm     SMALLINT     CHECK (impulsao_cm BETWEEN 0 AND 150),
    observacao      TEXT,
    UNIQUE (atleta_id, data_avaliacao)
);

CREATE TABLE tecnico (
    usuario_id    BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    registro_cref VARCHAR(30) UNIQUE,
    licenca       VARCHAR(50)                             -- nível de licença/curso da federação
);

CREATE TABLE mesario (
    usuario_id    BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    certificacao  VARCHAR(50),
    federacao     VARCHAR(100)
);

CREATE TABLE arbitro (
    usuario_id    BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    categoria     VARCHAR(50),                            -- ex.: estadual, nacional, FIBA
    federacao     VARCHAR(100)
);

CREATE TABLE organizador (
    usuario_id    BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    entidade      VARCHAR(150),                           -- liga/federação/empresa que representa
    cnpj_entidade CHAR(14)
);

CREATE TRIGGER trg_cpf_atleta      BEFORE INSERT ON atleta      FOR EACH ROW EXECUTE FUNCTION fn_exige_cpf();
CREATE TRIGGER trg_cpf_tecnico     BEFORE INSERT ON tecnico     FOR EACH ROW EXECUTE FUNCTION fn_exige_cpf();
CREATE TRIGGER trg_cpf_mesario     BEFORE INSERT ON mesario     FOR EACH ROW EXECUTE FUNCTION fn_exige_cpf();
CREATE TRIGGER trg_cpf_arbitro     BEFORE INSERT ON arbitro     FOR EACH ROW EXECUTE FUNCTION fn_exige_cpf();
CREATE TRIGGER trg_cpf_organizador BEFORE INSERT ON organizador FOR EACH ROW EXECUTE FUNCTION fn_exige_cpf();

-- =====================================================================
--  2. CLUBES, EQUIPES E VÍNCULOS
-- =====================================================================
CREATE TABLE clube (
    id             BIGSERIAL PRIMARY KEY,
    nome           VARCHAR(150) NOT NULL,
    sigla          VARCHAR(10),
    cnpj           CHAR(14) UNIQUE,
    cidade         VARCHAR(100),
    uf             CHAR(2),
    escudo_url     TEXT,
    data_fundacao  DATE,
    responsavel_id BIGINT REFERENCES usuario(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "time" é palavra-chave no PostgreSQL (tipo TIME) → renomeado para "equipe"
CREATE TABLE equipe (
    id         BIGSERIAL PRIMARY KEY,
    clube_id   BIGINT       NOT NULL REFERENCES clube(id),
    nome       VARCHAR(100) NOT NULL,                     -- ex.: "Sub-17 Masculino"
    categoria  VARCHAR(30)  NOT NULL,                     -- SUB_13, SUB_15, SUB_17, ADULTO, MASTER...
    naipe      naipe_t      NOT NULL,
    temporada  SMALLINT     NOT NULL,                     -- ex.: 2026
    UNIQUE (clube_id, categoria, naipe, temporada, nome)
);

-- Atleta ↔ Equipe (N:N com histórico)
CREATE TABLE elenco (
    id            BIGSERIAL PRIMARY KEY,
    equipe_id     BIGINT   NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
    atleta_id     BIGINT   NOT NULL REFERENCES atleta(usuario_id),
    numero_camisa SMALLINT CHECK (numero_camisa BETWEEN 0 AND 99),
    capitao       BOOLEAN  NOT NULL DEFAULT FALSE,
    data_inicio   DATE     NOT NULL DEFAULT CURRENT_DATE,
    data_fim      DATE,
    CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);
-- um número de camisa por equipe entre os vínculos ativos
CREATE UNIQUE INDEX ux_elenco_camisa_ativa ON elenco (equipe_id, numero_camisa) WHERE data_fim IS NULL;

-- Técnico ↔ Equipe (N:N com função e histórico)
CREATE TABLE comissao_tecnica (
    id          BIGSERIAL PRIMARY KEY,
    equipe_id   BIGINT NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
    usuario_id  BIGINT NOT NULL REFERENCES usuario(id),   -- técnico ou outro profissional
    funcao      funcao_comissao_t NOT NULL,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim    DATE
);

-- =====================================================================
--  3. CAMPEONATOS
-- =====================================================================
CREATE TABLE local_jogo (
    id         BIGSERIAL PRIMARY KEY,
    nome       VARCHAR(150) NOT NULL,                     -- ginásio/quadra
    endereco   VARCHAR(255),
    cidade     VARCHAR(100),
    uf         CHAR(2),
    capacidade INTEGER,
    latitude   NUMERIC(9,6),
    longitude  NUMERIC(9,6)
);

CREATE TABLE campeonato (
    id               BIGSERIAL PRIMARY KEY,
    organizador_id   BIGINT       NOT NULL REFERENCES organizador(usuario_id),
    nome             VARCHAR(150) NOT NULL,
    temporada        SMALLINT     NOT NULL,
    categoria        VARCHAR(30)  NOT NULL,
    naipe            naipe_t      NOT NULL,
    data_inicio      DATE,
    data_fim         DATE,
    status           status_camp_t NOT NULL DEFAULT 'RASCUNHO',
    regulamento_url  TEXT,
    pontos_vitoria   SMALLINT NOT NULL DEFAULT 2,         -- padrão FIBA: 2 vitória / 1 derrota
    pontos_derrota   SMALLINT NOT NULL DEFAULT 1,
    pontos_wo        SMALLINT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fase (
    id            BIGSERIAL PRIMARY KEY,
    campeonato_id BIGINT       NOT NULL REFERENCES campeonato(id) ON DELETE CASCADE,
    nome          VARCHAR(80)  NOT NULL,                  -- "Fase de Grupos", "Semifinal"...
    ordem         SMALLINT     NOT NULL,                  -- 1, 2, 3... sequência cronológica
    tipo          tipo_fase_t  NOT NULL,                  -- como os jogos da fase são disputados
    ida_e_volta   BOOLEAN      NOT NULL DEFAULT FALSE,
    classificados SMALLINT,                               -- quantos avançam (por grupo, se tipo = GRUPOS)
    UNIQUE (campeonato_id, ordem)
);

-- Inscrição da equipe no campeonato
CREATE TABLE campeonato_equipe (
    campeonato_id  BIGINT NOT NULL REFERENCES campeonato(id) ON DELETE CASCADE,
    equipe_id      BIGINT NOT NULL REFERENCES equipe(id),
    grupo          VARCHAR(10),                           -- "A", "B"...
    data_inscricao TIMESTAMPTZ NOT NULL DEFAULT now(),
    aprovada       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (campeonato_id, equipe_id)
);

-- =====================================================================
--  4. PARTIDAS E SÚMULA
-- =====================================================================
CREATE TABLE partida (
    id                 BIGSERIAL PRIMARY KEY,
    campeonato_id      BIGINT NOT NULL REFERENCES campeonato(id),
    fase_id            BIGINT REFERENCES fase(id),
    equipe_mandante_id BIGINT NOT NULL REFERENCES equipe(id),
    equipe_visitante_id BIGINT NOT NULL REFERENCES equipe(id),
    local_id           BIGINT REFERENCES local_jogo(id),
    data_hora          TIMESTAMPTZ,
    rodada             SMALLINT,
    status             status_partida_t NOT NULL DEFAULT 'AGENDADA',
    placar_mandante    SMALLINT,                          -- gravado ao finalizar; ao vivo fica no back/Redis
    placar_visitante   SMALLINT,
    observacoes        TEXT,
    CHECK (equipe_mandante_id <> equipe_visitante_id)
);

-- Árbitros e mesários escalados (substitui o vínculo solto com "Mesário")
CREATE TABLE partida_oficial (
    partida_id BIGINT NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id),
    funcao     funcao_oficial_t NOT NULL,
    PRIMARY KEY (partida_id, funcao, usuario_id)
);

-- Atletas relacionados para o jogo (até 12 no basquete)
CREATE TABLE partida_atleta (
    partida_id    BIGINT  NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    atleta_id     BIGINT  NOT NULL REFERENCES atleta(usuario_id),
    equipe_id     BIGINT  NOT NULL REFERENCES equipe(id),
    numero_camisa SMALLINT NOT NULL,
    titular       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (partida_id, atleta_id),
    UNIQUE (partida_id, equipe_id, numero_camisa)
);

-- Lance a lance: base para placar, súmula e estatísticas
CREATE TABLE evento_partida (
    id                    BIGSERIAL PRIMARY KEY,
    partida_id            BIGINT   NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    periodo               SMALLINT NOT NULL CHECK (periodo >= 1),
    segundos_restantes    SMALLINT NOT NULL CHECK (segundos_restantes >= 0),
    tipo                  tipo_evento_t NOT NULL,
    equipe_id             BIGINT REFERENCES equipe(id),
    atleta_id             BIGINT REFERENCES atleta(usuario_id),
    atleta_secundario_id  BIGINT REFERENCES atleta(usuario_id), -- quem entrou na substituição, quem sofreu falta...
    pontos                SMALLINT NOT NULL DEFAULT 0 CHECK (pontos BETWEEN 0 AND 3),
    registrado_por        BIGINT REFERENCES usuario(id),        -- mesário que lançou
    anulado               BOOLEAN NOT NULL DEFAULT FALSE,       -- corrige erro sem apagar histórico
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_evento_partida ON evento_partida (partida_id, periodo, segundos_restantes DESC);

-- =====================================================================
--  5. VIEW DE ESTATÍSTICAS (calculada, sem duplicar dados)
-- =====================================================================
CREATE VIEW vw_estatistica_atleta_partida AS
SELECT
    e.partida_id,
    e.atleta_id,
    SUM(e.pontos)                                                        AS pontos,
    COUNT(*) FILTER (WHERE e.tipo IN ('REBOTE_OFENSIVO','REBOTE_DEFENSIVO')) AS rebotes,
    COUNT(*) FILTER (WHERE e.tipo = 'ASSISTENCIA')                       AS assistencias,
    COUNT(*) FILTER (WHERE e.tipo = 'ROUBO')                             AS roubos,
    COUNT(*) FILTER (WHERE e.tipo = 'TOCO')                              AS tocos,
    COUNT(*) FILTER (WHERE e.tipo = 'ERRO')                              AS erros,
    COUNT(*) FILTER (WHERE e.tipo::text LIKE 'FALTA_%')                  AS faltas,
    COUNT(*) FILTER (WHERE e.tipo = 'CESTA_3')                           AS cestas_3
FROM evento_partida e
WHERE e.anulado = FALSE AND e.atleta_id IS NOT NULL
GROUP BY e.partida_id, e.atleta_id;

-- Agregado por atleta e temporada (perfil do atleta). Atualizar ao finalizar cada partida:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mvw_estatistica_atleta_temporada;
CREATE MATERIALIZED VIEW mvw_estatistica_atleta_temporada AS
SELECT
    s.atleta_id,
    c.temporada,
    COUNT(DISTINCT s.partida_id)                     AS jogos,
    SUM(s.pontos)                                    AS pontos,
    ROUND(SUM(s.pontos)::numeric      / COUNT(DISTINCT s.partida_id), 1) AS media_pontos,
    ROUND(SUM(s.rebotes)::numeric     / COUNT(DISTINCT s.partida_id), 1) AS media_rebotes,
    ROUND(SUM(s.assistencias)::numeric/ COUNT(DISTINCT s.partida_id), 1) AS media_assistencias,
    SUM(s.cestas_3)                                  AS cestas_3
FROM vw_estatistica_atleta_partida s
JOIN partida    p ON p.id = s.partida_id AND p.status = 'FINALIZADA'
JOIN campeonato c ON c.id = p.campeonato_id
GROUP BY s.atleta_id, c.temporada;

CREATE UNIQUE INDEX ux_mvw_est_atleta_temp ON mvw_estatistica_atleta_temporada (atleta_id, temporada);
