import { verificarToken } from "../lib/jwt.js";

// Este middleware responde à pergunta central: "QUEM é você?".
// Sempre que a checagem falha, a resposta padrão é 401 Unauthorized.
// Cobrimos aqui os 3 cenários de 401 cobrados na rubrica do trabalho:
export function autenticar(req, res, next) {
  const header = req.headers.authorization;

  // Cenário 1: requisição sem nenhum cabeçalho de autorização informado
  if (!header) {
    return res.status(401).json({ erro: "Token de acesso não informado." });
  }

  // Cenário 2: formato fora do padrão do protocolo (esperado: "Bearer <token>")
  const partes = header.split(" ");
  if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
    return res.status(401).json({
      erro: "Formato do cabeçalho inválido. O padrão correto é: Authorization: Bearer <token>",
    });
  }

  // Cenário 3: token adulterado, com assinatura corrompida ou expirado
  // O try/catch é obrigatório aqui porque o jwt.verify joga um erro se algo estiver errado com o token!
  try {
    const payload = verificarToken(partes[1]);

    // Ponto mais importante do trabalho: o id do usuário e o papel dele são extraídos
    // diretamente das claims do token criptograficamente validado, NUNCA do corpo da requisição!
    req.usuario = {
      id: Number(payload.sub),
      role: payload.role,
    };

    return next();
  } catch (erro) {
    // Se o token passou do tempo limite de validade (1h)
    if (erro.name === "TokenExpiredError") {
      return res.status(401).json({ erro: "Seu token expirou. Por favor, faça login novamente." });
    }
    // Se mexeram em alguma letra do token ou a chave não bate
    return res.status(401).json({ erro: "Token inválido ou adulterado." });
  }
}
