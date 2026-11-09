import { Router } from "express";
import { listar, buscar, criar, atualizar, remover } from "../controllers/livroController.js";
import { autenticar } from "../middlewares/autenticar.js";
import { autorizar } from "../middlewares/autorizar.js";

const router = Router();

// Consultas ao catálogo são públicas para que qualquer visitante possa ver o acervo
router.get("/", listar);
router.get("/:id", buscar);

// Operações de gestão de acervo exigem login e papel de administrador (RBAC: ADMIN)
router.post("/", autenticar, autorizar("ADMIN"), criar);
router.put("/:id", autenticar, autorizar("ADMIN"), atualizar);
router.delete("/:id", autenticar, autorizar("ADMIN"), remover);

export default router;
