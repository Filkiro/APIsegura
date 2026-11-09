import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import livroRoutes from "./routes/livroRoutes.js";
import emprestimoRoutes from "./routes/emprestimoRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { naoEncontrada, tratarErros } from "./middlewares/erros.js";

// Configuração padrão de caminhos absolutos quando usamos ES Modules ("type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware para interpretar requisições com corpo em formato JSON
app.use(express.json());

// Serve os arquivos do front-end da nossa biblioteca localizados na pasta public
app.use(express.static(path.join(__dirname, "../public")));

// Endpoint básico para testar se a API está respondendo normalmente
app.get("/api", (req, res) => {
  res.json({
    api: "Biblioteca ETECAMP",
    status: "online",
    descricao: "API Segura com autenticação JWT e autorização RBAC",
  });
});

// Vinculação dos módulos de rotas da aplicação
app.use("/auth", authRoutes);
app.use("/livros", livroRoutes);
app.use("/emprestimos", emprestimoRoutes);
app.use("/users", userRoutes);

// Middlewares finais da esteira: captura páginas inexistentes (404) e trata erros globais (500)
app.use(naoEncontrada);
app.use(tratarErros);

export default app;
