import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client.ts";

// Requisito R1 do trabalho: Prisma 7 com driver adapter better-sqlite3 e SQLite
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não encontrada no .env. Copie o .env.example para .env e tente novamente.");
}

// Instanciamos o adaptador nativo do better-sqlite3 para conexão de alto desempenho com o dev.db
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });

// Exportamos uma única instância do PrismaClient para ser reutilizada em toda a aplicação
export const prisma = new PrismaClient({ adapter });
