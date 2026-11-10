-- Modelo para revisao. Fonte: https://drawsql.app/teams/felipe-nunes/diagrams/capmhoop
-- PostgreSQL 17+. Executar uma vez em banco de revisao, fora das migracoes da API.
-- Nao altera o schema public nem migra dados do CampHoop atual.
BEGIN;
CREATE SCHEMA camphoop_modelo;
SET LOCAL search_path TO camphoop_modelo;

CREATE TABLE usuario (
    id_usuario bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cpf varchar(11) UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
    email varchar(254) NOT NULL UNIQUE,
    senha_hash text NOT NULL,
    nome_completo varchar(255) NOT NULL,
    data_nascimento date NOT NULL
);
CREATE UNIQUE INDEX usuario_email_normalizado ON usuario (lower(btrim(email)));

-- Os perfis reutilizam o ID do usuario; nao geram uma nova identidade.
CREATE TABLE tecnico (
    id_usuario bigint PRIMARY KEY REFERENCES usuario(id_usuario)
);
CREATE TABLE mesario (
    id_usuario bigint PRIMARY KEY REFERENCES usuario(id_usuario)
);
CREATE TABLE organizador (
    id_usuario bigint PRIMARY KEY REFERENCES usuario(id_usuario)
);
CREATE TABLE atleta (
    id_usuario bigint PRIMARY KEY REFERENCES usuario(id_usuario),
    cpf_esportivo varchar(50) NOT NULL,
    apelido varchar(255),
    mao_dominante char(1) NOT NULL,
    posicao_principal varchar(255) NOT NULL
);

CREATE TABLE clube (
    id_clube bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome varchar(255) NOT NULL,
    sigla varchar(255) NOT NULL,
    cnpj varchar(14) NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
    cidade varchar(255) NOT NULL,
    uf char(2) NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
    escudo text NOT NULL,
    data_fundacao date NOT NULL,
    responsavel bigint NOT NULL UNIQUE REFERENCES organizador(id_usuario)
);
CREATE TABLE equipe (
    id_equipe bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_tecnico bigint NOT NULL REFERENCES tecnico(id_usuario),
    nome varchar(255) NOT NULL,
    clube_id bigint NOT NULL REFERENCES clube(id_clube),
    categoria varchar(255) NOT NULL
);
CREATE INDEX equipe_tecnico_idx ON equipe(id_tecnico);
CREATE INDEX equipe_clube_idx ON equipe(clube_id);

CREATE TABLE campeonato (
    id_campeonato bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_organizador bigint NOT NULL REFERENCES organizador(id_usuario),
    nome varchar(255) NOT NULL,
    temporada integer NOT NULL,
    data_inicio date NOT NULL,
    data_final date NOT NULL,
    pontos_vitoria integer NOT NULL,
    pontos_derrota integer NOT NULL,
    pontos_empate integer NOT NULL,
    regulamento text NOT NULL,
    CONSTRAINT campeonato_datas_validas CHECK (data_final >= data_inicio)
);
CREATE INDEX campeonato_organizador_idx ON campeonato(id_organizador);
CREATE TABLE fase (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_campeonato bigint NOT NULL REFERENCES campeonato(id_campeonato),
    nome varchar(255) NOT NULL,
    ordem bigint NOT NULL,
    tipo bigint NOT NULL,
    UNIQUE (id, id_campeonato)
);
CREATE INDEX fase_campeonato_idx ON fase(id_campeonato);
CREATE TABLE participantes (
    id_campeonato bigint NOT NULL REFERENCES campeonato(id_campeonato),
    id_equipe bigint NOT NULL REFERENCES equipe(id_equipe),
    grupo varchar(255) NOT NULL,
    data_inscr date NOT NULL,
    PRIMARY KEY (id_campeonato, id_equipe)
);
CREATE INDEX participantes_equipe_idx ON participantes(id_equipe);

CREATE TABLE partida (
    id_partida bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_campeonato bigint NOT NULL REFERENCES campeonato(id_campeonato),
    id_fase bigint NOT NULL,
    local varchar(255) NOT NULL,
    data_inicio timestamptz NOT NULL,
    data_final timestamptz,
    placar_home bigint NOT NULL DEFAULT 0 CHECK (placar_home >= 0),
    placar_visitante bigint NOT NULL DEFAULT 0 CHECK (placar_visitante >= 0),
    status varchar(255) NOT NULL,
    CONSTRAINT partida_fase_campeonato_fk FOREIGN KEY (id_fase, id_campeonato)
        REFERENCES fase(id, id_campeonato),
    CONSTRAINT partida_datas_validas CHECK (data_final >= data_inicio)
);
CREATE INDEX partida_campeonato_idx ON partida(id_campeonato);
CREATE INDEX partida_fase_idx ON partida(id_fase, id_campeonato);
CREATE TABLE elenco (
    id_elenco bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_equipe bigint NOT NULL REFERENCES equipe(id_equipe),
    id_atleta bigint NOT NULL REFERENCES atleta(id_usuario),
    numero_camisa integer NOT NULL CHECK (numero_camisa >= 0),
    capitao boolean NOT NULL DEFAULT false,
    data_inicio date NOT NULL,
    data_fim date,
    CONSTRAINT elenco_datas_validas CHECK (data_fim >= data_inicio)
);
CREATE INDEX elenco_equipe_idx ON elenco(id_equipe);
CREATE INDEX elenco_atleta_idx ON elenco(id_atleta);
CREATE TABLE titulares (
    id_partida bigint NOT NULL REFERENCES partida(id_partida),
    id_elenco bigint NOT NULL REFERENCES elenco(id_elenco),
    titular boolean NOT NULL DEFAULT false,
    PRIMARY KEY (id_partida, id_elenco)
);
CREATE INDEX titulares_elenco_idx ON titulares(id_elenco);
CREATE TABLE grupo_partida (
    id_usuario bigint NOT NULL REFERENCES mesario(id_usuario),
    id_partida bigint NOT NULL REFERENCES partida(id_partida),
    funcao varchar(255) NOT NULL,
    PRIMARY KEY (id_usuario, id_partida)
);
CREATE INDEX grupo_partida_partida_idx ON grupo_partida(id_partida);
CREATE TABLE avaliacao_fisica (
    id_avaliacao bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_atleta bigint NOT NULL REFERENCES atleta(id_usuario),
    impulsao real NOT NULL,
    altura real NOT NULL,
    peso real NOT NULL,
    envergadura real NOT NULL,
    forca bigint NOT NULL,
    velocidade interval NOT NULL
);
CREATE INDEX avaliacao_fisica_atleta_idx ON avaliacao_fisica(id_atleta);

COMMENT ON SCHEMA camphoop_modelo IS
    'Modelo de revisao do diagrama DrawSQL de Felipe Nunes; separado da API atual.';
COMMENT ON COLUMN avaliacao_fisica.velocidade IS
    'Duracao do teste de velocidade. Distancia e protocolo ainda precisam ser definidos.';
COMMENT ON COLUMN fase.tipo IS 'Codigo do tipo de fase; catalogo ainda precisa ser definido.';
COMMENT ON COLUMN atleta.mao_dominante IS 'Codigo de uma letra; valores ainda precisam ser definidos.';
COMMIT;
