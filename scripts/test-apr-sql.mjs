// Banco PostgreSQL isolado em memória. Nenhuma conexão com produção.
// npm install --prefix <diretorio-temporario> --no-save @electric-sql/pglite
// APR_PGLITE_PATH deve apontar para node_modules/@electric-sql/pglite/dist/index.js.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
process.on("uncaughtException", (e) => {
  console.error(e.message, e.where || "", e.internalQuery || "");
  process.exit(1);
});
const { PGlite } = await import(
  pathToFileURL(process.env.APR_PGLITE_PATH).href
);
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES('${id(1)}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${id(1)}'::uuid $$;
CREATE FUNCTION public.get_user_role(uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION public.can_manage_sms_obra(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true)='admin' $$;
CREATE FUNCTION public.dds_pode_acessar(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true)='admin' OR $1='${id(2)}'::uuid $$;
SELECT set_config('test.role','admin',false);
CREATE TABLE obras(id uuid PRIMARY KEY,nome text);
INSERT INTO obras VALUES('${id(2)}','Obra A'),('${id(3)}','Obra B');
CREATE TABLE employees(id uuid PRIMARY KEY,nome text,status text);
INSERT INTO employees VALUES('${id(4)}','Funcionário A','ativo'),('${id(5)}','Funcionário B','ativo');
CREATE TABLE obra_funcionarios(obra_id uuid,employee_id uuid,status boolean);
INSERT INTO obra_funcionarios VALUES('${id(2)}','${id(4)}',true),('${id(3)}','${id(5)}',true);
CREATE TABLE sms_apr_tipos_atividade(id uuid PRIMARY KEY,nome text,ativo boolean DEFAULT true);
CREATE TABLE sms_apr_riscos_catalogo(id uuid PRIMARY KEY,nome text,ativo boolean DEFAULT true);
INSERT INTO sms_apr_tipos_atividade VALUES('${id(6)}','Escavação');
INSERT INTO sms_apr_riscos_catalogo VALUES('${id(7)}','Queda');
CREATE TABLE sms_aprs(id uuid PRIMARY KEY,obra_id uuid REFERENCES obras,tipo_atividade_id uuid REFERENCES sms_apr_tipos_atividade,local text NOT NULL,responsavel text NOT NULL,data_hora_inicio timestamptz NOT NULL,data_hora_fim timestamptz,validade timestamptz,descricao_trabalho text,observacoes text,status text DEFAULT 'aberta' CHECK(status IN ('aberta','em_execucao','concluida','cancelada')),registrado_por uuid,created_at timestamptz DEFAULT now());
ALTER TABLE sms_aprs ENABLE ROW LEVEL SECURITY;
CREATE TABLE sms_apr_riscos_selecionados(id uuid DEFAULT gen_random_uuid(),apr_id uuid REFERENCES sms_aprs,risco_id uuid REFERENCES sms_apr_riscos_catalogo,medida_controle text,resposta text,eliminado boolean DEFAULT false);
CREATE TABLE sms_apr_envolvidos(id uuid DEFAULT gen_random_uuid(),apr_id uuid REFERENCES sms_aprs,colaborador_id uuid REFERENCES employees,assinou boolean DEFAULT false,data_assinatura timestamptz,UNIQUE(apr_id,colaborador_id));
CREATE TABLE sms_treinamentos_catalogo(id uuid PRIMARY KEY,nome text,obrigatorio boolean,validade_meses int);
CREATE TABLE sms_colaborador_treinamentos(colaborador_id uuid,treinamento_id uuid,obra_id uuid,status text,data_realizacao date,data_vencimento date);
CREATE TABLE sms_saude_ocupacional(colaborador_id uuid,data_exame date,created_at timestamptz DEFAULT now(),aptidao text,vencimento date,tipo_exame text);
CREATE TABLE employee_ferias(employee_id uuid,aprovado boolean,data_inicio date,data_fim date);
CREATE TABLE sms_pt(id uuid PRIMARY KEY,obra_id uuid,atividade text,status text,aprovado_por uuid,data_inicio timestamptz,data_fim timestamptz);
CREATE TABLE efetivo_ponto(obra_id uuid,data date,ausencia boolean,horas_trabalhadas numeric,horas_extras numeric);
CREATE TABLE sms_dds_sessoes(id uuid,obra_id uuid,data_sessao date,status text);
CREATE TABLE sms_dds_presencas(colaborador_id uuid,presente boolean,sessao_id uuid);
CREATE TABLE sms_colaborador_epis(colaborador_id uuid,data_devolucao date);
CREATE TABLE sms_inspecoes(obra_id uuid,data_inspecao date,status text);
CREATE TABLE sms_desvios(obra_id uuid,data_ocorrencia date,status text);
CREATE TABLE sms_acidentes(obra_id uuid,data_hora timestamptz,colaborador_id uuid);
CREATE TABLE sms_near_miss(obra_id uuid,created_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
`);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20260830000001_apr_operacional.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
console.log("OK: migração compilada em PostgreSQL isolado");
const start = new Date(Date.now() - 60000).toISOString(),
  end = new Date(Date.now() + 3600000).toISOString();
const payload = {
  obra_id: id(2),
  tipo_atividade_id: id(6),
  local: "Frente A",
  responsavel: "Responsável",
  descricao_trabalho: "Serviço",
  data_hora_inicio: start,
  validade: end,
  emergencia: "Contato da brigada",
  exige_pt: false,
  treinamentos: [],
  participantes: [{ id: id(4), origem: "manual" }],
  riscos: [
    {
      risco_id: id(7),
      resposta: "S",
      etapa: "Preparação",
      medida_controle: "Proteção coletiva",
      responsavel: "Encarregado",
      p: 3,
      s: 3,
      pr: 1,
      sr: 3,
      verificado: true,
    },
  ],
};
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const save = (n, d = payload, v = null) =>
  q("select apr_salvar($1,$2::jsonb,$3)", [id(n), JSON.stringify(d), v]);
const version = async () =>
  Number(
    (await q("select versao from sms_aprs where id=$1", [id(10)]))[0].versao,
  );
const transition = async (status, v) =>
  q("select apr_transicao($1,$2,$3,$4)", [
    id(10),
    v ?? (await version()),
    status,
    "Justificativa de teste",
  ]);
const pending = async () =>
  (await q("select apr_pendencias($1) as p", [id(10)]))[0].p;
await save(10);
assert.equal((await q("select status from sms_aprs"))[0].status, "rascunho");
await assert.rejects(
  save(11, { ...payload, participantes: [{ id: id(5) }] }),
  /vínculo/,
);
assert.equal(
  (await q("select count(*)::int as n from sms_aprs where id=$1", [id(11)]))[0]
    .n,
  0,
);
console.log("OK: gravação atômica e vínculo da equipe");
await save(10);
assert.equal(await version(), 1);
await assert.rejects(
  save(10, { ...payload, local: "Outro" }),
  /conteúdo diferente/,
);
await assert.rejects(transition("em_execucao"), /Transição/);
await assert.rejects(
  q("select apr_transicao($1,null,$2,$3)", [
    id(10),
    "em_analise",
    "Analisar agora",
  ]),
  /alterado/,
);
await transition("em_analise");
await assert.rejects(transition("liberada"), /ciência|ocupacional/);
assert.ok((await pending()).some((x) => x.includes("ocupacional")));
const signature = "data:image/png;base64," + "A".repeat(1500); // fixture de transporte, não valida desenho ou identidade.
await q("select apr_ciencia($1,$2,$3,$4)", [
  id(10),
  id(4),
  await version(),
  signature,
]);
await q(
  "insert into sms_saude_ocupacional(colaborador_id,data_exame,aptidao,vencimento,tipo_exame) values($1,current_date-1,'apto',current_date+30,'periodico')",
  [id(4)],
);
await q(
  "insert into sms_treinamentos_catalogo values($1,'Treinamento obrigatório',true,12)",
  [id(8)],
);
assert.ok((await pending()).some((x) => x.includes("treinamento")));
await q(
  "insert into sms_colaborador_treinamentos values($1,$2,null,'em_dia',current_date-1,current_date+30)",
  [id(4), id(8)],
);
assert.deepEqual(await pending(), []);
await db.exec(
  "select set_config('test.role','funcionario',false); SET ROLE authenticated;",
);
await assert.rejects(transition("liberada"), /aprovação/);
await assert.rejects(
  q("update sms_aprs set status=$1 where id=$2", ["liberada", id(10)]),
  /permission denied/,
);
await assert.rejects(save(12, { ...payload, obra_id: id(3) }), /acesso/);
await db.exec("RESET ROLE; select set_config('test.role','admin',false);");
await transition("liberada");
const released = await version();
await save(10);
assert.equal(await version(), released);
await q(
  "insert into employee_ferias values($1,true,current_date,current_date+1)",
  [id(4)],
);
await assert.rejects(transition("em_execucao"), /indisponibilidade/);
await db.exec("delete from employee_ferias");
await transition("em_execucao");
await transition("suspensa");
await transition("rascunho");
assert.equal(
  (
    await q("select assinou from sms_apr_envolvidos where apr_id=$1", [id(10)])
  )[0].assinou,
  false,
);
await save(
  10,
  { ...payload, descricao_trabalho: "Nova revisão" },
  await version(),
);
assert.equal(
  (await q("select revisao from sms_aprs where id=$1", [id(10)]))[0].revisao,
  2,
);
assert.ok(
  (await q("select count(*)::int as n from sms_apr_historico"))[0].n > 5,
);
await q("select apr_catalogos($1)", [id(2)]);
await q("select apr_detalhe($1)", [id(10)]);
await q("select apr_listar()");
await q("select sms_rdo_snapshot($1,current_date)", [id(2)]);
console.log(
  "OK: transições, acesso, ciência, ASO, treinamento, férias, reenvio e revisão",
);
await save(10,{...payload,riscos:[{...payload.riscos[0],pr:5,sr:5}]},await version());
assert.ok((await pending()).some(x=>x.includes('residual alto')));
await save(10,{...payload,exige_pt:true,pt_id:id(20)},await version());
assert.ok((await pending()).some(x=>x.includes('PT aprovada')));
await q("insert into sms_pt values($1,$2,'Permissão','aberta',$3,$4,$5)",[id(20),id(3),id(1),start,end]);
assert.ok((await pending()).some(x=>x.includes('PT aprovada')));
await q('update sms_pt set obra_id=$1 where id=$2',[id(2),id(20)]);
assert.equal((await pending()).some(x=>x.includes('PT aprovada')),false);
await save(10,{...payload,validade:start},await version());
assert.ok((await pending()).some(x=>x.includes('Validade')));
assert.ok((await q("select count(*)::int as n from sms_apr_historico where dados::text like '%data:image/png;base64%'")).at(0).n>0);
await save(30,{...payload,obra_id:id(3),participantes:[{id:id(5)}]});
await db.exec("select set_config('test.role','funcionario',false); SET ROLE authenticated;");
await assert.rejects(q('select apr_detalhe($1)',[id(30)]),/Acesso/);
await db.exec('RESET ROLE');
console.log('OK: risco residual, PT de outra obra, validade e preservação de assinaturas no histórico');
await db.close();
