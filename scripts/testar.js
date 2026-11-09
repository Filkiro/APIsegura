// Script automatizado de testes da API Biblioteca.
// Ele executa toda a bateria oficial de testes (cenários T1 a T10 da rubrica do PDF),
// além de testes extras de segurança como cabeçalhos inválidos, assinaturas forjadas e rate limit.

const BASE = process.env.BASE_URL || "http://localhost:3000";

// Função utilitária para fazer requisições HTTP e converter a resposta para JSON
async function req(metodo, caminho, { token, body, headers } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;

  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await r.json();
  } catch {
    // Tratamento para respostas sem corpo (ex.: 204 No Content)
  }
  return { status: r.status, json };
}

const resultados = [];
function checar(id, descricao, obtido, esperado, extra = true) {
  const ok = obtido === esperado && extra;
  resultados.push({ id, descricao, esperado, obtido, ok });
}

// Faz login com uma das contas do seed e retorna o token JWT
async function logar(email) {
  const r = await req("POST", "/auth/login", { body: { email, senha: "Senha123" } });
  if (r.status !== 200) {
    throw new Error(`O login com ${email} falhou (status ${r.status}). Você executou o comando 'npm run seed'?`);
  }
  return r.json.token;
}

async function main() {
  console.log("Iniciando a suíte de testes da Biblioteca...\n");

  // Autenticação prévia dos usuários de teste do seed
  const tokenAdmin = await logar("admin@biblioteca.com");
  const tokenAna = await logar("ana@biblioteca.com");

  // --- Bateria Oficial de Testes do PDF (T1 a T10) ---

  // T1: Cadastro com sucesso (a senha nunca deve vir no JSON)
  let r = await req("POST", "/auth/register", {
    body: { nome: "Leitor Teste", email: `teste${Date.now()}@biblioteca.com`, senha: "segredo123" },
  });
  checar("T1", "Cadastro válido (resposta 201 sem campo de senha)", r.status, 201, r.json && !("password" in r.json));

  // T2: Tentativa de cadastrar o mesmo e-mail duas vezes
  r = await req("POST", "/auth/register", {
    body: { nome: "Repetido", email: "ana@biblioteca.com", senha: "segredo123" },
  });
  checar("T2", "Cadastro com e-mail repetido (esperado: 409 Conflict)", r.status, 409);

  // T3: Tentativa de login errando a senha
  r = await req("POST", "/auth/login", { body: { email: "ana@biblioteca.com", senha: "senha-errada" } });
  checar("T3", "Login com senha incorreta (esperado: 401 Unauthorized)", r.status, 401);

  // T4: Acesso a rota protegida sem enviar o token
  r = await req("GET", "/auth/me");
  checar("T4", "Rota protegida sem token (esperado: 401)", r.status, 401);

  // T5: Acesso a rota protegida enviando token válido
  r = await req("GET", "/auth/me", { token: tokenAna });
  checar("T5", "Rota protegida com token válido (esperado: 200 OK)", r.status, 200);

  // T6: Criar recurso tentando forjar o leitorId no corpo da requisição (deve ser ignorado)
  r = await req("POST", "/emprestimos", {
    token: tokenAna,
    body: { livroId: 1, leitorId: 99 },
  });
  checar("T6", "Criar empréstimo mandando leitorId no body (ignorado, usa id 2 do token)", r.status, 201, r.json?.leitorId === 2);

  // T7: Leitor tentando alterar empréstimo de outro leitor (Empréstimo 2 pertence ao Bruno, Ana não pode mexer)
  r = await req("PUT", "/emprestimos/2", { token: tokenAna, body: { devolvido: true } });
  checar("T7", "USER alterando empréstimo de outro USER (esperado: 403 Forbidden)", r.status, 403);

  // T8: Leitor comum tentando acessar rota administrativa
  r = await req("GET", "/users", { token: tokenAna });
  checar("T8", "USER tentando acessar rota de ADMIN (esperado: 403 Forbidden)", r.status, 403);

  // T9: Administrador acessando rota administrativa
  r = await req("GET", "/users", { token: tokenAdmin });
  checar("T9", "ADMIN acessando rota de ADMIN (esperado: 200 OK)", r.status, 200);

  // T10: Recurso inexistente (deve retornar 404 ANTES de checar qualquer permissão 403)
  r = await req("PUT", "/emprestimos/9999", { token: tokenAna, body: { devolvido: true } });
  checar("T10", "Recurso inexistente (esperado: 404 antes de 403)", r.status, 404);

  // --- Testes Extras de Segurança ---

  // E1: Cabeçalho sem a palavra 'Bearer'
  r = await req("GET", "/auth/me", { headers: { Authorization: tokenAna } });
  checar("E1", "Header sem o formato 'Bearer' (esperado: 401)", r.status, 401);

  // E2: Token com assinatura adulterada (modificamos o final da string)
  r = await req("GET", "/auth/me", { token: tokenAna.slice(0, -2) + "xx" });
  checar("E2", "Token com assinatura adulterada (esperado: 401)", r.status, 401);

  // E3: Isolamento no GET /emprestimos: a Ana só deve ver os registros pertencentes a ela
  r = await req("GET", "/emprestimos", { token: tokenAna });
  const todosSaoDaAna = Array.isArray(r.json) && r.json.every((e) => e.leitorId === 2);
  checar("E3", "USER no GET /emprestimos recebe apenas seus próprios registros", r.status, 200, todosSaoDaAna);

  // E4: O ADMIN no GET /emprestimos deve conseguir auditar os registros de todos os leitores
  r = await req("GET", "/emprestimos", { token: tokenAdmin });
  const adminVeMultiplos = Array.isArray(r.json) && r.json.length >= 2;
  checar("E4", "ADMIN no GET /emprestimos visualiza empréstimos de todos os usuários", r.status, 200, adminVeMultiplos);

  // E5 e E6: Troca de senha conferindo a senha atual
  r = await req("PATCH", "/auth/senha", {
    token: tokenAna,
    body: { senhaAtual: "SenhaIncorreta", novaSenha: "NovaSenha123" },
  });
  checar("E5", "Troca de senha com senha atual errada (esperado: 401)", r.status, 401);

  r = await req("PATCH", "/auth/senha", {
    token: tokenAna,
    body: { senhaAtual: "Senha123", novaSenha: "NovaSenha123" },
  });
  checar("E6", "Troca de senha informando a senha correta (esperado: 200)", r.status, 200);

  // Reverte a senha da Ana para 'Senha123' para não quebrar testes posteriores
  await req("PATCH", "/auth/senha", {
    token: tokenAna,
    body: { senhaAtual: "NovaSenha123", novaSenha: "Senha123" },
  });

  // E7: Teste opcional do limite de tentativas de login (acionado com a flag --limite)
  if (process.argv.includes("--limite")) {
    let ultimo = 0;
    for (let i = 0; i < 11; i++) {
      ultimo = (await req("POST", "/auth/login", { body: { email: "ana@biblioteca.com", senha: "x" } })).status;
    }
    checar("E7", "Bloqueio de força bruta por rate limit na 11ª tentativa (esperado: 429)", ultimo, 429);
  }

  // Exibe a tabela formatada com os resultados
  console.table(
    resultados.map((x) => ({
      ID: x.id,
      Cenário: x.descricao,
      Esperado: x.esperado,
      Obtido: x.obtido,
      Situação: x.ok ? "APROVADO" : "REPROVADO",
    }))
  );

  const falhas = resultados.filter((x) => !x.ok).length;
  if (falhas === 0) {
    console.log("\nTodos os testes passaram com sucesso!");
    process.exit(0);
  } else {
    console.error(`\nAtenção: ${falhas} teste(s) falharam.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Erro durante a execução dos testes:", e.message);
  process.exit(1);
});
