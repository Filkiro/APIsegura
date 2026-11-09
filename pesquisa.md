# Pesquisa

**Grupo:** Filipe Gomes, João Miguel, Arthur Chave - 3º AI - ETECAMP  
**Tema Escolhido:** Tema 1 — Biblioteca  
**Recurso Principal:** `Emprestimo` (livro, leitor e datas), associado diretamente ao usuário leitor.

---

## A. Fundamentos

### 1. Autenticação × autorização
A **autenticação** é o mecanismo responsável por verificar e atestar a identidade de uma pessoa ou sistema que tenta acessar a aplicação, respondendo à pergunta essencial: *"Quem é você?"*. Já a **autorização** é o processo subsequente que afere se esse usuário previamente identificado detém privilégios suficientes para executar uma determinada operação sobre um recurso, respondendo à pergunta: *"O que você pode fazer?"*. Na nossa API de Biblioteca, a autenticação ocorre no endpoint `POST /auth/login`: o leitor envia seu e-mail e senha cadastrados e, caso as credenciais sejam verídicas, recebe um token JWT assinado. A autorização manifesta-se, por exemplo, quando o leitor tenta cadastrar uma nova obra literária via `POST /livros` ou promover outro usuário por `PATCH /users/:id/role`: mesmo estando legitimamente autenticado no sistema, a API bloqueia a requisição porque o seu perfil é `USER`, enquanto essas ações administrativas são reservadas com exclusividade ao papel `ADMIN`.
Quando a autenticação falha (ausência de token, cabeçalho mal formatado ou credenciais incorretas), o servidor retorna o código **401 Unauthorized**, cujo propósito semântico é sinalizar que a requisição carece de credenciais de autenticação válidas. Quando a autorização falha (um usuário autenticado tentando acessar uma funcionalidade restrita de outro perfil ou tentando alterar um empréstimo de outro leitor), o servidor retorna o código **403 Forbidden**, indicando que o servidor reconhece perfeitamente a identidade do solicitante, mas a política de segurança da aplicação proíbe formalmente a concessão do acesso àquele recurso.

### 2. Stateful × stateless
Na abordagem **stateful** (adotada tradicionalmente por sessões em servidores com `$_SESSION` no PHP), o servidor aloca um registro de estado em memória volátil ou em banco de dados para cada cliente conectado e envia ao navegador apenas um identificador de sessão (Session ID) gravado em cookie. A principal **vantagem** do modelo stateful reside no controle imediato do ciclo de vida: o servidor pode revogar qualquer sessão instantaneamente no ato do logout ou em caso de comprometimento da conta. A contrapartida e maior **desvantagem** é a limitação de escalabilidade horizontal e o consumo permanente de memória no servidor, exigindo arquiteturas complexas de sincronização de sessão (como clusters de Redis) quando a aplicação é distribuída entre múltiplos nós de computação.
Em oposição, a arquitetura **stateless** (adotada na nossa API por meio de tokens JWT) desonera totalmente o servidor do armazenamento de estados de sessão. Todas as informações imprescindíveis para validar o leitor (`sub` e `role`) viajam embutidas e assinadas dentro do próprio token a cada requisição HTTP nos cabeçalhos. A grande **vantagem** é o desacoplamento e a alta capacidade de escala, pois qualquer réplica do backend consegue validar a requisição de forma autônoma apenas verificando a integridade criptográfica da assinatura com a `JWT_SECRET`, sem overhead de consulta ao banco de dados. A principal **desvantagem** é a dificuldade intrínseca de revogação pontual: enquanto a data de validade (`exp`) não expirar, o token continua matematicamente válido, o que exige a estipulação de tempos curtos de expiração para diminuir a janela de exposição a riscos.

### 3. Hash × criptografia × encoding
Embora operem transformações sobre cadeias de caracteres, estes três conceitos têm objetivos e propriedades técnicas completamente distintos:
- **Encoding (Codificação):** Trata-se de uma conversão reversível de formato, desprovida de qualquer finalidade de sigilo ou confidencialidade, utilizada exclusivamente para garantir que dados binários possam transitar com segurança por protocolos que aceitam apenas texto (como URLs e cabeçalhos HTTP). Não utiliza chaves e qualquer pessoa consegue decodificá-lo de imediato (ex.: Base64URL);
- **Criptografia:** É uma transformação bidirecional concebida especificamente para confidencialidade, onde um texto legível é transformado em texto cifrado por meio de um algoritmo matemático alimentado por uma chave secreta. O dado só pode ser recuperado por quem possuir a chave de decifragem correspondente (simétrica ou assimétrica);
- **Hash:** É uma transformação unidirecional de mão única (*one-way cryptographic digest*) que processa uma entrada de tamanho variável e produz uma saída de comprimento fixo. É matematicamente e computacionalmente inviável reverter o resultado para obter a entrada original.
Para a guarda de **senhas** na nossa API, utilizamos exclusivamente o **hash criptográfico com algoritmo lento (bcrypt)**, garantindo que mesmo diante de um vazamento acidental do banco `dev.db`, o texto original das senhas dos leitores nunca possa ser lido diretamente. Já no **header e no payload do JWT**, o método aplicado é a simples **codificação (encoding Base64URL)**. Isso evidencia que o conteúdo interno do token não é confidencial nem criptografado — qualquer pessoa pode inspecioná-lo no jwt.io. A confiabilidade do JWT decorre unicamente de sua **assinatura digital**, que assegura a integridade inalterada do conteúdo.

