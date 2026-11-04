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

## Vincular uma conta ao atleta cadastrado

1. Como responsável pelo clube, abra o perfil do atleta que cadastrou e clique em **Vincular conta**.
2. Informe o e-mail da pessoa e clique em **Enviar convite de atleta**. A equipe e o cadastro individual já ficam selecionados.
3. A pessoa entra na conta desse e-mail, abre **Convites** e aceita. Se ainda não confirmou o e-mail, precisa concluir a confirmação antes de aceitar.
4. Após o aceite, essa conta passa a ter perfil de atleta, com acesso ao seu cadastro, equipe e dados privados. Não é criado outro atleta.

Contas já cadastradas recebem uma notificação dentro do CampHoop. O convite também entra na fila de mensagens, usando captura local ou SMTP conforme a configuração. Um membro básico do clube pode aceitar um novo convite de atleta; seu perfil só muda no aceite.

O responsável pode consultar a conta vinculada ou revogar um convite pendente pelo mesmo botão. Para trocar o destinatário de um convite pendente, revogue-o primeiro. Um cadastro já associado a outra pessoa não pode ser reivindicado por outro e-mail, inclusive em outra temporada.

No desenvolvimento, a Marina e outras contas de técnico de teste também podem convidar para os clubes e equipes próprios que cadastraram. As equipes e atletas NCAA continuam somente leitura. Essa permissão de convite para contas fictícias fica desativada em produção; os destinatários continuam usando contas reais com e-mail confirmado.

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

O script cria uma base SQLite temporária sem dados NCAA, com uma Marina fictícia exclusiva para o teste. Inicia API e frontend nas portas 8001 e 5174, usa entrega local e testa contas reais e o convite da Marina para um atleta já cadastrado. Ao terminar, encerra seus processos e limpa somente o diretório temporário criado por ele. Os dados NCAA do ambiente principal são preservados.

Use `-KeepData` para manter os arquivos de diagnóstico ou `-ChromiumExecutable` para informar o caminho de um Chromium instalado. As migrações reais e os controles de acesso também podem ser testados em schemas isolados de PostgreSQL/PGlite, conforme `backend/README.md`.
