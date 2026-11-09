import { prisma } from "../lib/prisma.js";

// Perfis aceitos no nosso sistema conforme o enum Role do schema.prisma
const PERFIS_VALIDOS = ["USER", "ADMIN"];

// GET /users (acesso restrito ao ADMIN para auditar as contas da biblioteca)
export async function listar(req, res) {
  const usuarios = await prisma.user.findMany({
    // Segurança R9: nunca devolvemos os hashes das senhas dos usuários
    omit: { password: true },
    orderBy: { id: "asc" },
  });
  res.json(usuarios);
}

// PATCH /users/:id/role (somente ADMIN pode promover ou alterar o perfil de alguém)
export async function alterarPerfil(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  const { role } = req.body ?? {};
  if (!PERFIS_VALIDOS.includes(role)) {
    return res.status(400).json({
      erro: `O papel (role) informado é inválido. Valores aceitos: ${PERFIS_VALIDOS.join(", ")}.`,
    });
  }

  const existe = await prisma.user.findUnique({ where: { id } });
  if (!existe) return res.status(404).json({ erro: "Usuário não encontrado." });

  const usuario = await prisma.user.update({
    where: { id },
    data: { role },
    omit: { password: true },
  });

  // Ponto crucial da arguição com o professor:
  // Como o JWT é stateless, o token que o usuário já tem guardado não muda magicamente no navegador dele.
  // Ele precisará fazer login de novo para que o servidor gere um novo token com o novo perfil!
  res.json({
    ...usuario,
    aviso: "Perfil atualizado no banco. O usuário deve efetuar login novamente para que o novo papel passe a valer no token.",
  });
}
