// Mapa único de rota → permissão. Rotas, menu e telas leem daqui, para que o
// que aparece no menu seja exatamente o que a URL deixa abrir.
// Rotas fora do mapa (Dashboard, Meu Perfil) são livres para quem está logado.
// A ordem importa: caminhos específicos antes dos genéricos ("/sms/rdo" antes de "/sms").
export const ROUTE_PERMISSIONS: ReadonlyArray<readonly [string, string]> = [
  ["/funcionarios", "colaboradores.visualizar"],
  ["/cargos", "controle_acesso.administrar"],
  ["/departamentos", "controle_acesso.administrar"],
  ["/configuracoes", "controle_acesso.administrar"],
  ["/controle-acesso", "controle_acesso.administrar"],
  ["/auditoria", "auditoria.visualizar"],

  ["/frota", "frota.visualizar"],
  ["/veiculos-pesados", "frota.visualizar"],
  ["/acessorios", "frota.visualizar"],
  ["/teste-fumaca", "frota.visualizar"],
  ["/checklist-inspecao", "frota.visualizar"],
  ["/borracharia", "frota.visualizar"],
  ["/multas", "frota.visualizar"],
  ["/manutencao", "manutencao.visualizar"],

  ["/escalas", "escalas.visualizar"],
  ["/efetivo", "efetivo.visualizar"],
  ["/ponto-qr", "efetivo.visualizar"],

  ["/obras", "obras.visualizar"],
  ["/fornecedores", "fornecedores.visualizar"],
  ["/almoxarifado", "almoxarifado.visualizar"],
  ["/ferramentas", "ferramentas.visualizar"],
  ["/cronograma", "cronograma.visualizar"],
  ["/subcontratadas", "subcontratadas.visualizar"],
  ["/orcado-realizado", "financeiro.visualizar"],
  ["/fundo-fixo", "fundo_fixo.visualizar"],
  ["/alojamentos", "alojamento.visualizar"],
  ["/portal-cliente", "portal_cliente.visualizar"],
  ["/visitantes", "visitantes.visualizar"],
  ["/qualidade", "qualidade.visualizar"],
  ["/nao-conformidades", "qualidade.visualizar"],

  ["/relatorio-folha", "rh_sensivel.visualizar"],
  ["/relatorios-escala", "relatorios.visualizar"],
  ["/relatorios", "relatorios.visualizar"],
  ["/consultas", "relatorios.visualizar"],

  ["/chat", "chat.visualizar"],
  ["/comunicados", "comunicados.visualizar"],

  ["/sms/desvios", "sms_desvios.visualizar"],
  ["/sms/ocorrencias", "sms_desvios.visualizar"],
  ["/sms/inspecoes", "sms_inspecoes.visualizar"],
  ["/sms/apr", "sms_apr.visualizar"],
  ["/sms/dds", "sms_dds.visualizar"],
  ["/sms/epis", "sms_epis.visualizar"],
  ["/sms/treinamentos", "sms_treinamentos.visualizar"],
  ["/sms/conformidade", "sms_treinamentos.visualizar"],
  ["/sms/admissao", "sms_admissao.visualizar"],
  ["/sms/rdo", "sms_rdo.visualizar"],
  ["/sms/velocidade", "sms_velocidade.visualizar"],
  ["/sms", "sms_dashboard.visualizar"],
];

/** Permissão exigida para abrir o caminho, ou undefined se a rota é livre. */
export function permissionForPath(pathname: string): string | undefined {
  return ROUTE_PERMISSIONS.find(([path]) => pathname === path || pathname.startsWith(path + "/"))?.[1];
}

/** Nome legível de uma chave, para mensagens ao usuário ("financeiro.aprovar" → "Financeiro — aprovar"). */
export function describePermission(chave: string): string {
  const [modulo, acao] = chave.split(".");
  const nome = modulo.replace(/_/g, " ");
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} — ${(acao ?? "").replace(/_/g, " ")}`;
}
