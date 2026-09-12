// Testa o motor de acesso (perfil + ação + escopo) rodando as migrations reais
// 20260911000005..08 num Postgres em memória (PGlite).
// Uso: node scripts/test-acesso-sql.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../node_modules/.almox-sql-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const read = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
const como = uid => q("SELECT set_config('test.uid',$1,false)", [uid ?? '']);

// Usuários, funcionários e obras
const U_ADMIN = id(101), U_GESTOR = id(102), U_FUNC = id(103), U_TEC = id(104);
const E_ADMIN = id(301), E_GESTOR = id(302), E_FUNC = id(303), E_EQUIPE = id(305);
const OBRA_A = id(201), OBRA_B = id(202);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM ('admin','gestor_frota','funcionario','gestor_obra','gestor_contrato','tecnico_sms');
    CREATE TABLE user_roles(id uuid DEFAULT gen_random_uuid(), user_id uuid, role app_role, created_at timestamptz DEFAULT now());
    CREATE FUNCTION get_user_role(user_uuid uuid DEFAULT auth.uid()) RETURNS app_role LANGUAGE sql STABLE AS
      $$ SELECT role FROM user_roles WHERE user_id=user_uuid ORDER BY created_at DESC LIMIT 1 $$;
    CREATE TABLE obras(id uuid PRIMARY KEY, nome text);
    CREATE TABLE departamentos(id uuid PRIMARY KEY, nome text);
    CREATE TABLE cargos(id uuid PRIMARY KEY, nome text, nivel_acesso text, acessa_todas_obras boolean DEFAULT false);
    CREATE TABLE employees(id uuid PRIMARY KEY, user_id uuid, nome text, status text DEFAULT 'ativo', cargo_id uuid, departamento_id uuid);
    CREATE TABLE employee_obra_assignments(employee_id uuid, obra_id uuid, PRIMARY KEY(employee_id, obra_id));
    CREATE TABLE obra_funcionarios(employee_id uuid, obra_id uuid, status boolean);
    CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, nome text, email text);
    CREATE TABLE vehicles(id uuid PRIMARY KEY, responsavel_id uuid);
    CREATE TABLE obra_veiculos(vehicle_id uuid, obra_id uuid);

    INSERT INTO auth.users VALUES ('${U_ADMIN}'),('${U_GESTOR}'),('${U_FUNC}'),('${U_TEC}');
    INSERT INTO user_roles(user_id,role) VALUES ('${U_ADMIN}','admin'),('${U_GESTOR}','gestor_obra'),('${U_FUNC}','funcionario');
    INSERT INTO obras VALUES ('${OBRA_A}','Obra A'),('${OBRA_B}','Obra B');
    INSERT INTO employees(id,user_id,nome) VALUES
      ('${E_ADMIN}','${U_ADMIN}','Admin'),('${E_GESTOR}','${U_GESTOR}','Gestor'),
      ('${E_FUNC}','${U_FUNC}','Funcionario'),('${E_EQUIPE}',null,'Subordinado sem obra');
    INSERT INTO employee_obra_assignments VALUES ('${E_GESTOR}','${OBRA_A}');
    INSERT INTO obra_funcionarios VALUES ('${E_FUNC}','${OBRA_A}',true);
  `);

  // 00005 já está no banco de produção; 00006..08 precisam ser reaplicáveis
  await db.exec(await read('20260911000005_controle_acesso_profissional.sql'));
  for (let i = 0; i < 2; i++) {
    await db.exec(await read('20260911000006_controle_acesso_escopos_revisao.sql'));
    await db.exec(await read('20260911000007_controle_acesso_motor_escopo.sql'));
    await db.exec(await read('20260911000008_controle_acesso_comparacao.sql'));
    await db.exec(await read('20260911000009_acesso_estrutura_configuracoes.sql'));
    await db.exec(await read('20260911000010_acesso_modelo_novo_definitivo.sql'));
  }
  await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();');
  await db.exec(`ALTER TABLE employees ADD CONSTRAINT fk_gestor FOREIGN KEY (gestor_imediato_id) REFERENCES employees(id);`);

  const perfil = nome => one('SELECT id FROM access_profiles WHERE nome=$1', [nome]);
  const permissao = chave => one('SELECT id FROM access_permissions WHERE chave=$1', [chave]);

  // ── Conversão dos papéis antigos ──────────────────────────────────────────
  assert.equal(Number(await one("SELECT count(*) FROM employee_access_profiles WHERE scope_type='obra' AND scope_id IS NULL")), 0,
    'nenhuma atribuição de obra pode ficar sem obra (valeria para todas)');
  assert.equal(await one('SELECT scope_id FROM employee_access_profiles WHERE user_id=$1', [U_GESTOR]), OBRA_A);
  assert.equal(await one('SELECT scope_type FROM employee_access_profiles WHERE user_id=$1', [U_FUNC]), 'proprio');

  // ── Gestor de obra: só a própria obra ─────────────────────────────────────
  await como(U_GESTOR);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_A]), true);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_B]), false, 'gestor da Obra A não mexe na Obra B');
  assert.deepEqual(await one("SELECT minhas_obras('obras.editar')"), [OBRA_A]);
  assert.equal(await one("SELECT has_permission('obras.editar')"), false, 'sem escopo, só concessão da empresa vale');
  const efetivo = await one('SELECT get_effective_access()');
  assert.ok(efetivo.grants.some(g => g.chave === 'obras.editar' && g.scope_id === OBRA_A));

  // Exceção que nega vence o perfil
  await q(`INSERT INTO access_overrides(user_id,permission_id,permitido,scope_type,scope_id,justificativa,aprovado_por)
           VALUES ($1,$2,false,'obra',$3,'teste',$4)`, [U_GESTOR, await permissao('obras.editar'), OBRA_A, U_ADMIN]);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_A]), false, 'exceção que bloqueia vence o perfil');
  await q('DELETE FROM access_overrides');

  // ── Equipe: subordinado sem obra só entra pelo perfil de líder ────────────
  await q('UPDATE employees SET gestor_imediato_id=$1 WHERE id=$2', [E_GESTOR, E_EQUIPE]);
  assert.equal(await one("SELECT pode_funcionario('efetivo.editar',$1)", [E_EQUIPE]), false);
  await q(`INSERT INTO employee_access_profiles(user_id,profile_id,scope_type,justificativa) VALUES ($1,$2,'equipe','teste')`,
    [U_GESTOR, await perfil('Lider / Supervisor')]);
  assert.equal(await one("SELECT pode_funcionario('efetivo.editar',$1)", [E_EQUIPE]), true, 'líder alcança a própria equipe');
  assert.equal(await one("SELECT pode_funcionario('efetivo.editar',$1)", [E_ADMIN]), false);

  // ── Funcionário: só os próprios registros ─────────────────────────────────
  await como(U_FUNC);
  assert.equal(await one("SELECT pode_geral('escalas.visualizar')"), false, 'perfil funcionário não vale para a empresa');
  assert.equal(await one("SELECT pode_funcionario('escalas.visualizar',$1)", [E_FUNC]), true);
  assert.equal(await one("SELECT pode_funcionario('escalas.visualizar',$1)", [E_GESTOR]), false);

  // Substituição temporária: assume a Obra B do gestor
  await q(`INSERT INTO access_delegations(de_user_id,para_user_id,profile_id,scope_type,scope_id,inicio_em,fim_em,motivo)
           VALUES ($1,$2,$3,'obra',$4,now()-interval '1 hour',now()+interval '1 day','férias')`,
    [U_GESTOR, U_FUNC, await perfil('Gestor de Obra'), OBRA_B]);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_B]), true, 'substituto recebe o acesso da obra');
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_A]), false);

  // ── Administrador técnico: configura, mas não vê dado sensível ────────────
  await q(`INSERT INTO employee_access_profiles(user_id,profile_id,scope_type,justificativa) VALUES ($1,$2,'empresa','teste')`,
    [U_TEC, await perfil('Administrador Tecnico')]);
  await como(U_ADMIN);
  assert.equal(await one("SELECT access_simular($1,'controle_acesso.administrar')", [U_TEC]), true);
  assert.equal(await one("SELECT access_simular($1,'rh_sensivel.visualizar',null,$2)", [U_TEC, E_FUNC]), false,
    'administrador técnico não lê dado sensível de RH');
  const porque = await q("SELECT * FROM access_explain($1,'obras.editar',$2)", [U_FUNC, OBRA_B]);
  assert.ok(porque.some(r => r.origem === 'substituicao' && r.cobre_alvo), 'explica que o acesso veio da substituição');

  // Acesso vencido não vale (funcionário não tem SMS por nenhum outro perfil)
  await q(`INSERT INTO employee_access_profiles(user_id,profile_id,scope_type,valido_de,valido_ate,justificativa)
           VALUES ($1,$2,'empresa',now()-interval '2 days',now()-interval '1 day','teste')`, [U_FUNC, await perfil('Gestor SMS')]);
  assert.equal(await one("SELECT access_simular($1,'sms_dds.visualizar')", [U_FUNC]), false, 'acesso vencido não vale');

  // Limite de aprovação
  await q(`INSERT INTO employee_access_profiles(user_id,profile_id,scope_type,justificativa) VALUES ($1,$2,'empresa','teste')`,
    [U_TEC, await perfil('Aprovador Financeiro')]);
  await q(`INSERT INTO access_approval_limits(profile_id,modulo,limite) VALUES ($1,'fundo_fixo',1000)`, [await perfil('Aprovador Financeiro')]);
  await como(U_TEC);
  assert.equal(await one("SELECT can_approve_amount('fundo_fixo',500)"), true);
  assert.equal(await one("SELECT can_approve_amount('fundo_fixo',1500)"), false, 'acima do limite não aprova');

  // ── Troca de modelo nas regras do banco ───────────────────────────────────
  await como(U_GESTOR);
  assert.equal(await one('SELECT can_manage_obra_data($1)', [OBRA_A]), true, 'regra antiga: gestor na própria obra');
  assert.equal(await one('SELECT can_manage_obra_data($1)', [OBRA_B]), false);
  await como(U_ADMIN);
  const diferencas = await q('SELECT * FROM access_compare_report()');
  await q("SELECT access_set_modo('can_manage_obra_data','novo')");
  await como(U_GESTOR);
  assert.equal(await one('SELECT can_manage_obra_data($1)', [OBRA_A]), true, 'modelo novo: mesma decisão na própria obra');
  assert.equal(await one('SELECT can_manage_obra_data($1)', [OBRA_B]), false);
  await como(U_FUNC);
  await assert.rejects(q("SELECT access_set_modo('can_manage_obra_data','legado')"), /Acesso negado/, 'só administrador troca a regra');

  // ── Papel antigo desligado: o papel vem do perfil ─────────────────────────
  assert.equal(await one('SELECT get_user_role($1)::text', [U_GESTOR]), 'gestor_obra');
  assert.equal(await one('SELECT get_user_role($1)::text', [U_ADMIN]), 'admin');
  const U_NOVO = id(106);
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'novo@teste')`, [U_NOVO]);
  await q(`INSERT INTO user_roles(user_id,role) VALUES ($1,'admin')`, [U_NOVO]);
  assert.equal(await one('SELECT get_user_role($1)::text', [U_NOVO]), 'funcionario', 'user_roles não dá mais acesso');
  assert.equal(await one("SELECT scope_type FROM employee_access_profiles WHERE user_id=$1", [U_NOVO]), 'proprio',
    'usuário novo nasce com perfil Funcionario nos próprios registros');
  await como(U_NOVO);
  assert.equal(await one('SELECT access_is_admin()'), false);
  await como(U_FUNC);
  assert.equal(await one('SELECT can_access_obra_data($1)', [OBRA_A]), true, 'funcionário consulta a obra em que trabalha');

  // Vincular/desvincular obra acompanha o perfil de gestor de obra
  await q('INSERT INTO employee_obra_assignments VALUES ($1,$2)', [E_GESTOR, OBRA_B]);
  await como(U_GESTOR);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_B]), true, 'vincular obra concede o perfil nela');
  await q('DELETE FROM employee_obra_assignments WHERE employee_id=$1 AND obra_id=$2', [E_GESTOR, OBRA_B]);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_B]), false, 'desvincular revoga');
  await q('DELETE FROM employee_obra_assignments WHERE employee_id=$1', [E_GESTOR]);
  await q('INSERT INTO employee_obra_assignments VALUES ($1,$2)', [E_GESTOR, OBRA_A]);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_A]), true, 'salvar de novo na tela de usuários mantém o acesso');

  // ── Desligamento revoga na hora ───────────────────────────────────────────
  await q("UPDATE employees SET status='desligado' WHERE id=$1", [E_FUNC]);
  assert.equal(await one("SELECT pode('obras.editar',$1)", [OBRA_B]), false, 'desligado perde a substituição');
  assert.equal(Number(await one('SELECT count(*) FROM employee_access_profiles WHERE user_id=$1 AND revogado_em IS NULL', [U_FUNC])), 0);

  console.log(`OK: escopo por obra, própria equipe e próprios registros, exceção que bloqueia, substituição, sensível fora do admin técnico, validade, limite de aprovação, troca de modelo (${diferencas.length} diferença(s) na comparação), desligamento e reaplicação das migrations.`);
} finally {
  await db.close();
}
