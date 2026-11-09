import { prisma } from "../lib/prisma.js";

// Relações que trazemos juntas nas consultas para exibir o nome do leitor e o título do livro
const incluirRelacoes = {
  leitor: { select: { id: true, nome: true } },
  livro: { select: { id: true, titulo: true, autor: true } },
};

// Função simples para converter e validar se o :id da URL é um número inteiro válido
function lerId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Valida os campos recebidos no corpo da requisição (body)
function validarCorpo(body, parcial = false) {
  const { livroId, dataDevolucao, devolvido } = body ?? {};
  const dados = {};

  if (!parcial) {
    if (!livroId || !Number.isInteger(Number(livroId)) || Number(livroId) <= 0) {
      return { erro: "O campo livroId é obrigatório e precisa ser um número inteiro positivo." };
    }
    dados.livroId = Number(livroId);
  }

  if (dataDevolucao !== undefined) {
    const data = new Date(dataDevolucao);
    if (isNaN(data.getTime())) {
      return { erro: "O campo dataDevolucao deve ser uma data válida no padrão ISO 8601." };
    }
    dados.dataDevolucao = data;
  }

  if (devolvido !== undefined) {
    if (typeof devolvido !== "boolean") {
      return { erro: "O campo devolvido deve ser verdadeiro (true) ou falso (false)." };
    }
    dados.devolvido = devolvido;
  }

  return { dados };
}

// GET /emprestimos
// Atende à regra da Tabela 4 do PDF: se quem chamou for ADMIN, vê os empréstimos de todo mundo;
// se for USER (leitor), a consulta filtra automaticamente apenas os dele.
export async function listar(req, res) {
  const ehAdmin = req.usuario.role === "ADMIN";
  const where = ehAdmin ? {} : { leitorId: req.usuario.id };
  const emprestimos = await prisma.emprestimo.findMany({
    where,
    include: incluirRelacoes,
    orderBy: { id: "asc" },
  });
  res.json(emprestimos);
}

// GET /emprestimos/meus (atalho explícito para o leitor consultar apenas os seus registros)
export async function listarMeus(req, res) {
  const emprestimos = await prisma.emprestimo.findMany({
    where: { leitorId: req.usuario.id },
    include: incluirRelacoes,
    orderBy: { id: "asc" },
  });
  res.json(emprestimos);
}

export const listarTodos = listar;

// GET /emprestimos/:id (busca um empréstimo pelo ID)
export async function buscar(req, res) {
  const id = lerId(req);
  if (!id) return res.status(400).json({ erro: "ID do empréstimo inválido." });

  const emprestimo = await prisma.emprestimo.findUnique({
    where: { id },
    include: incluirRelacoes,
  });

  // 404 antes de 403: se não existir no banco, já responde 404 aqui
  if (!emprestimo) return res.status(404).json({ erro: "Empréstimo não encontrado." });

  // Regra do dono: se você não for o dono do empréstimo e não for ADMIN, acesso negado
  const ehDono = emprestimo.leitorId === req.usuario.id;
  const ehAdmin = req.usuario.role === "ADMIN";
  if (!ehDono && !ehAdmin) {
    return res.status(403).json({ erro: "Você só pode visualizar os seus próprios empréstimos." });
  }

  res.json(emprestimo);
}

// POST /emprestimos (o leitor solicita a retirada de um livro)
export async function criar(req, res) {
  const { dados, erro } = validarCorpo(req.body);
  if (erro) return res.status(400).json({ erro });

  // 1. Verifica se o livro existe e busca quantos empréstimos dele ainda estão em andamento
  const livro = await prisma.livro.findUnique({
    where: { id: dados.livroId },
    include: {
      emprestimos: {
        where: { devolvido: false },
        select: { id: true, leitorId: true },
      },
    },
  });
  if (!livro) return res.status(404).json({ erro: "Livro não encontrado no acervo." });

  // 2. Regra de negócio: o mesmo leitor não pode retirar duas cópias do mesmo livro ao mesmo tempo
  const jaTemLivro = livro.emprestimos.some((e) => e.leitorId === req.usuario.id);
  if (jaTemLivro) {
    return res.status(400).json({
      erro: "Você já está com este livro emprestado. Faça a devolução antes de retirar outro exemplar.",
    });
  }

  // 3. Controle de estoque: verifica se ainda há exemplares físicos disponíveis na estante
  const exemplaresEmprestados = livro.emprestimos.length;
  if (exemplaresEmprestados >= livro.quantidade) {
    return res.status(400).json({
      erro: "Todos os exemplares deste livro já estão emprestados no momento.",
    });
  }

  // Requisito crucial R8 e teste T6: o leitorId vem SEMPRE de req.usuario.id (extraído do token JWT).
  // Mesmo que alguém mande "leitorId: 99" no JSON, o valor é ignorado e não tem como fraudar.
  const emprestimo = await prisma.emprestimo.create({
    data: { ...dados, leitorId: req.usuario.id },
    include: incluirRelacoes,
  });

  res.status(201).json(emprestimo);
}

// Função auxiliar da regra do dono: carrega o empréstimo e confere se quem chamou tem direito
// Segue rigorosamente a ordem do PDF: valida 404 (se o registro existe) ANTES de checar o 403 (permissão)
async function carregarComPermissao(req, res) {
  const id = lerId(req);
  if (!id) {
    res.status(400).json({ erro: "ID do empréstimo inválido." });
    return null;
  }

  const emprestimo = await prisma.emprestimo.findUnique({ where: { id } });
  if (!emprestimo) {
    res.status(404).json({ erro: "Empréstimo não encontrado." });
    return null;
  }

  const ehDono = emprestimo.leitorId === req.usuario.id;
  const ehAdmin = req.usuario.role === "ADMIN";
  if (!ehDono && !ehAdmin) {
    res.status(403).json({ erro: "Você só tem permissão para alterar ou devolver seus próprios empréstimos." });
    return null;
  }

  return emprestimo;
}

// PUT /emprestimos/:id (usado para registrar a devolução do livro)
export async function atualizar(req, res) {
  const emprestimo = await carregarComPermissao(req, res);
  if (!emprestimo) return;

  const { dados, erro } = validarCorpo(req.body, true);
  if (erro) return res.status(400).json({ erro });
  if (Object.keys(dados).length === 0) {
    return res.status(400).json({ erro: "Envie ao menos um campo para atualizar." });
  }

  // Não permitimos trocar de livro em um empréstimo já existente
  delete dados.livroId;

  const atualizado = await prisma.emprestimo.update({
    where: { id: emprestimo.id },
    data: dados,
    include: incluirRelacoes,
  });

  res.json(atualizado);
}

// DELETE /emprestimos/:id (remove o empréstimo — somente o titular ou ADMIN)
export async function remover(req, res) {
  const emprestimo = await carregarComPermissao(req, res);
  if (!emprestimo) return;

  await prisma.emprestimo.delete({ where: { id: emprestimo.id } });
  res.status(204).send();
}
