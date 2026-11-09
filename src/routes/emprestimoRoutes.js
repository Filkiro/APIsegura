import { Router } from "express";
import {
  listar,
  listarMeus,
  buscar,
  criar,
  atualizar,
  remover,
} from "../controllers/emprestimoController.js";
import { autenticar } from "../middlewares/autenticar.js";

const router = Router();

// GET /emprestimos: atende à especificação da Tabela 4 do PDF.
// Qualquer usuário autenticado pode chamar: se for leitor, vê só os seus; se for ADMIN, audita todos.
router.get("/", autenticar, listar);

// Rota explícita para o leitor consultar apenas seus empréstimos ativos
router.get("/meus", autenticar, listarMeus);

// Consulta empréstimo por ID (regra do dono: somente o próprio leitor ou um ADMIN)
router.get("/:id", autenticar, buscar);

// Criação de empréstimo: o leitorId vem obrigatoriamente do token JWT, ignorando o body
router.post("/", autenticar, criar);

// Devolução ou atualização de empréstimo (valida 404 antes de verificar permissão 403)
router.put("/:id", autenticar, atualizar);

// Exclusão de empréstimo (também restrita ao dono do registro ou ADMIN)
router.delete("/:id", autenticar, remover);

export default router;
