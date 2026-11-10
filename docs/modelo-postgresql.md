# Modelo PostgreSQL do diagrama do Felipe

Fonte: [CapmHoop no DrawSQL](https://drawsql.app/teams/felipe-nunes/diagrams/capmhoop), consultada em 09/11/2026.

O arquivo [modelo_felipe_postgresql.sql](../backend/sql/modelo_felipe_postgresql.sql) implementa as 15 entidades em PostgreSQL 17+, no schema separado `camphoop_modelo`. Esta e uma proposta executavel para revisao, solicitada antes da adaptacao da aplicacao. A API continua usando os modelos SQLAlchemy e as migracoes Alembic existentes em `public`. O SQL nao e uma migracao desses dados e nao e executado na inicializacao.

## Como revisar e executar

Em um banco de revisao PostgreSQL vazio, execute com `psql`:

```sh
psql --dbname=camphoop_revisao --set=ON_ERROR_STOP=1 --file=backend/sql/modelo_felipe_postgresql.sql
```

A criacao e transacional e falha se `camphoop_modelo` ja existir, evitando reutilizar silenciosamente uma estrutura diferente. Nao contem `DROP`, nao altera `public` e nao muda o `search_path` da sessao depois do commit. Exige permissao para criar schema. Pode ser importado em um novo diagrama DrawSQL configurado para PostgreSQL.

O teste usa o PostgreSQL do PGlite em memoria, sem conectar ao banco local persistente:

```sh
cd backend
node --test tests/modelo-postgresql.test.mjs
```

## Entidades

| Diagrama | PostgreSQL | Relacionamento principal |
| --- | --- | --- |
| usuario | usuario | Identidade e credenciais |
| tecnico | tecnico | PK tambem e FK para usuario |
| Mesario | mesario | PK tambem e FK para usuario |
| Organizador | organizador | PK tambem e FK para usuario |
| Atleta | atleta | PK tambem e FK para usuario |
| Clube | clube | Responsavel organizador |
| Equipe | equipe | Clube e tecnico |
| Campeonato | campeonato | Organizador |
| Fase | fase | Campeonato |
| Participantes | participantes | Campeonato e equipe |
| Partida | partida | Campeonato e fase do mesmo campeonato |
| Elenco | elenco | Equipe e atleta, com periodo de vinculo |
| Titulares | titulares | Partida e vinculo de elenco |
| grupo_partida | grupo_partida | Mesario e partida |
| Avaliacao Fisica | avaliacao_fisica | Atleta |

## Adaptacoes e correcoes explicitas

- Nomes em minusculas, sem acentos ou espacos; `pontos_derrote` vira `pontos_derrota` e `placar_visitants` vira `placar_visitante`.
- IDs principais usam `bigint GENERATED ALWAYS AS IDENTITY`. Perfis e tabelas associativas recebem IDs existentes, sem auto incremento independente. PostgreSQL nao possui `UNSIGNED`.
- CPF e CNPJ sao texto para preservar zeros iniciais, com verificacao de tamanho e digitos. CPF continua opcional e unico; a validacao nao calcula digitos verificadores. CPF esportivo e texto, sem assumir que seja o CPF civil.
- `datetime` vira `timestamptz`; datas civis continuam `date`, valores logicos usam `boolean`. O campo velocidade vira `interval`, por representar uma duracao de teste, sem presumir unidade de velocidade fisica.
- `participantes` recebe PK `(id_campeonato, id_equipe)`, `titulares` recebe PK `(id_partida, id_elenco)` e `grupo_partida` recebe PK `(id_usuario, id_partida)`. Assim uma partida admite varios atletas e um mesario pode trabalhar em varias partidas.
- `avaliacao_fisica` recebe `id_avaliacao` como PK, permitindo varias avaliacoes por atleta. A FK usa `id_atleta`, corrigindo a ligacao do diagrama que aponta `Impulsao` para o atleta.
- A FK da equipe para tecnico usa `id_tecnico`, corrigindo a ligacao do diagrama com a coluna `Nome`.
- O vinculo atleta-equipe passa por `elenco`; nao existe FK de `CPF Esportivo` para equipe.
- `equipe.clube_id` deixa de ser unico para respeitar a relacao de varias equipes por clube indicada no diagrama. A unicidade do responsavel do clube foi mantida como na fonte; precisa de revisao se uma pessoa puder administrar varios clubes.
- A FK composta da partida impede escolher uma fase de outro campeonato. Foram adicionadas verificacoes de datas, placares nao negativos e indices de FKs. Exclusoes usam a restricao padrao do PostgreSQL, sem cascatas que apaguem historico.
- Email tem indice unico normalizado por minusculas e remocao de espacos nas extremidades. O valor armazenado nao e reescrito automaticamente.

## Pontos pendentes antes de integrar a API

O diagrama nao identifica as equipes mandante e visitante na partida, apesar de conter os placares. Essa informacao precisa ser modelada antes da integracao; nao se pode deduzir os lados pelos titulares. Tambem faltam os catalogos de `fase.tipo`, `mao_dominante`, `status` e `funcao`, as unidades e o protocolo de avaliacao fisica, a data da avaliacao e a politica de elencos simultaneos. O SQL preserva esses campos sem inventar seus catalogos.

Foram admitidos `partida.data_final` e `elenco.data_fim` nulos para jogos ainda nao encerrados e vinculos ativos. Os demais campos obrigatorios seguem o diagrama, inclusive CNPJ e nascimento. Isso impede migrar automaticamente registros atuais que nao possuem esses dados.

A modelagem de origem exige uma conta para cada atleta e nao expressa as temporadas no mesmo formato da aplicacao (`integer` versus `2026/27`). A integracao precisa decidir como preservar atletas sem conta, dados importados e historico por temporada. Autenticacao, convites, notificacoes, estatisticas, lances, treinos e pranchetas atuais tambem precisam permanecer contemplados. Nenhum desses dados foi convertido ou apagado nesta proposta.

O teste verifica criacao das 15 tabelas e 20 FKs, insercao entre entidades, varias equipes por clube, varios titulares por partida, mesario em varias partidas, CPF com zero inicial, duplicatas, referencias invalidas, fase de outro campeonato, datas invalidas e preservacao de `public`. A diferenca frente aos 21 relacionamentos visuais decorre da remocao da ligacao incorreta CPF esportivo-equipe; as demais ligacoes foram orientadas para as chaves corretas.
