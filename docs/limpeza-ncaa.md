# Limpeza e arquivo da NCAA

A inicialização padrão do CampHoop executa migrações, preserva ou cria as contas locais e inicia a API. Os importadores da NCAA foram removidos do projeto. Este guia serve para limpar bases locais que ainda tenham dados de uma importação antiga.

## Conferir e limpar

Pare a API. No PGlite, ela ocupa a única conexão disponível. Mantenha o processo do banco funcionando.

Na pasta `backend`, confira primeiro a simulação:

```powershell
./.venv/Scripts/python.exe -m app.cleanup_ncaa
```

O resultado lista quantidades a remover, registros preservados e bloqueios. A simulação não altera os dados.

Para executar:

```powershell
./.venv/Scripts/python.exe -m app.cleanup_ncaa --apply
```

O comando bloqueia escritas concorrentes no PostgreSQL, cria um backup completo e restaura esse backup em uma base SQLite independente. Só depois de conferir checksum, contagens e integridade das chaves estrangeiras executa a limpeza em uma transação. Uma falha durante a limpeza provoca rollback. Se não houver registros a remover, a execução não faz mudanças.

São selecionados apenas os marcadores `source_id` da NCAA; os jogos também precisam estar marcados como importados. Clubes com identificador de origem só são removidos se não tiverem proprietário nem equipe preservada. Outras fontes de importação são mantidas.

Contas, clubes próprios, equipes próprias, atletas próprios, vínculos, convites, sessões, notificações e mensagens são preservados. Vínculos das contas fictícias com equipes/atletas importados são retirados. Rascunhos automáticos de contas fictícias só podem ser removidos se forem exatamente iguais à configuração inicial da prancheta; desenhos, posições alteradas, notas e jogadas salvas impedem a limpeza.

Se houver jogos, treinos, convites, atletas próprios ou outros registros locais ligados à NCAA, o comando recusa a operação e mostra os bloqueios. Esses vínculos devem ser resolvidos antes de repetir a execução.

## Onde fica o backup

Cada execução cria uma pasta exclusiva em:

```text
backend/data/backups/before-ncaa-cleanup-<data>-<identificador>/
```

Ela contém:

- `database.json.gz`: todas as tabelas da aplicação antes da limpeza, com tipos preservados para restauração.
- `manifest.json`: contagens, revisão do banco e checksum SHA-256.
- `archive.sqlite`: cópia completa restaurada e verificada, incluindo a NCAA e os cadastros próprios existentes naquele momento.
- `RESTORE_VERIFIED`: confirmação de que a restauração passou nas verificações.
- `cleanup-result.json`: contagens removidas e preservadas após o commit da transação.
- `mail-encryption.key`, quando usada a chave local de desenvolvimento: necessária para ler os corpos de mensagens arquivados.

Esse arquivo é privado: inclui contas, hashes de senha, dados pessoais e histórico de mensagens. A pasta está ignorada pelo Git. Se a criptografia foi configurada por `MAIL_ENCRYPTION_KEY`, preserve essa chave privada separadamente.

## Consultar o arquivo separadamente

`archive.sqlite` pode ser aberto por uma ferramenta SQLite. Também é possível iniciar uma API separada apontando `DATABASE_URL` para esse arquivo e `CAMPHOOP_DATA_DIR` para a pasta do backup. Defina `MAIL_TRANSPORT=disabled` nessa consulta para não processar envios arquivados e use outra porta, como 8002. O ambiente principal continua apontando para seu PostgreSQL original.

O módulo `app.database_backup.restore` só restaura em tabelas vazias e verifica o checksum e as contagens. A revisão original está registrada no manifesto e na cópia SQLite; prepare o mesmo esquema se precisar restaurar em outro banco PostgreSQL. Uma restauração deve usar uma base nova, sem sobrescrever os cadastros atuais.

## Reiniciar após a limpeza

```powershell
./scripts/start-api.ps1
```

Recarregue o navegador. A lista principal passa a mostrar apenas os cadastros preservados, e temporadas sem importação deixam de aparecer. O início normal não recria a NCAA.

Os importadores da NCAA foram removidos do projeto: depois da limpeza, não há como os dados voltarem. Se houver arquivos `.parquet` antigos em `backend/data/`, eles não são mais usados e podem ser apagados.
