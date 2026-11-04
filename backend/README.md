# CampHoop API

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL. O navegador usa a API por padrão; `VITE_API_MODE=mock` mantém a demonstração isolada. O HTML em `outputs/` é uma referência do protótipo e não depende deste backend.

## Rodar no Windows

Requisitos: Python 3.12 e Node.js 22. O banco local usa **PGlite**, PostgreSQL em WebAssembly com dados persistentes em `backend/data/postgres`. Não exige instalar um serviço PostgreSQL ou Docker.

Na pasta `backend`, prepare o ambiente uma vez:

```powershell
py -3.12 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
npm ci
./.venv/Scripts/python.exe scripts/configure_local.py
```

Abra três terminais:

```powershell
# 1 — pasta backend: banco local
npm run db
```

```powershell
# 2 — pasta backend: migração, importação idempotente, contas locais e API
./scripts/start-api.ps1
```

```powershell
# 3 — pasta frontend
npm ci
npm run dev
```

Frontend: http://localhost:5173 · API: http://127.0.0.1:8000/docs · Saúde: http://127.0.0.1:8000/api/health.

As cinco contas locais são `marina`, `luiza`, `carlos`, `beatriz` e `joao` em `@camphoop.demo`. A senha aleatória está em **`backend/.env`, campo `DEMO_PASSWORD`**. Contas são fictícias, identificadas como teste; Marina usa a equipe feminina de UConn como ambiente de trabalho. O vínculo original de Luiza continua no perfil histórico de 2024/25. Não representam profissionais ou atletas reais. `seed_users` preserva contas existentes e não troca senhas silenciosamente. O `.env`, os hashes de acesso e o banco não entram no Git.

Pare a API antes de executar novas migrações ou importações em outro processo usando PGlite. Ele atende uma conexão do banco por vez; a API usa pool de uma conexão. Execute um único worker. Para PostgreSQL convencional, configure `DATABASE_URL` e use as mesmas migrações.

## Contas reais, clubes e notificações

Use **Criar conta** na tela de entrada. A confirmação de e-mail libera a criação de clubes e o aceite de convites. O responsável cria as equipes e convida pessoas com perfil e vínculo definidos. Convites têm validade de sete dias, podem ser revogados e só são aceitos por uma conta real com o e-mail correspondente confirmado. Atletas são vinculados ao seu cadastro próprio; perfis NCAA não podem ser reivindicados por convites.

Em **Meus clubes**, o responsável acompanha membros, troca suas equipes e encerra vínculos. A revogação remove os acessos de técnico daquele clube e devolve ao responsável as equipes criadas pelo convidado. Estatísticos reais só operam jogos de equipes às quais estejam vinculados. Organizadores precisam de vínculo ativo com o clube para gerenciar seus campeonatos. O histórico individual do atleta permanece acessível à própria pessoa após o encerramento do vínculo, sem manter o acesso aos treinos privados do clube.

Cada conta mantém um único perfil operacional, definido no cadastro do clube ou no convite aceito. Um convite com perfil incompatível é recusado; o sistema não troca silenciosamente os papéis de alguém que participa de outros clubes.

O sino abre **Notificações**, com contagem de não lidas, filtros, paginação e marcação de leitura persistida. Apenas o destinatário acessa seus avisos. A preferência por avisos de clube via e-mail fica em **Minha conta**; confirmação, recuperação e convites não dependem dessa preferência. Contas reais não recebem o selo TESTE da demonstração.

**[Passo a passo para configurar Google e Gmail](../docs/google-gmail.md)**: criar projeto no Google Cloud, habilitar Gmail API, cadastrar cliente web e configurar o callback local. O login usa OpenID Connect com PKCE, nonce e state ligado ao navegador. Uma conta por senha existente exige conexão explícita do Google, após login. O remetente Gmail é definido por `GMAIL_SENDER` e autoriza o escopo de envio separadamente; outras contas não podem trocar o remetente global.

A fila de e-mails usa corpos criptografados, tentativas limitadas, espera entre tentativas e recuperação de envios interrompidos. Em desenvolvimento, sem remetente conectado, as mensagens são capturadas em `data/mailbox/`. O worker usa o mesmo pool da API, sem manter a conexão do banco durante chamadas externas. Os testes de API desativam o worker e verificam a entrega em isolamento. Em produção, configure `APP_ENV=production`, `APP_URL` HTTPS, origens explícitas e `MAIL_ENCRYPTION_KEY`; o modo captura não envia mensagens nesse ambiente.

Para testar do zero sem apagar a base principal, execute `scripts/test-accounts.ps1`. Ele cria um diretório temporário verificado, uma base SQLite sem importações, API na porta 8001 e frontend na 5174. O teste cadastra duas contas, captura e-mails localmente, aceita convite, confere notificações, revoga acesso e recupera a senha. Depois, encerra apenas seus próprios processos e remove o diretório que criou. `-KeepData` preserva o diagnóstico; schemas PostgreSQL isolados validam as migrações e regras reais separadamente.

