import rateLimit from "express-rate-limit";

// PONTO EXTRA DO PDF (+0,3): Proteção contra ataques de força bruta no login
// Usamos o pacote express-rate-limit para proteger o endpoint POST /auth/login.
// A configuração skipSuccessfulRequests: true garante que logins com sucesso não gastem o limite;
// apenas tentativas com senha incorreta contam. Após 10 erros em 15 minutos, o IP é bloqueado com status 429.
export const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000, // Janela de monitoramento: 15 minutos
  limit: 10,                 // Máximo de 10 tentativas com falha por IP
  skipSuccessfulRequests: true,
  standardHeaders: true,     // Envia os cabeçalhos padrão RateLimit-* no HTTP
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas incorretas de login a partir deste IP. Por segurança, tente novamente em 15 minutos.",
  },
});
