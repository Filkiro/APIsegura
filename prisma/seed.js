import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

// Senha padrão estabelecida para todos os usuários de teste da apresentação
const SENHA_PADRAO = "Senha123";

async function main() {
  // Limpeza de tabelas para garantir que o seed sempre recomece do zero sem registros duplicados
  await prisma.emprestimo.deleteMany();
  await prisma.livro.deleteMany();
  await prisma.user.deleteMany();

  // Reinicia os contadores de autoincrement no SQLite para os IDs começarem sempre em 1
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM sqlite_sequence WHERE name IN ('User','Livro','Emprestimo')`
    );
  } catch {
    // Se a tabela de sequência ainda não existir, ignoramos sem interromper o script
  }

  // Gera o hash com custo 10 usando o bcrypt (senhas seguras mesmo na carga inicial de testes)
  const password = await bcrypt.hash(SENHA_PADRAO, 10);

  // Requisito R11: 1 ADMIN e 2 USERs (Ana e Bruno)
  await prisma.user.create({
    data: {
      nome: "Administrador",
      email: "admin@biblioteca.com",
      password,
      role: "ADMIN",
    },
  });

  const ana = await prisma.user.create({
    data: {
      nome: "Ana Souza",
      email: "ana@biblioteca.com",
      password,
      role: "USER",
    },
  });

  const bruno = await prisma.user.create({
    data: {
      nome: "Bruno Lima",
      email: "bruno@biblioteca.com",
      password,
      role: "USER",
    },
  });

  // Cadastro de 5 livros clássicos com seus respectivos exemplares no estoque
  const livro1 = await prisma.livro.create({
    data: { titulo: "Dom Casmurro", autor: "Machado de Assis", isbn: "9788520916535", quantidade: 2 },
  });
  const livro2 = await prisma.livro.create({
    data: { titulo: "O Cortiço", autor: "Aluísio Azevedo", isbn: "9788508108152", quantidade: 1 },
  });
  const livro3 = await prisma.livro.create({
    data: { titulo: "Memórias Póstumas de Brás Cubas", autor: "Machado de Assis", isbn: "9788535910663", quantidade: 3 },
  });
  const livro4 = await prisma.livro.create({
    data: { titulo: "A Moreninha", autor: "Joaquim Manuel de Macedo", isbn: "9788579340673", quantidade: 2 },
  });
  const livro5 = await prisma.livro.create({
    data: { titulo: "Iracema", autor: "José de Alencar", isbn: "9788572328494", quantidade: 1 },
  });

  // Criação dos empréstimos iniciais:
  // - Ana (leitorId: 2) retirou Memórias Póstumas
  // - Bruno (leitorId: 3) retirou O Cortiço
  // Isso permite testar a regra do dono de cara (Ana tentando mexer no empréstimo do Bruno deve dar 403!)
  await prisma.emprestimo.createMany({
    data: [
      {
        livroId: livro3.id,
        leitorId: ana.id,
        dataEmprestimo: new Date(),
        devolvido: false,
      },
      {
        livroId: livro2.id,
        leitorId: bruno.id,
        dataEmprestimo: new Date(),
        devolvido: false,
      },
    ],
  });

  console.log("Banco populado com sucesso: 1 ADMIN, 2 leitores, 5 livros com estoque e 2 empréstimos ativos prontos para teste!");
}

main()
  .catch((e) => {
    console.error("Erro ao popular o banco:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
