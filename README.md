# CampHoop

Plataforma de gestão de basquete com frontend React/Vite e backend FastAPI/PostgreSQL.

O ambiente principal usa os clubes, equipes e atletas cadastrados no CampHoop. A base NCAA foi arquivada; sua importação é opcional e fica desativada na inicialização padrão. O seletor mantém elencos, médias, resultados e pranchetas separados por temporada. Veja o [guia de limpeza e backup](docs/limpeza-ncaa.md).

Consulte [backend/README.md](backend/README.md) para instalar, iniciar a API e o banco, acessar as contas locais e executar os testes. O frontend está em `frontend/`; `outputs/camphoop-prototipo.html` preserva a referência visual original.

A [proposta PostgreSQL do diagrama do Felipe](docs/modelo-postgresql.md) está disponível para revisão, com SQL executável e teste isolado. Ela ainda não substitui o banco usado pela aplicação.

