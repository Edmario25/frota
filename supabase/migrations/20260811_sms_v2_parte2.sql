-- SMS SSMA Schema V2 - PARTE 2/2: Seed de dados iniciais
-- Rodar APOS a parte 1 ter terminado sem erros

-- Treinamentos
INSERT INTO public.sms_treinamentos_catalogo
  (nome, nr_referencia, carga_horaria_h, validade_meses, obrigatorio)
VALUES
  ('Integracao SMS admissional',       'NR-01',  8,  12, true),
  ('Equipamentos de Protecao Individual','NR-06', 4,  12, true),
  ('Canteiro de Obras',                'NR-18', 16,  12, true),
  ('Instalacoes Eletricas',            'NR-10', 40,  24, false),
  ('Trabalho em Altura',               'NR-35',  8,  24, false),
  ('Espaco Confinado',                 'NR-33', 16,  12, false),
  ('Maquinas e Equipamentos',          'NR-12',  8,  12, false),
  ('Protecao Contra Incendios',        'NR-23',  8,  12, false),
  ('Direcao Defensiva',                null,    20,  24, false),
  ('MOPP Produtos Perigosos',          null,    32,  60, false),
  ('Primeiros Socorros',               null,    16,  24, false),
  ('Operacao de Empilhadeira',         'NR-11', 40,  12, false),
  ('Combate a Incendio',               null,    16,  12, false);

-- Temas DDS
INSERT INTO public.sms_dds_temas (titulo, descricao, nr_relacionada) VALUES
  ('Uso correto de EPIs',
   'Importancia e uso adequado dos equipamentos de protecao individual', 'NR-06'),
  ('Trabalho em Altura',
   'Riscos, prevencao e uso de cinto de seguranca', 'NR-35'),
  ('Ordem e Limpeza no Canteiro',
   'Organizacao do local de trabalho para prevenir acidentes', 'NR-18'),
  ('Prevencao de Incendios',
   'Uso de extintores e rotas de fuga', 'NR-23'),
  ('Manuseio de Ferramentas',
   'Uso correto e inspecao de ferramentas manuais', 'NR-12'),
  ('Comunicacao de Acidentes e Quase-Acidentes',
   'Por que reportar todo incidente?', null),
  ('Saude Mental no Trabalho',
   'Bem-estar, estresse e suporte a equipe', null);

-- Tipos de atividade APR
INSERT INTO public.sms_apr_tipos_atividade (nome, descricao) VALUES
  ('Trabalho em Altura acima de 2m',  'Atividades executadas acima de 2 metros do nivel inferior'),
  ('Icamento e Movimentacao de Cargas','Operacoes com guindastes, talhas e materiais pesados'),
  ('Trabalho em Espaco Confinado',    'Entrada em espacos com acesso restrito e ventilacao limitada'),
  ('Servicos de Demolicao',           'Demolicao parcial ou total de estruturas'),
  ('Escavacao e Terraplenagem',       'Cortes de solo, escavacoes e taludes'),
  ('Servicos Eletricos Energizados',  'Manutencao ou instalacao em circuitos energizados'),
  ('Montagem de Andaimes',            'Instalacao e desmontagem de andaimes e plataformas'),
  ('Corte e Solda',                   'Servicos com macario, solda eletrica ou plasma'),
  ('Aplicacao de Produtos Quimicos',  'Manuseio de solventes, tintas, acidos ou produtos perigosos'),
  ('Operacao de Equipamentos Pesados','Retroescavadeira, motoniveladora, compactador, rolo compressor');

-- Riscos APR
INSERT INTO public.sms_apr_riscos_catalogo
  (nome, categoria, probabilidade_padrao, severidade_padrao)
VALUES
  ('Queda de altura',                  'Fisico',      'alta',  'critico'),
  ('Choque eletrico',                  'Eletrico',    'media', 'grave'),
  ('Soterramento',                     'Fisico',      'baixa', 'critico'),
  ('Atropelamento por equipamento',    'Mecanico',    'media', 'grave'),
  ('Queda de material sobre trabalhador','Fisico',    'alta',  'grave'),
  ('Exposicao a agente quimico',       'Quimico',     'media', 'moderado'),
  ('Ergonomico esforco repetitivo',    'Ergonomico',  'alta',  'leve'),
  ('Incendio explosao',                'Incendio',    'baixa', 'critico'),
  ('Ruido excessivo',                  'Fisico',      'alta',  'moderado'),
  ('Vibracao de ferramentas',          'Fisico',      'alta',  'leve'),
  ('Iluminacao inadequada',            'Fisico',      'media', 'leve'),
  ('Temperatura extrema',              'Fisico',      'media', 'moderado');