### 4. bcrypt e salt
Funções de espalhamento como MD5 e SHA-256 foram concebidas na computação para processamento ultrarrápido na checagem de integridade de grandes volumes de dados. Contudo, essa extrema velocidade torna-se uma vulnerabilidade gravíssima quando aplicada a senhas: equipamentos modernos equipados com GPUs de alto desempenho conseguem computar centenas de bilhões de hashes por segundo, viabilizando ataques maciços de dicionário e tabelas de consulta reversa (*Rainbow Tables*). O algoritmo **bcrypt** é mundialmente recomendado porque é intencionalmente **lento, custoso em memória e adaptável ao tempo**.
O parâmetro de **custo** (work factor, configurado em nosso projeto como 10 na constante `CUSTO_BCRYPT`) define que o algoritmo realizará $2^{10} = 1024$ iterações de derivação interna; cada unidade somada ao custo dobra o tempo de cálculo da CPU, permitindo que a aplicação acompanhe o avanço do poder computacional futuro sem necessitar de alteração de biblioteca. O **salt** é uma sequência de bytes pseudoaleatórios e criptograficamente seguros gerada individualmente para cada usuário no instante da criação de sua senha. Ele é fundido à senha antes do hash, garantindo que dois leitores cadastrados com a mesmíssima senha (como `Senha123`) gerem saídas em hash inteiramente divergentes no banco de dados. O bcrypt embute tanto o custo quanto o salt dentro da própria string gerada (`$2a$10$...`), simplificando a persistência no banco SQLite.

---

## B. JWT (JSON Web Token)

### 5. Estrutura
O padrão internacional RFC 7519 estabelece que o JSON Web Token é uma cadeia compacta dividida em três partes distintas, codificadas e concatenadas por pontos (`.`):
1. **Header (Cabeçalho):** Objeto JSON codificado em Base64URL que detalha o tipo do objeto (`"typ": "JWT"`) e o algoritmo de criptografia simétrica aplicado na assinatura (`"alg": "HS256"`);
2. **Payload (Carga Útil):** Objeto JSON codificado em Base64URL que armazena o conjunto de declarações de identidade denominadas *claims*, contendo identificadores e metadados contextuais da sessão do usuário;
3. **Signature (Assinatura):** Hash criptográfico calculado pela aplicação do algoritmo HMAC-SHA256 sobre a concatenação do header codificado e do payload codificado, utilizando a chave mestra secreta (`JWT_SECRET`) privada do servidor.

Apresentamos abaixo a representação textual de um token JWT autêntico emitido pela nossa API para a leitora Ana (`sub: "2"`, `role: "USER"`):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiVVNFUiIsImlhdCI6MTc5NDI2MTQyMiwiZXhwIjoxNzk0MjY1MDIyLCJzdWIiOiIyIn0.EIUxZK8_pArYS3NNHn1mGjD1Nq82qXhbMJRIgF9EKo8
```

Ao submeter esse token à ferramenta oficial de decodificação **jwt.io**, revelam-se as seções estruturais decodificadas:
```json
// HEADER: METADADOS TÉCNICOS
{
  "alg": "HS256",
  "typ": "JWT"
}

