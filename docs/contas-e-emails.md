# Contas e mensagens no CampHoop

O CampHoop usa cadastro com e-mail e senha. Não precisa criar projeto no Google Cloud ou configurar OAuth. Clubes, equipes, convites e notificações continuam disponíveis.

## Usar o ambiente local

No `backend/.env`, mantenha:

```dotenv
APP_ENV=development
APP_URL=http://localhost:5173
MAIL_TRANSPORT=auto
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
```

Sem SMTP configurado, as mensagens são salvas em arquivos JSON em `backend/data/mailbox/`. Elas não saem do computador e não chegam à caixa de entrada do destinatário. Essa pasta é privada, não tem endpoint público e não entra no Git.

1. Abra `http://localhost:5173/cadastro` e crie sua conta com e-mail e senha de pelo menos 12 caracteres.
2. Na pasta `backend/data/mailbox/`, localize a mensagem cujo `to` é seu e-mail e cujo assunto pede confirmação. O processamento pode levar alguns segundos.
3. Copie o link do campo `body` e abra-o no mesmo navegador, conectado à conta que acabou de criar.
4. Clique em **Confirmar meu e-mail**. Depois, crie seu clube em **Meus clubes**.
5. Convites e links de recuperação de senha aparecem na mesma pasta. Use o link da mensagem mais recente para aquele destinatário e assunto.

Para testar um convite, crie a conta da pessoa convidada, confirme seu e-mail e aceite o convite com o endereço correspondente. As notificações do sino aparecem dentro do CampHoop, independentemente de envio externo.

Confirmações expiram em 24 horas, convites em sete dias e recuperação de senha em 30 minutos. Os links são de uso único, com tokens armazenados como hash no banco. A recuperação de senha encerra as sessões anteriores.

## Envio real opcional

Quando desejar entregar mensagens fora do computador, preencha os campos SMTP do seu provedor no `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASSWORD`. Com `MAIL_TRANSPORT=auto`, o servidor passa a usar SMTP quando os três campos de conexão estiverem preenchidos. A porta 465 usa TLS direto; outras portas usam STARTTLS.

Reinicie a API após alterar o `.env`. Para continuar somente com mensagens locais mesmo que existam credenciais SMTP, use `MAIL_TRANSPORT=capture` no desenvolvimento.

Em produção, configure HTTPS, `APP_ENV=production`, `APP_URL`, origens explícitas, `MAIL_ENCRYPTION_KEY` e um remetente SMTP. A captura local não está disponível nesse ambiente. Sem SMTP, as notificações internas continuam disponíveis, mas mensagens de confirmação, convites e recuperação não serão entregues externamente.

A chave Fernet de desenvolvimento fica em `backend/data/mail-encryption.key` e protege os corpos da fila de mensagens. Preserve essa chave junto do backup privado do banco. O `.env`, a chave e os bancos locais ficam fora do Git.

## Migração de instalações existentes

Com a API parada, execute `./.venv/Scripts/python.exe -m alembic upgrade head` na pasta `backend`. A revisão `0007` remove apenas as tabelas de autorização externa. Contas, senhas, clubes, elencos, notificações, fila de mensagens e dados NCAA são preservados. Se uma instalação antiga tiver uma conta que usava apenas login externo, use **Esqueci minha senha** para definir uma senha para ela.

## Testar sem apagar a base principal

Na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File backend/scripts/test-accounts.ps1
```

O script cria uma base SQLite temporária vazia, inicia API e frontend nas portas 8001 e 5174, usa entrega local e testa duas contas. Ao terminar, encerra seus processos e limpa somente o diretório temporário criado por ele. Os dados NCAA do ambiente principal são preservados.

Use `-KeepData` para manter os arquivos de diagnóstico ou `-ChromiumExecutable` para informar o caminho de um Chromium instalado. As migrações reais e os controles de acesso também podem ser testados em schemas isolados de PostgreSQL/PGlite, conforme `backend/README.md`.
