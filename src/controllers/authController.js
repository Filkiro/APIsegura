import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { gerarToken } from "../lib/jwt.js";

// Fator de custo do bcrypt: 10 significa 2^10 (1024) iterações internas.
// O salt aleatório é gerado na hora e já fica gravado dentro da própria string do hash ($2a$10$...).
const CUSTO_BCRYPT = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Truque de segurança contra Timing Attacks (ataques de tempo):
// Se alguém tentar logar com um e-mail que nem existe, comparamos a senha com esse hash falso.
// Assim a resposta demora exatamente os mesmos milissegundos e ninguém descobre quais e-mails existem no sistema.
const HASH_FALSO = bcrypt.hashSync("senha-falsa-para-igualar-tempo", CUSTO_BCRYPT);

// POST /auth/register (rota pública de cadastro de leitores)
export async function registrar(req, res) {
  const { nome, email, senha } = req.body ?? {};

  // Validação básica dos dados que vieram na requisição
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Nome, e-mail e senha são obrigatórios." });
  }
  if (typeof nome !== "string" || typeof email !== "string" || typeof senha !== "string") {
    return res.status(400).json({ erro: "Os campos nome, e-mail e senha devem ser texto." });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ erro: "Formato de e-mail inválido." });
  }
  // Requisito do trabalho: senha com no mínimo 6 caracteres
  if (senha.length < 6) {
    return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const emailLimpo = email.trim().toLowerCase();

  // Garante que o e-mail não seja cadastrado duas vezes (cenário T2 -> 409)
  const existente = await prisma.user.findUnique({ where: { email: emailLimpo } });
  if (existente) {
    return res.status(409).json({ erro: "Este e-mail já está cadastrado no sistema." });
  }

  // Aqui a senha vira hash com salt antes de salvar no banco
  // Nota: mesmo se alguém mandar "role: ADMIN" no body, a gente ignora. Todo leitor nasce USER.
  const hash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  const usuario = await prisma.user.create({
    data: {
      nome: nome.trim(),
      email: emailLimpo,
      password: hash,
    },
    // Requisito R9: a senha em hash NUNCA volta na resposta da API
    omit: { password: true },
  });

  return res.status(201).json(usuario);
}

// POST /auth/login (rota pública de autenticação que emite o JWT)
export async function login(req, res) {
  const { email, senha } = req.body ?? {};

  if (typeof email !== "string" || typeof senha !== "string" || !email || !senha) {
    return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
  }

  // Busca o usuário pelo e-mail
  const usuario = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // Compara a senha informada com o hash salvo (ou com o hash falso se o usuário não existir)
  const senhaCorreta = await bcrypt.compare(senha, usuario ? usuario.password : HASH_FALSO);

  // Recomendação OWASP: mensagem genérica pra não dar pistas se o erro foi no e-mail ou na senha
  if (!usuario || !senhaCorreta) {
    return res.status(401).json({ erro: "E-mail ou senha inválidos." });
  }

  // Gera o token JWT com sub, role e tempo de expiração
  const token = gerarToken(usuario);
  return res.status(200).json({
    token,
    tipo: "Bearer",
    expiraEm: process.env.JWT_EXPIRES_IN || "1h",
  });
}

// GET /auth/me (rota protegida: devolve os dados de quem está logado)
export async function me(req, res) {
  // O id do usuário vem do token verificado (req.usuario.id), colocado pelo middleware autenticar
  const usuario = await prisma.user.findUnique({
    where: { id: req.usuario.id },
    omit: { password: true }, // Nunca devolvemos a senha
  });

  if (!usuario) {
    return res.status(401).json({ erro: "Usuário do token não foi encontrado." });
  }

  return res.json(usuario);
}

// EXTRA: PATCH /auth/senha (permite ao leitor trocar a senha conferindo a atual)
export async function trocarSenha(req, res) {
  const { senhaAtual, novaSenha } = req.body ?? {};

  if (typeof senhaAtual !== "string" || typeof novaSenha !== "string" || !senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: "Informe a senha atual e a nova senha." });
  }
  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: "A nova senha deve ter no mínimo 6 caracteres." });
  }

  const usuario = await prisma.user.findUnique({ where: { id: req.usuario.id } });
  if (!usuario) {
    return res.status(401).json({ erro: "Usuário não encontrado." });
  }

  // Confere se o usuário acertou a senha antiga antes de autorizar a mudança
  const confere = await bcrypt.compare(senhaAtual, usuario.password);
  if (!confere) {
    return res.status(401).json({ erro: "A senha atual está incorreta." });
  }

  // Gera o novo hash e atualiza no banco
  const hash = await bcrypt.hash(novaSenha, CUSTO_BCRYPT);
  await prisma.user.update({
    where: { id: usuario.id },
    data: { password: hash },
  });

  return res.json({ mensagem: "Senha alterada com sucesso!" });
}