-- Catalogo de inspecoes
INSERT INTO public.sms_inspecoes_catalogo (titulo, tipo, periodicidade) VALUES
  ('Inspecao de Canteiro de Obras', 'geral',       'diaria'),
  ('Inspecao de EPIs',              'epi',         'semanal'),
  ('Inspecao de Andaimes',          'andaime',     'diaria'),
  ('Inspecao de Ferramentas',       'ferramentas', 'semanal');

-- Itens da inspecao: Canteiro de Obras
INSERT INTO public.sms_inspecoes_itens_catalogo
  (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio)
SELECT c.id, v.ordem, v.descricao, v.categoria, v.obrigatorio
FROM public.sms_inspecoes_catalogo c
CROSS JOIN (VALUES
  (1, 'Areas devidamente sinalizadas e isoladas',             'Sinalizacao',  true),
  (2, 'Vias de acesso livres e em bom estado',               'Circulacao',   true),
  (3, 'Materiais armazenados de forma segura e organizada',  'Ordem',        true),
  (4, 'Extintores visiveis, sinalizados e com validade ok',  'Incendio',     true),
  (5, 'Instalacoes eletricas provisorias protegidas',        'Eletrico',     true),
  (6, 'Banheiros e vestiarios limpos e em condicoes de uso', 'Higiene',      false),
  (7, 'Residuos descartados nos locais corretos',            'Meio Ambiente',false)
) AS v(ordem, descricao, categoria, obrigatorio)
WHERE c.titulo = 'Inspecao de Canteiro de Obras';

-- Itens da inspecao: EPIs
INSERT INTO public.sms_inspecoes_itens_catalogo
  (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio)
SELECT c.id, v.ordem, v.descricao, v.categoria, v.obrigatorio
FROM public.sms_inspecoes_catalogo c
CROSS JOIN (VALUES
  (1, 'Capacete sem trincas, amassados ou sinais de impacto',          'Cabeca',  true),
  (2, 'Oculos de seguranca limpos e sem arranhos',                     'Olhos',   true),
  (3, 'Luvas integras, sem cortes ou furos',                           'Maos',    true),
  (4, 'Botinas com CA valido e em bom estado',                         'Pes',     true),
  (5, 'Protetor auricular disponivel quando aplicavel',                'Audicao', false),
  (6, 'Cinto de seguranca inspecionado quando trabalho em altura',     'Altura',  false)
) AS v(ordem, descricao, categoria, obrigatorio)
WHERE c.titulo = 'Inspecao de EPIs';

-- Itens da inspecao: Andaimes
INSERT INTO public.sms_inspecoes_itens_catalogo
  (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio)
SELECT c.id, v.ordem, v.descricao, v.categoria, v.obrigatorio
FROM public.sms_inspecoes_catalogo c
CROSS JOIN (VALUES
  (1, 'Base nivelada e apoiada em superficie firme',            'Estrutura', true),
  (2, 'Travamentos e pinos de fixacao instalados',              'Fixacao',   true),
  (3, 'Guarda-corpos instalados em todos os lados abertos',    'Protecao',  true),
  (4, 'Rodapes instalados nas plataformas',                     'Protecao',  true),
  (5, 'Acesso seguro escada ou rampa',                          'Acesso',    true),
  (6, 'Plataformas sem danos, trincas ou deformacoes',         'Estrutura', true)
) AS v(ordem, descricao, categoria, obrigatorio)
WHERE c.titulo = 'Inspecao de Andaimes';

-- Itens da inspecao: Ferramentas
INSERT INTO public.sms_inspecoes_itens_catalogo
  (inspecao_catalogo_id, ordem, descricao, categoria, obrigatorio)
SELECT c.id, v.ordem, v.descricao, v.categoria, v.obrigatorio
FROM public.sms_inspecoes_catalogo c
CROSS JOIN (VALUES
  (1, 'Ferramentas sem cabos soltos, quebrados ou improvisados', 'Geral',       true),
  (2, 'Ferramentas eletricas com fio em bom estado',             'Eletrico',    true),
  (3, 'Discos e laminas de corte integros e adequados',          'Corte',       true),
  (4, 'Ferramentas armazenadas apos uso, fora do chao',          'Organizacao', false)
) AS v(ordem, descricao, categoria, obrigatorio)
WHERE c.titulo = 'Inspecao de Ferramentas';
