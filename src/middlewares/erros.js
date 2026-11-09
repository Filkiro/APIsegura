// Intercepta qualquer requisição que bateu em um endpoint inexistente e responde com 404 amigável em JSON
export function naoEncontrada(req, res) {
  res.status(404).json({ erro: `A rota ${req.method} ${req.originalUrl} não foi encontrada na API.` });
}

// Middleware global de tratamento de erros do Express (identificado por receber 4 argumentos: erro, req, res, next).
// Uma das grandes novidades do Express 5 (requisito R1 do trabalho) é que promises rejeitadas em funções
// assíncronas são capturadas automaticamente aqui, sem deixar a aplicação travar.
export function tratarErros(erro, req, res, next) {
  // Se o cliente enviou um JSON com vírgula sobrando ou aspas erradas
  if (erro.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "O JSON enviado no corpo da requisição é inválido." });
  }

  // Registra o erro no console do terminal para ajudar na depuração
  console.error("Erro inesperado capturado pelo middleware global:", erro);
  res.status(500).json({ erro: "Ocorreu um erro interno no servidor." });
}
