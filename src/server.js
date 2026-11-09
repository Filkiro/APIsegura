import "dotenv/config";
import app from "./app.js";

// Trava inicial de segurança: a API não sobe se a chave secreta do JWT estiver vazia,
// garantindo que o servidor nunca execute desprotegido por descuido.
if (!process.env.JWT_SECRET) {
  console.error("Aviso crítico: JWT_SECRET não foi configurada. Copie o .env.example para .env e defina uma chave segura.");
  process.exit(1);
}

// Inicia o servidor Express na porta configurada (ou 3000 por padrão)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor da Biblioteca rodando em http://localhost:${PORT}`);
});