// PAYLOAD: CLAIMS DE IDENTIDADE
{
  "role": "USER",
  "iat": 1794261422,
  "exp": 1794265022,
  "sub": "2"
}
```

### 6. Claims
Na terminologia de segurança da RFC 7519, *claims* são asserções estruturadas transmitidas no corpo do token. As três claims registradas mais relevantes são:
- **`sub` (Subject):** Declara o sujeito ou entidade principal a quem o token pertence. Em nossa API, carrega o identificador primário do usuário (ex.: `"2"` para a leitora Ana), servindo de referência primária para a atribuição de titularidade nos empréstimos;
- **`iat` (Issued At):** Registra o exato carimbo de data/hora (formato UNIX Epoch em segundos) no qual o token foi emitido pela biblioteca `jsonwebtoken`;
- **`exp` (Expiration Time):** Define o exato segundo UNIX a partir do qual o token perde irrevogavelmente a validade técnica e deve ser sumariamente recusado.
Nosso grupo inseriu deliberadamente apenas as claims **`sub`** e **`role`** (`USER` ou `ADMIN`), juntamente com `iat` e `exp`. Essa estratégia de payload mínimo provê as informações estritamente necessárias para que as camadas de verificação decidam o acesso sem sobrecarregar a largura de banda de rede. O payload **jamais deve conter** senhas, hashes, chaves privadas ou dados pessoais confidenciais, já que a codificação Base64URL pode ser revertida de forma trivial por qualquer agente que intercepte a requisição em trânsito.

### 7. Assinatura
A assinatura de um JWT provê as garantias de **integridade de dados** e **autenticidade da fonte**. Ela é computada através da função criptográfica `HMAC-SHA256(Base64URL(Header) + "." + Base64URL(Payload), JWT_SECRET)`. Se um leitor tentar praticar uma elevação ilegítima de privilégios e alterar manualmente a propriedade `"role": "USER"` para `"role": "ADMIN"` em seu token, a assinatura original deixa imediatamente de conferir com o conteúdo recém-alterado. Como o invasor não tem conhecimento da chave `JWT_SECRET` armazenada de forma confidencial no servidor, ele é incapaz de calcular uma assinatura matemática válida correspondente ao payload alterado, e qualquer requisição adulterada será rejeitada.
A diferença prática e conceitual entre as funções da biblioteca é nítida:
- **`jwt.decode(token)`:** Realiza apenas a leitura e desserialização mecânica das seções em Base64URL, sem processar **nenhuma checagem criptográfica**. Trata-se de uma função cega que aceitaria inclusive tokens deliberadamente forjados por terceiros;
- **`jwt.verify(token, segredo)`:** Recalcula a assinatura utilizando a chave mestra, compara byte a byte com a assinatura do token e valida se o instante atual não ultrapassou o tempo estipulado em `exp`. Se a assinatura divergir ou o prazo expirar, a função dispara uma exceção imediata. Por essa razão, nosso middleware `autenticar` executa estritamente o `verify` encapsulado em um bloco `try/catch` para responder com status 401 controlado.

### 8. Validade e logout
Em uma arquitetura autenticada por token puramente stateless, o servidor não possui controle ativo de sessões em memória; por consequência, uma vez emitido, o token mantém validade matemática incontestável até o alcance de seu tempo de expiração (`exp`). A realização do logout na interface do cliente constitui uma ação estritamente circunscrita ao front-end, que simplesmente elimina o token armazenado no `localStorage`. Similarmente, se um administrador alterar a função de um usuário comum para administrador (`PATCH /users/:id/role`), o token previamente emitido que se encontra em posse do leitor continuará contendo a claim estática `"role": "USER"`, forçando-o a efetuar novo login para que uma credencial atualizada seja cunhada.
Para mitigar os riscos dessa característica, estabelecemos uma validade comedida de **1 hora** (`JWT_EXPIRES_IN="1h"`). O padrão de **Refresh Token** soluciona esse desafio ao arquitetar a emissão de duas credenciais: um *Access Token* de curta durabilidade (ex.: 5 a 15 minutos) utilizado no tráfego ordinário das rotas, e um *Refresh Token* de longa durabilidade (ex.: 15 a 30 dias) gravado em local protegido e indexado no banco de dados. À medida que o access token expira, a aplicação cliente apresenta o refresh token ao servidor para renovar o acesso de forma transparente. Caso a conta precise ser revogada ou ocorra o encerramento voluntário da sessão, o servidor deleta o refresh token de sua base, inviabilizando renovações subsequentes.

---

## C. Segurança na Prática

### 9. Onde guardar o token
A definição do armazenamento do token no ecossistema do navegador envolve ponderações técnicas entre simplicidade de desenvolvimento e vetores de exploração:
- **localStorage:** Apresenta grande facilidade de leitura e escrita direta via código JavaScript (`localStorage.setItem/getItem`), entretanto é completamente devassável diante de vulnerabilidades de **XSS (Cross-Site Scripting)**, permitindo que scripts maliciosos capturem a credencial e a transmitam silenciosamente a servidores externos;
- **Cookie com diretiva HttpOnly:** O atributo `HttpOnly` orienta o motor do navegador a bloquear qualquer tentativa de leitura do cookie por meio de código JavaScript na página, neutralizando a exfiltração de credenciais via XSS. No entanto, pelo fato de o navegador despachar automaticamente os cookies em todas as requisições direcionadas ao domínio de origem, a aplicação passa a ser alvo de ataques de **CSRF (Cross-Site Request Forgery)**, exigindo a adoção de controles estritos com flags `SameSite=Strict` e tokens de verificação anti-CSRF.
O ataque **XSS** caracteriza-se pela injeção e execução não autorizada de scripts arbitrários no contexto do usuário legítimo. O ataque **CSRF** ocorre quando um site hostil induz o navegador do usuário autenticado a despachar requisições não intencionais para uma aplicação de destino. Nossa API exige o encaminhamento deliberado do cabeçalho `Authorization: Bearer <token>`, o que previne solicitações forjadas oriundas de formulários automáticos de CSRF.

### 10. Chave secreta
A variável `JWT_SECRET` é mantida resguardada no arquivo confidencial `.env` para atender ao consagrado princípio de isolamento estrito entre a configuração sensível de segurança e o código-fonte da aplicação (*The Twelve-Factor App*). Dessa forma, o repositório público versionado no Git contém unicamente o arquivo modelo `.env.example` preenchido com dados fictícios, enquanto o arquivo `.env` verdadeiro permanece ignorado pelo controle de versão por meio da diretiva correspondente no `.gitignore`.
Caso a chave secreta fosse commitada de forma descuidada no GitHub, robôs de monitoramento automatizado e cibercriminosos a detectariam em questão de minutos. De posse da `JWT_SECRET`, qualquer invasor adquire o poder computacional de emitir, assinar e autenticar tokens JWT arbitrários com privilégios de `ADMIN` (`sub: 1`), assumindo o controle irrestrito sobre todo o banco de dados da biblioteca sem necessitar de senhas. A contenção para esse desastre exigiria a revogação instantânea da chave mediante geração de novo segredo aleatório (o que invalidaria sumariamente todas as sessões legítimas ativas no sistema), aliada à reescrita profunda do histórico do Git para extirpar vestígios da credencial exposta.

### 11. RBAC e dono do recurso
O **RBAC (Role-Based Access Control)** restringe as operações com base nas prerrogativas corporativas associadas ao papel formal ocupado pelo usuário. Em nossa aplicação, distinguimos os papéis `ADMIN` e `USER`. O RBAC é implementado de forma modular no middleware `autorizar(...perfis)` em `src/middlewares/autorizar.js`, sendo empregado nas rotas administrativas do catálogo em `src/routes/livroRoutes.js` (criação, edição e exclusão de obras) e de governança em `src/routes/userRoutes.js` (auditoria de usuários e promoção de papéis).
Por outro lado, o **controle por dono do recurso (Ownership Pattern)** fundamenta-se na relação jurídica de posse estabelecida entre um usuário e um determinado registro de dado. Na nossa API, esse princípio rege o recurso central `Emprestimo` e está corporificado na rotina `carregarComPermissao` em `src/controllers/emprestimoController.js`: ao manipular um empréstimo específico (`PUT` ou `DELETE` em `/emprestimos/:id`), a API certifica-se primeiramente de que o recurso existe (garantindo **404 antes de 403**) e, em seguida, valida se `emprestimo.leitorId === req.usuario.id`. Primordialmente, o identificador do leitor é obtido diretamente a partir do payload autenticado do token (`req.usuario.id`), sendo terminantemente descartado qualquer valor forjado que seja encaminhado no corpo da requisição.

### 12. OWASP
Ao consultar os referenciais de engenharia de segurança da OWASP (*Open Web Application Security Project*), incorporamos duas recomendações fundamentais na arquitetura da biblioteca:
1. **Armazenamento Seguro de Credenciais (OWASP Password Storage Cheat Sheet):** A diretriz adverte categoricamente contra funções de espalhamento tradicionais e impõe a adoção de algoritmos dotados de fator de trabalho adaptativo e salting único, destacando o bcrypt com fator de custo mínimo de 10. **Nosso projeto obedece rigorosamente a este preceito:** integramos a biblioteca `bcryptjs` com custo calibrado em 10 (`CUSTO_BCRYPT = 10`), anulando o uso de senhas legíveis no banco SQLite e mitigando ataques acelerados por hardware;
2. **Respostas Genéricas contra Enumeração de Contas (OWASP Authentication Cheat Sheet):** A norma preconiza que o processo de autenticação não deve sugerir se uma eventual rejeição resultou de usuário inexistente ou de senha errônea. **Nosso projeto atende com plenitude:** o endpoint `POST /auth/login` devolve a mensagem invariável `"E-mail ou senha inválidos."` e executa um hash sentinela (`HASH_FALSO`) quando o e-mail não é localizado, equalizando os milissegundos de processamento e neutralizando ataques de temporização (*Timing Attacks*). Adicionalmente, prevenimos abusos de força bruta com `express-rate-limit` (limite de 10 falhas por IP a cada 15 minutos).

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