## Base existente da NCAA

Fonte: [SportsDataverse](https://github.com/sportsdataverse/sportsdataverse-data), arquivos Parquet de calendário e box scores ESPN. Importamos os **torneios nacionais da Division I de 2025, masculino e feminino**, da temporada **2024/25**: **136 equipes, 134 partidas encerradas e 2.039 atletas**. São 3.995 linhas individuais, incluindo quem não entrou em quadra. As médias excluem DNP. Não é uma integração de placares NCAA em tempo real nem a temporada regular completa.

URLs, SHA-256, transformações, cobertura e anomalias estão em [ncaa-2025.manifest.json](ncaa-2025.manifest.json), também acessível em `/api/meta?season=2024/25`. O importador histórico filtra o torneio antes de converter as tabelas, evita duplicatas e recusa arquivos com checksum diferente do manifesto. Reexecutar não sobrescreve dados locais. Para atualizar o recorte histórico, revise o importador e as fontes antes de mudar o manifesto.

```powershell
./.venv/Scripts/python.exe -m app.import_ncaa
# Reutiliza os arquivos baixados, sem rede:
./.venv/Scripts/python.exe -m app.import_ncaa --offline
```

Dados demográficos ausentes continuam `null`. A categoria é **Universitário**, nunca Sub-17. Horários são convertidos para Brasília. Masculino: 2 tempos de 20 minutos; feminino: 4 períodos de 10; prorrogação: 5 minutos. O quadro de campanha usa aproveitamento nos jogos importados do mata-mata e **não representa ranking, chaveamento ou classificação oficial da NCAA**.

Uma divergência da fonte é preservada e sinalizada: jogo masculino ESPN `401746044`, placar oficial **67–58**, soma dos pontos individuais **67–56**. O sistema não inventa os dois pontos ausentes. Estatísticas de equipe extraídas do placar usam o resultado oficial; estatísticas individuais usam os box scores disponíveis.

### Temporada 2026/27

Os arquivos terminados em **2027** correspondem à temporada acadêmica **2026/27**. A captura de 3 de novembro de 2026 contém **11.779 jogos**: **348 encerrados**, **11.430 agendados** e **1 adiado**; **10.452 registros de atletas**, em **1.429 equipes/adversários**. O calendário inclui adversários de outras divisões e não representa somente os membros da Division I. Os elencos refletem os atletas com box score publicado; equipes sem estatísticas podem estar sem elenco disponível.

Os 348 jogos encerrados têm box scores na captura. Há **12 divergências** entre a soma dos pontos individuais e o placar, identificadas em cada partida. Foram excluídos **95 jogos com adversários TBD/identificadores negativos** e **35 linhas individuais sem identificador válido**, sem inventar equipes ou atletas. O manifesto [ncaa-2027.manifest.json](ncaa-2027.manifest.json) registra fontes, hashes, transformações e avisos. Placares de partidas agendadas são `null`; horários não definidos continuam ausentes.

```powershell
# Banco em execução, API parada:
./.venv/Scripts/python.exe -m app.import_current
# Reimportação da captura local, sem rede:
./.venv/Scripts/python.exe -m app.import_current --offline
# Baixa e valida uma nova captura publicada pelo provedor:
./.venv/Scripts/python.exe -m app.import_current --refresh
```

A importação é idempotente e só altera registros importados de 2026/27. O histórico 2024/25 e os jogos criados pelo usuário são preservados. Reinicie a API e recarregue a página depois da atualização para carregar a nova data de captura. Não há coleta automática agendada nem transmissão de placares NCAA em tempo real. Na primeira instalação, o script de inicialização baixa e valida a captura corrente; nas seguintes, reutiliza os arquivos locais. `--refresh` é explícito porque os arquivos da temporada em andamento são substituídos pelo provedor.

O seletor de temporada aparece na área pública, no menu lateral e na barra móvel. A seleção é lembrada no navegador. Listas, perfis de equipes, médias, agenda e campeonatos usam `?season=2026/27` ou `?season=2024/25`; sem parâmetro, a API escolhe a captura mais recente disponível. Links diretos para partidas, campeonatos e perfis de atletas mantêm a temporada do próprio registro. Rascunhos e jogadas são separados por técnico, equipe e temporada; a migração preserva as pranchetas existentes em 2024/25. Atletas usam identificadores de registro por temporada e equipe para não substituir vínculos históricos.

`GET /api/meta` lista as temporadas, cobertura, intervalo de datas dos jogos e data da captura. `GET /api/games` retorna até 200 partidas próximas da data atual por padrão, aceita `limit` (até 500), `offset` e `status`. Agenda e tabela dos campeonatos permitem consultar as demais partidas. Listas extensas da interface são exibidas progressivamente com **Carregar mais**.

Créditos: SportsDataverse, autores de [hoopR-mbb-data](https://github.com/sportsdataverse/hoopR-mbb-data) e [wehoop-wbb-data](https://github.com/sportsdataverse/wehoop-wbb-data), dados originalmente coletados da ESPN. Os dois repositórios de basquete declaram os dados sob **CC BY 4.0** ([masculino](https://github.com/sportsdataverse/hoopR-mbb-data/blob/main/LICENSE.md), [feminino](https://github.com/sportsdataverse/wehoop-wbb-data/blob/main/LICENSE.md), [licença](https://creativecommons.org/licenses/by/4.0/)). O repositório agregador SportsDataverse declara [MIT](https://github.com/sportsdataverse/sportsdataverse-data/blob/main/LICENSE). CampHoop aplica recorte, normalização de IDs, conversão de fuso e cálculos; não tem vínculo ou endosso da NCAA, ESPN ou SportsDataverse. Imagens remotas preservam os URLs da fonte.

## Funcionalidades e acesso

- Consultas públicas: campeonatos, equipes, atletas, agenda de jogos, placares, box score e metadados de importação.
- Login com Argon2 e sessões revogáveis no banco. Cookie HttpOnly, SameSite=Lax; `SECURE_COOKIE=true` em HTTPS. Os perfis enviados pelo cliente não conferem permissão.
- Técnico: treinos, amistosos e prancheta da própria equipe. Rascunho privado por usuário e equipe; jogadas com controle de revisão e validação de geometria.
- Organizador: cria campeonatos, inscreve equipes e agenda jogos oficiais próprios. Categoria, gênero, inscrição e choque de data são validados no servidor, em transação.
- Estatístico: inicia novos jogos, registra/desfaz ações, opera relógio e encerra partidas. Revisões e bloqueios de linha previnem sobrescrita concorrente. Cinco faltas retiram o atleta da quadra. Resultados e estatísticas encerrados alimentam todas as consultas.
- Jogos históricos importados são somente leitura. Não há lance a lance sintético para jogos que só possuem box score.
- WebSocket `/api/ws` transmite apenas invalidação pública do jogo, após commit. Pranchetas e treinos nunca são transmitidos. O cliente reconecta e usa consultas periódicas quando o socket está indisponível.

Os técnicos podem criar clubes, equipes e atletas próprios pelas páginas **Times** e **Atletas**. A equipe tem nome, categoria, gênero e responsável por temporada; o atleta tem número, posição, situação e dados opcionais de perfil. O seletor **Equipe de trabalho** alterna entre as equipes autorizadas, preservando o vínculo original da conta de teste. Equipes e atletas importados da NCAA são identificados e permanecem somente leitura.

**Nova temporada** cria um período da equipe e permite copiar seu elenco. Cada atleta copiado recebe um novo registro, com a mesma identidade, sem substituir o vínculo anterior nem copiar estatísticas. Quem já tem vínculo no destino é pulado; a resposta e a tela informam nomes e quantidade. **Vincular existente** mostra uma opção por pessoa, excluindo quem já está vinculado ao destino. A conta do atleta mantém sua identidade entre temporadas, consulta seus próprios perfis anteriores e recebe o contexto da temporada selecionada. Transferências sem histórico também atualizam a equipe da conta associada.

Novos cadastros locais aceitam do ano acadêmico anterior até dois anos à frente, calculados pela data de Brasília. Temporadas locais vazias aparecem somente para contas vinculadas; entram no seletor público quando têm jogos confirmados, sem ultrapassar dois anos à frente. Temporadas passadas com jogos e importações históricas continuam disponíveis. A flag `historical` usa o fim do ano acadêmico, em vez de uma temporada fixa.

O dono da equipe e o responsável pelo clube podem editar o cadastro e o elenco. A data completa de nascimento fica restrita aos técnicos autorizados e ao próprio atleta; a idade é pública. Revisões impedem sobrescrever alterações de outra tela. Partidas em andamento bloqueiam alterações no elenco. Nome, número e posição ficam preservados após qualquer `PlayerStat` ou lance, incluindo DNP; mudanças exigem novo vínculo em outra temporada. Transferências exigem ausência de registros de jogo e referências em jogadas ou rascunhos. Categoria e gênero não podem mudar depois de inscrição ou agendamento naquela temporada. **No clube desde** aceita meses entre janeiro de 1900 e o mês atual, com os mesmos limites na tela e no servidor. A leitura privada de edição não adquire locks de escrita.

Em **Equipe de trabalho → Acessos e autorizações**, o proprietário pode conceder/revogar acesso de técnicos existentes, autorizar um amistoso contra um adversário em uma data específica ou autorizar inscrição em um campeonato específico. A autorização não agenda nem reserva datas. O agendamento exige que o solicitante seja técnico de uma participante e que cada equipe local alheia tenha consentido. O organizador só inscreve equipes locais com consentimento do proprietário. Equipes importadas sem proprietário local continuam disponíveis para simulações do ambiente de teste. Revogar impede novas operações; jogos e inscrições já aceitos permanecem no histórico.

Trocar a equipe de trabalho seleciona um contexto e não cria permissões. Técnicos convidados podem encerrar seu próprio vínculo nessa tela, e o proprietário pode revogar acessos concedidos. Uma seleção antiga não restaura a permissão revogada. O proprietário mantém acesso enquanto for dono da equipe. O acesso usa contas já existentes; criar novas contas ainda não faz parte deste fluxo.

**Excluir vínculo sem histórico**, **Excluir temporada vazia** e **Excluir equipe vazia** permitem corrigir cadastros próprios sem uso. As operações exigem a revisão atual e recusam vínculos com contas, estatísticas ou jogadas e equipes com elenco, treinos, inscrições ou jogos. Excluir uma temporada não apaga outras temporadas. O clube vazio criado pela conta é removido junto da última equipe vazia. Importações NCAA nunca podem ser excluídas por esse fluxo. A URL `?nova=1` só abre o cadastro para perfis de técnico.

Os resumos agregam partidas encerradas importadas e novas partidas registradas no CampHoop **apenas na temporada selecionada**. Agendamentos novos precisam ter uma data no ano acadêmico escolhido (julho a junho). Jogos NCAA importados, inclusive os agendados e adiados, são somente leitura para os perfis locais.

## PostgreSQL convencional

`compose.yaml` fornece PostgreSQL 17 com volume persistente e porta restrita ao loopback. Defina uma senha própria, execute `docker compose up -d` na pasta `backend` e configure `DATABASE_URL=postgresql+psycopg://camphoop:SENHA@127.0.0.1:5432/camphoop`. Codifique caracteres especiais da senha para URL. Execute `alembic upgrade head` e a importação antes de iniciar a API. Este ambiente foi validado com PGlite; Docker/PostgreSQL nativo não estavam instalados na máquina.

Para disponibilização externa: use PostgreSQL gerenciado ou convencional, HTTPS, origens explícitas, contas reais provisionadas sem executar o seed local e limite de tentativas de login no proxy. O hub de WebSockets desta etapa é de processo único; múltiplos workers exigem distribuição de eventos, por exemplo via Redis. As consultas agregadas carregam o recorte inicial em memória; expansão para temporadas completas exige paginação e agregações SQL.

## Verificação

```powershell
./.venv/Scripts/python.exe -m pytest -q
$env:RUN_DATASET_TESTS='1'
./.venv/Scripts/python.exe -m pytest -q
./.venv/Scripts/python.exe -m alembic check
```

Os testes isolam o banco e cobrem senha/sessão, papéis, privacidade, revisões, lances, encerramento, WebSocket, transações e importação real idempotente. `RUN_DATASET_TESTS=1` exige os quatro Parquet já baixados. As migrações e a API local usam PostgreSQL/PGlite; a suíte rápida usa SQLite temporário.

Para rodar a suíte de API sobre PostgreSQL/PGlite, pare a API, defina `POSTGRES_TEST_URL` com a URL do banco e execute `python -m pytest tests/test_api.py tests/test_management.py tests/test_seasons.py tests/test_roster_safety.py tests/test_accounts.py -q`. Cada teste cria um schema exclusivo `camphoop_test_<uuid>`, aplica as migrações reais e remove apenas esse schema ao terminar. Não apaga as tabelas públicas nem o histórico importado. O usuário de teste precisa de permissão para criar schemas.

No frontend: `npm test`, `npm run build`. Para validar as telas com a API local em execução: `npx playwright install chromium` e `npm run test:e2e`. Os testes não imprimem a senha. Capturas e relatórios ficam ignorados pelo Git.

O teste entre navegadores cria um amistoso identificado como `CampHoop E2E` e registra seu ID em `backend/data/e2e-games.json`. Depois da execução, pare a API e, na pasta `backend`, rode `$env:PYTHONPATH='.'; ./.venv/Scripts/python.exe scripts/cleanup_e2e.py` antes de repeti-lo. A limpeza valida os IDs e o identificador do teste, preservando as partidas reais. As jogadas criadas pelo teste são removidas e o rascunho anterior é restaurado automaticamente.

O teste `e2e/management.spec.ts` cria clubes de teste com prefixo e identificador exclusivos, registrados em `backend/data/e2e-rosters.json`. Com a API parada, execute `scripts/cleanup_roster_e2e.py` da mesma forma. A limpeza verifica prefixo, proprietário e ausência de referências de outras contas antes de remover somente os dados desses clubes e restaurar a equipe de trabalho original.
