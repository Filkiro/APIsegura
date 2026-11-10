# Pesquisa

**Grupo:** Filipe Gomes, João Miguel, Arthur Chave - 3º AI - ETECAMP  
**Tema Escolhido:** Tema 1 — Biblioteca  
**Recurso Principal:** `Emprestimo` (livro, leitor e datas), associado diretamente ao usuário leitor.

---

## A. Fundamentos

### 1. Autenticação × autorização
A autenticação valida a identidade de quem está acessando o sistema ("quem é você?").  
Na nossa biblioteca, isso ocorre no `POST /auth/login`, onde o leitor envia e-mail e senha e recebe o token JWT.  
Já a autorização define as permissões do usuário já identificado ("o que você pode fazer?").  
Por exemplo, a leitora Ana pode pegar livros emprestados, mas só o `ADMIN` pode cadastrar novos livros no acervo.  
Quando a autenticação falha (sem token, token expirado ou senha incorreta), a API responde com **401 Unauthorized**.  
Quando a autorização falha (leitor comum tentando criar livro ou ver empréstimo de outro), a API responde com **403 Forbidden**.

### 2. Stateful × stateless
No login stateful (como sessões de PHP), o servidor aloca a sessão na memória ou banco e envia o ID num cookie.  
A vantagem do stateful é o controle imediato para revogar no logout, mas a desvantagem é o alto consumo de memória e a dificuldade de escalar.  
No login stateless com JWT (usado na nossa API), os dados do leitor (`id` e `role`) viajam assinados no próprio token.  
A vantagem do stateless é a escalabilidade e velocidade, pois a API valida o acesso apenas conferindo a assinatura sem consultar o banco.  
A desvantagem do stateless é que o token não pode ser invalidado no servidor antes do `exp`; no logout, ele só é descartado no front-end.

### 3. Hash × criptografia × encoding
O encoding apenas converte dados para trânsito seguro em URLs (como Base64URL); não usa chave, não protege nada e qualquer um decodifica.  
A criptografia é bidirecional e serve para sigilo: embaralha o dado com uma chave e permite decifrá-lo de volta para o texto original.  
O hash é unidirecional: gera uma impressão digital única e irreversível, sendo matematicamente impossível recuperar o dado de entrada.  
No nosso projeto, usamos hash com `bcryptjs` para as senhas no SQLite, garantindo que mesmo se o banco vazar ninguém descobrirá a senha real.  
Já no header e payload do JWT usamos apenas encoding (Base64URL): os dados não são secretos, pois o que garante a segurança é a assinatura.

### 4. bcrypt e salt
MD5 e SHA-256 foram feitos para serem rápidos, o que é inseguro para senhas, pois invasores testam bilhões de hashes por segundo com GPUs.  
O bcrypt é o mais indicado porque foi criado para ser intencionalmente lento e pesado, inviabilizando ataques de força bruta.  
O custo (usamos 10 em `CUSTO_BCRYPT`) representa as rodadas de cálculo ($2^{10} = 1024$ iterações); no futuro, basta subir para 11 para dobrar o tempo de processamento.  
O salt é uma sequência aleatória gerada para cada leitor e adicionada à senha antes de aplicar o hash.  
Por causa do salt, mesmo que a Ana e o Bruno usem a mesma senha `Senha123`, os hashes no `dev.db` serão totalmente diferentes, anulando Rainbow Tables.

---

## B. JWT (JSON Web Token)

