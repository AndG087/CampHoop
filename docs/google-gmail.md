# Google e Gmail no CampHoop

O login com Google e o envio de e-mails usam autorizações separadas. O login pede `openid`, e-mail e perfil. O remetente do aplicativo autoriza adicionalmente `gmail.send`; o CampHoop não pede acesso de leitura à caixa de entrada.

Enquanto essas credenciais não estiverem configuradas, cadastro por e-mail, convites e recuperação funcionam com entrega local de desenvolvimento. Nenhum e-mail desse modo é enviado ao Gmail.

## 1. Criar o projeto Google

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) com a conta que administrará o aplicativo.
2. Crie um projeto chamado **CampHoop** e selecione-o.
3. Em **APIs e serviços → Biblioteca**, procure **Gmail API** e habilite a API.
4. Abra **Google Auth Platform**. Em **Branding**, configure o nome CampHoop, o e-mail de suporte e seu e-mail de contato.
5. Em **Audience**, use o público adequado à sua conta. Para testes com contas pessoais, escolha **External** e cadastre seu Gmail e os demais participantes em **Test users**.
6. Em **Data Access**, adicione os escopos de identidade e o escopo `https://www.googleapis.com/auth/gmail.send`.

Os nomes das telas e a preparação do projeto são descritos no [guia oficial da Gmail API](https://developers.google.com/workspace/gmail/api/quickstart/python). A configuração do login segue [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect).

## 2. Criar as credenciais OAuth

1. Em **Clients**, crie um cliente OAuth do tipo **Web application**.
2. Use o nome **CampHoop local**.
3. Para o ambiente local, cadastre a origem `http://localhost:5173`.
4. Em **Authorized redirect URIs**, cadastre exatamente:

   ```text
   http://localhost:5173/api/auth/google/callback
   ```

5. Copie o **Client ID** e o **Client secret** para o arquivo privado `backend/.env`.

Use o endereço `localhost` durante esse fluxo; trocar para `127.0.0.1` muda o domínio dos cookies e pode invalidar a tentativa de conexão. Não adicione barra extra ao final do callback.

## 3. Preencher o backend

Adicione os valores correspondentes no `backend/.env`, que fica fora do Git:

```dotenv
APP_ENV=development
APP_URL=http://localhost:5173
MAIL_TRANSPORT=auto
GOOGLE_CLIENT_ID=SEU_CLIENT_ID
GOOGLE_CLIENT_SECRET=SEU_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
GMAIL_SENDER=seu-email@gmail.com
```

`GMAIL_SENDER` é a única conta que poderá conectar o Gmail de envio do aplicativo. Outras pessoas podem entrar com Google sem autorizar esse envio. Não é necessário criar senha de aplicativo para o modo Gmail OAuth.

Em desenvolvimento, a chave de criptografia é criada em `backend/data/mail-encryption.key`. Ela protege os corpos da fila de e-mails e o token de renovação do Gmail. Para produção, configure `MAIL_ENCRYPTION_KEY` com uma chave Fernet e mantenha-a no gerenciador de segredos. A chave deve acompanhar o backup do banco, sem entrar no repositório.

Depois de alterar o `.env`, pare a API com **Ctrl+C** e inicie novamente na pasta `backend`:

```powershell
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

O frontend continua em `http://localhost:5173`.

## 4. Testar a entrada com Google

1. Abra `http://localhost:5173/login`.
2. Clique em **Continuar com Google** e escolha uma conta cadastrada como usuária de teste no projeto.
3. O CampHoop cria uma conta real com e-mail confirmado quando esse e-mail ainda não tem cadastro.
4. Se já houver uma conta por senha com o mesmo e-mail, entre com a senha e conecte o Google em **Minha conta → Entrada com Google**. O sistema não une contas silenciosamente.

As contas fictícias, como Marina Costa, não podem ser vinculadas a contas Google reais.

## 5. Autorizar o Gmail remetente

1. Entre com a conta cujo e-mail está em `GMAIL_SENDER`.
2. Abra **Minha conta**.
3. No cartão **Gmail do aplicativo**, clique em **Autorizar envio pelo Gmail**.
4. Selecione o mesmo Gmail e autorize o escopo de envio.
5. Ao retornar, o cartão mostra **GMAIL CONECTADO**. Com `MAIL_TRANSPORT=auto`, novas mensagens passam a usar essa autorização.
6. Crie um clube, cadastre sua primeira equipe e envie um convite a uma pessoa que participará do teste.

O servidor guarda o token de renovação criptografado. **Desconectar Gmail** revoga a autorização no Google e remove a conexão local. Mensagens são processadas por uma fila com até três tentativas; o corpo de e-mails e credenciais não é registrado nos logs.

Aplicações externas em estado **Testing** podem receber tokens de renovação que expiram após sete dias quando usam escopos como o Gmail. Se isso ocorrer, renove a autorização em Minha conta. Antes do uso público, confira os requisitos de publicação e verificação do projeto. [Expiração de tokens na documentação oficial](https://developers.google.com/identity/protocols/oauth2#expiration).

## 6. Testar sem Google configurado

Com `APP_ENV=development` e `MAIL_TRANSPORT=auto`, a ausência de remetente Gmail/SMTP ativa a entrega local. Os arquivos JSON em `backend/data/mailbox/` mostram destinatário, assunto e link da mensagem. Abra o link no navegador para confirmar o e-mail, aceitar convites ou redefinir a senha. Para confirmar o e-mail, entre primeiro na conta que criou; o link não valida o cadastro de outra sessão ou de outra pessoa. Essa caixa local não tem endpoint público e não entra no Git.

Links usam um token no fragmento `#token=...`, consumido pelo frontend em um POST. Convites expiram em sete dias, confirmação em 24 horas e recuperação em 30 minutos. Tokens são de uso único; no banco, os tokens de ação são armazenados como hash.

## 7. Executar o teste de contas em ambiente vazio

Na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File backend/scripts/test-accounts.ps1
```

O script cria uma base SQLite temporária sem contas ou importações, inicia API e frontend separados nas portas 8001 e 5174, usa somente entrega local e roda o teste entre duas contas. Ao terminar, encerra seus processos e remove somente o diretório temporário criado por ele. A base NCAA e as contas do ambiente principal continuam disponíveis.

Use `-KeepData` para preservar o diretório de diagnóstico. Se necessário, informe `-ChromiumExecutable` com o caminho de um Chromium instalado ou instale o navegador com `npx playwright install chromium` na pasta `frontend`.

As migrações reais e os controles de acesso também são testados em schemas isolados de PostgreSQL/PGlite; o teste de navegador em SQLite complementa essa verificação.
