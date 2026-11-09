// Este middleware implementa o RBAC (Role-Based Access Control) e responde: "O que você PODE fazer?".
// Se o usuário não tiver permissão, a resposta é sempre 403 Forbidden.
//
// Dica que o professor pode perguntar na arguição:
// O "autorizar" precisa vir SEMPRE DEPOIS do "autenticar" nas rotas!
// O motivo é que o autorizar depende do req.usuario (que só existe depois que o autenticar validou o token).
// Exemplo: router.get("/users", autenticar, autorizar("ADMIN"), listar)
export function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    // Se não houver usuário anexado na requisição ou o papel dele não estiver na lista permitida
    if (!req.usuario || !perfisPermitidos.includes(req.usuario.role)) {
      return res.status(403).json({
        erro: "Acesso negado: seu perfil não tem permissão para realizar esta operação.",
      });
    }
    next();
  };
}