### 5. Estrutura
Um JWT possui três partes separadas por ponto: Header (algoritmo e tipo), Payload (claims do usuário) e Signature (assinatura digital).  
Geramos um token real para a leitora Ana no `POST /auth/login`:  
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3OTQyNjE0MjIsImV4cCI6MTc5NDI2NTAyMn0.yqR9iZ-P6_sQ09T8R3hC`  
No jwt.io, o Header decodificado é: `{"alg": "HS256", "typ": "JWT"}`.  
O Payload decodificado exibe: `{"sub": "2", "role": "USER", "iat": 1794261422, "exp": 1794265022}`.  
A Signature combina header, payload e a `JWT_SECRET` com HMAC-SHA256, garantindo a integridade dos dados.

### 6. Claims
A claim `sub` (subject) guarda o identificador do leitor (id da Ana); `iat` (issued at) é o timestamp de emissão; e `exp` é a data de expiração.  
No nosso projeto, colocamos no payload apenas `sub` e `role` (`USER` ou `ADMIN`), além de `iat` e `exp` gerados pela biblioteca.  
Escolhemos apenas essas claims porque elas bastam para os middlewares `autenticar` e `autorizar` validarem o acesso sem consultar o SQLite.  
Nunca devemos incluir no payload informações confidenciais como senhas, hashes, CPFs ou dados financeiros.  
Como o payload usa apenas codificação Base64URL aberta, qualquer pessoa que interceptar o tráfego consegue ler seu conteúdo integralmente.

### 7. Assinatura
A assinatura do JWT é gerada no servidor unindo o header codificado, o payload e a chave secreta `JWT_SECRET` via HMAC-SHA256.  
Se um leitor editar o token no navegador trocando `'role': 'USER'` por `'role': 'ADMIN'`, o hash da assinatura deixará de bater.  
Para criar uma assinatura correspondente ao novo payload, o invasor precisaria da `JWT_SECRET`, que fica guardada no `.env` do servidor.  
A diferença é que `jwt.decode()` apenas decodifica o Base64URL para JSON sem checar nenhuma regra, aceitando tokens fraudados.  
Já o `jwt.verify()` recalcula a assinatura com a chave secreta e confere o `exp`, rejeitando requisições adulteradas ou vencidas com erro 401.

### 8. Validade e logout
Como a autenticação JWT é stateless, o token permanece válido até que o horário de sua expiração (`exp`) seja atingido.  
Ao fazer logout, o token é apenas removido do navegador; se o leitor for promovido a `ADMIN`, continuará como `USER` até fazer login de novo.  
Por segurança, definimos um tempo curto de 1 hora na biblioteca (`JWT_EXPIRES_IN=1h`).  
O Refresh Token resolve essa limitação usando dois tokens: um Access Token de curta duração (15 min) e um Refresh Token longo (30 dias).  
Quando o Access Token vence, o app usa o Refresh Token para renovar o acesso; no logout ou bloqueio, basta invalidar o Refresh Token no banco.

---

## C. Segurança na prática

### 9. Onde guardar o token
Salvar no `localStorage` é prático no JavaScript, mas deixa o token exposto a roubo em ataques de XSS (scripts injetados na página).  
O cookie com flag `HttpOnly` impede a leitura por scripts JavaScript, protegendo contra XSS, mas fica vulnerável a ataques de CSRF.  
O XSS ocorre quando entradas sem tratamento executam scripts maliciosos no navegador (ex.: título de livro com tag `<script>`).  
O CSRF ocorre quando sites externos forçam o navegador autenticado a disparar ações não autorizadas aproveitando cookies automáticos.  
Nossa API usa o cabeçalho `Authorization: Bearer <token>`, o que elimina o risco de CSRF, pois navegadores não o anexam sozinhos.

### 10. Chave secreta
A `JWT_SECRET` fica no arquivo `.env` para manter o segredo criptográfico isolado do código-fonte e fora do controle de versão.  
O arquivo `.env` é ignorado no `.gitignore`, deixando no GitHub somente o `.env.example` com valores ilustrativos para instalação.  
Se a chave vazasse, um invasor conseguiria forjar tokens válidos com perfil `ADMIN` (`sub: 1`) para qualquer conta sem precisar de senhas.  
Ele teria controle irrestrito da biblioteca: poderia apagar acervos, alterar devoluções e acessar dados de todos os leitores.  
Para mitigar, seria necessário alterar a `JWT_SECRET` no servidor (revogando todos os tokens) e limpar o histórico do Git.

### 11. RBAC e dono do recurso
O RBAC (Role-Based Access Control) restringe o acesso com base no papel formal do usuário (`ADMIN` ou `USER`).  
No código, o RBAC está no middleware `autorizar('ADMIN')` em `src/middlewares/autorizar.js`, protegendo rotas como `POST /livros` e `PATCH /users/:id/role`.  
Já o controle por dono (Ownership) restringe o acesso à posse do registro (o leitor só visualiza e devolve seus próprios empréstimos).  
No código, o controle por dono fica na função `carregarComPermissao` em `src/controllers/emprestimoController.js`, checando se `leitorId` é igual ao id logado.  
O id do titular é obtido sempre do token (`req.usuario.id`) e nunca do body, impedindo que um leitor retire livros fingindo ser outra pessoa.

### 12. OWASP
A primeira recomendação vem do Password Storage Cheat Sheet da OWASP: nunca salvar senhas puras e usar hash iterativo com salt (bcrypt >= 10).  
Nosso projeto segue isso utilizando a biblioteca `bcryptjs` com custo 10 (`CUSTO_BCRYPT = 10`) e omitindo a senha no Prisma via `omit: { password: true }`.  
A segunda recomendação vem do Authentication Cheat Sheet da OWASP: não revelar se o erro foi no e-mail ou na senha e prevenir ataques de força bruta.  
Nosso projeto cumpre isso retornando a mensagem genérica "E-mail ou senha inválidos.", usando `HASH_FALSO` se o e-mail não existir para evitar Timing Attacks.  
Além disso, aplicamos o `express-rate-limit` bloqueando novas tentativas de login no endpoint `POST /auth/login` após 10 erros consecutivos.

---

## Referências

1. JONES, M.; BRADLEY, J.; SAKIMURA, N. **RFC 7519: JSON Web Token (JWT)**. Internet Engineering Task Force (IETF), 2015. Disponível em: <https://datatracker.ietf.org/doc/html/rfc7519>. Acesso em: 09 nov. 2026.
2. JONES, M.; HARDT, D. **RFC 6750: The OAuth 2.0 Authorization Framework — Bearer Token Usage**. Internet Engineering Task Force (IETF), 2012. Disponível em: <https://datatracker.ietf.org/doc/html/rfc6750>. Acesso em: 09 nov. 2026.
3. HARDT, D. (Ed.). **RFC 6749: The OAuth 2.0 Authorization Framework**. Internet Engineering Task Force (IETF), 2012. Disponível em: <https://datatracker.ietf.org/doc/html/rfc6749>. Acesso em: 09 nov. 2026.
4. NATIONAL INSTITUTE OF STANDARDS AND TECHNOLOGY (NIST). **Special Publication 800-63B: Digital Identity Guidelines — Authentication and Lifecycle Management**. U.S. Department of Commerce, 2020. Disponível em: <https://pages.nist.gov/800-63-3/sp800-63b.html>. Acesso em: 09 nov. 2026.
5. PROVOST, N.; MAZIERES, D. **A Future-Adaptable Password Scheme (bcrypt)**. In: Proceedings of the USENIX Annual Technical Conference, FREENIX Track, 1999. Disponível em: <https://www.usenix.org/legacy/event/usenix99/provos/provos.pdf>. Acesso em: 09 nov. 2026.
6. OWASP FOUNDATION. **Authentication Cheat Sheet**. OWASP Cheat Sheet Series, 2026. Disponível em: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>. Acesso em: 09 nov. 2026.
7. OWASP FOUNDATION. **Password Storage Cheat Sheet**. OWASP Cheat Sheet Series, 2026. Disponível em: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>. Acesso em: 09 nov. 2026.
8. OWASP FOUNDATION. **JSON Web Token Cheat Sheet for Node.js and Web Applications**. OWASP Cheat Sheet Series, 2026. Disponível em: <https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html>. Acesso em: 09 nov. 2026.
9. OWASP FOUNDATION. **Cross-Site Scripting (XSS) Prevention Cheat Sheet**. OWASP Cheat Sheet Series, 2026. Disponível em: <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>. Acesso em: 09 nov. 2026.
10. OWASP FOUNDATION. **Top 10:2021 — A01:2021 Broken Access Control & A07:2021 Identification and Authentication Failures**. OWASP, 2021. Disponível em: <https://owasp.org/Top10/>. Acesso em: 09 nov. 2026.
11. MDN WEB DOCS. **401 Unauthorized & 403 Forbidden HTTP Status Codes**. Mozilla Foundation, 2026. Disponível em: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401>. Acesso em: 09 nov. 2026.
12. MDN WEB DOCS. **Using HTTP Cookies — Secure and HttpOnly flags**. Mozilla Foundation, 2026. Disponível em: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies>. Acesso em: 09 nov. 2026.
13. EXPRESS.JS. **Error Handling & Writing Middleware in Express 5**. OpenJS Foundation, 2026. Disponível em: <https://expressjs.com/en/guide/error-handling.html>. Acesso em: 09 nov. 2026.
14. PRISMA. **Prisma Client: Excluding Fields with Omit & SQLite Relations**. Prisma Data, Inc., 2026. Disponível em: <https://www.prisma.io/docs/orm/prisma-client/queries/excluding-fields>. Acesso em: 09 nov. 2026.
15. AUTH0 BY OKTA. **Introduction to JSON Web Tokens & Debugger**. 2026. Disponível em: <https://jwt.io/introduction>. Acesso em: 09 nov. 2026.
16. NPM. **jsonwebtoken & bcryptjs Packages Documentation**. 2026. Disponível em: <https://www.npmjs.com/package/jsonwebtoken> e <https://www.npmjs.com/package/bcryptjs>. Acesso em: 09 nov. 2026.
