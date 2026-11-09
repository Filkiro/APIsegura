import { Router } from "express";
import { listar, alterarPerfil } from "../controllers/userController.js";
import { autenticar } from "../middlewares/autenticar.js";
import { autorizar } from "../middlewares/autorizar.js";

const router = Router();

// Ordem fundamental da segurança: primeiro validamos a identidade (autenticar),
// e em seguida checamos se o perfil possui autorização administrativa (autorizar).
router.get("/", autenticar, autorizar("ADMIN"), listar);
router.patch("/:id/role", autenticar, autorizar("ADMIN"), alterarPerfil);

export default router;
