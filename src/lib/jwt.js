import jwt from "jsonwebtoken";

// Função para buscar a chave secreta nas variáveis de ambiente.
// Se o desenvolvedor esqueceu de criar o .env a partir do .env.example, a API avisa de cara.
function segredo() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("A variável JWT_SECRET não está definida no arquivo .env");
  }
  return s;
}

// Decisão do grupo (Requisito 7 do README):
// Colocamos no payload apenas o mínimo necessário: subject (id do usuário) e role (perfil).
// Como o payload do JWT é apenas codificado em Base64URL (qualquer um consegue ler no jwt.io),
// NUNCA colocamos senhas, hashes ou dados pessoais sigilosos aqui dentro.
export function gerarToken(usuario) {
  return jwt.sign({ role: usuario.role }, segredo(), {
    subject: String(usuario.id),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    algorithm: "HS256",
  });
}

// jwt.verify confere a integridade matemática da assinatura e se o prazo (exp) não venceu.
// Se a assinatura foi adulterada ou o token passou do tempo, ele joga uma exceção automaticamente.
export function verificarToken(token) {
  return jwt.verify(token, segredo(), { algorithms: ["HS256"] });
}
