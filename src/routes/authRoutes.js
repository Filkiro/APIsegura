import { Router } from "express";
import { registrar, login, me, trocarSenha } from "../controllers/authController.js";
import { autenticar } from "../middlewares/autenticar.js";
import { limitarLogin } from "../middlewares/limitarLogin.js";

const router = Router();

// Rota pública para criação de nova conta de leitor
router.post("/register", registrar);

// Rota pública de login com proteção de taxa (rate limit contra força bruta)
router.post("/login", limitarLogin, login);

// Rota protegida: devolve os dados cadastrais do leitor logado
router.get("/me", autenticar, me);

// Ponto extra: rota autenticada para o leitor alterar sua própria senha
router.patch("/senha", autenticar, trocarSenha);

export default router;
