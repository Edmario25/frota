BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.employee_ponto_crachas(
 employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), atualizado_em timestamptz NOT NULL DEFAULT now(), atualizado_por uuid REFERENCES auth.users(id)
);
INSERT INTO public.employee_ponto_crachas(employee_id) SELECT id FROM public.employees ON CONFLICT(employee_id) DO NOTHING;
ALTER TABLE public.employee_ponto_crachas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_ponto_crachas FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.criar_token_cracha_employee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO employee_ponto_crachas(employee_id) VALUES(NEW.id) ON CONFLICT(employee_id) DO NOTHING;RETURN NEW;END $$;
CREATE TRIGGER employee_ponto_cracha_novo AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.criar_token_cracha_employee();
ALTER TABLE public.employee_ponto_qr
 ADD COLUMN IF NOT EXISTS evento text,
 ADD COLUMN IF NOT EXISTS dispositivo_id uuid,
 ADD COLUMN IF NOT EXISTS recebido_em timestamptz NOT NULL DEFAULT now();
UPDATE public.employee_ponto_qr SET evento=CASE WHEN tipo='entrada' THEN 'entrada' ELSE 'saida' END WHERE evento IS NULL;
ALTER TABLE public.employee_ponto_qr ALTER COLUMN evento SET NOT NULL;
ALTER TABLE public.employee_ponto_qr DROP CONSTRAINT IF EXISTS employee_ponto_qr_evento_check;
ALTER TABLE public.employee_ponto_qr ADD CONSTRAINT employee_ponto_qr_evento_check CHECK(evento IN ('entrada','intervalo_saida','intervalo_retorno','saida'));

CREATE TABLE public.ponto_totem_dispositivos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obra_id uuid NOT NULL REFERENCES public.obras(id), nome text NOT NULL,
 segredo_hash bytea NOT NULL, ativo boolean NOT NULL DEFAULT true, versao_app text,
 criado_por uuid REFERENCES auth.users(id), criado_em timestamptz NOT NULL DEFAULT now(),
 ultimo_acesso_em timestamptz, ultimo_ip inet, UNIQUE(obra_id,nome)
);
ALTER TABLE public.employee_ponto_qr ADD CONSTRAINT employee_ponto_qr_dispositivo_fk FOREIGN KEY(dispositivo_id) REFERENCES public.ponto_totem_dispositivos(id);
CREATE INDEX IF NOT EXISTS employee_ponto_qr_device_time_idx ON public.employee_ponto_qr(dispositivo_id,registrado_em DESC);
ALTER TABLE public.ponto_totem_dispositivos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ponto_totem_dispositivos FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.criar_ponto_totem(p_obra uuid,p_nome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE segredo text:=gen_random_uuid()::text||gen_random_uuid()::text; d ponto_totem_dispositivos;
BEGIN
 IF NOT public.can_manage_sms_obra(p_obra) OR public.get_user_role(auth.uid()) NOT IN ('admin','gestor_contrato','gestor_obra') THEN RAISE EXCEPTION 'Gestão da obra necessária'; END IF;
 IF length(trim(coalesce(p_nome,'')))<3 THEN RAISE EXCEPTION 'Informe o nome do equipamento'; END IF;
 INSERT INTO ponto_totem_dispositivos(obra_id,nome,segredo_hash,criado_por) VALUES(p_obra,trim(p_nome),digest(segredo,'sha256'),auth.uid()) RETURNING * INTO d;
 RETURN jsonb_build_object('id',d.id,'obra_id',d.obra_id,'segredo',segredo,'aviso','O segredo é exibido uma única vez');
END $$;
CREATE FUNCTION public.redefinir_segredo_ponto_totem(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE segredo text:=gen_random_uuid()::text||gen_random_uuid()::text; d ponto_totem_dispositivos;
BEGIN
 SELECT * INTO d FROM ponto_totem_dispositivos WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR NOT public.can_manage_sms_obra(d.obra_id) OR public.get_user_role(auth.uid()) NOT IN ('admin','gestor_contrato','gestor_obra') THEN RAISE EXCEPTION 'Gestão da obra necessária'; END IF;
 UPDATE ponto_totem_dispositivos SET segredo_hash=digest(segredo,'sha256'),ultimo_acesso_em=NULL WHERE id=d.id;
 RETURN segredo;
END $$;
CREATE FUNCTION public.definir_status_ponto_totem(p_id uuid,p_ativo boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d ponto_totem_dispositivos;
BEGIN
 SELECT * INTO d FROM ponto_totem_dispositivos WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR NOT public.can_manage_sms_obra(d.obra_id) OR public.get_user_role(auth.uid()) NOT IN ('admin','gestor_contrato','gestor_obra') THEN RAISE EXCEPTION 'Gestão da obra necessária'; END IF;
 UPDATE ponto_totem_dispositivos SET ativo=p_ativo WHERE id=d.id;
END $$;
CREATE FUNCTION public.listar_ponto_totens() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('pode_criar',public.get_user_role(auth.uid()) IN ('admin','gestor_contrato','gestor_obra'),
 'itens',coalesce(jsonb_agg(jsonb_build_object('id',d.id,'obra_id',d.obra_id,'obra',o.nome,'nome',d.nome,'ativo',d.ativo,'versao',d.versao_app,'ultimo_acesso',d.ultimo_acesso_em) ORDER BY o.nome,d.nome) FILTER(WHERE d.id IS NOT NULL),'[]'))
 FROM obras o LEFT JOIN ponto_totem_dispositivos d ON d.obra_id=o.id WHERE public.can_manage_sms_obra(o.id);
$$;
CREATE FUNCTION public.obter_token_cracha(p_employee uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$
 SELECT 'APICE:1:'||c.token::text FROM employee_ponto_crachas c WHERE c.employee_id=p_employee AND public.can_manage_employee_record(c.employee_id);
$$;
CREATE FUNCTION public.renovar_token_cracha(p_employee uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE novo uuid:=gen_random_uuid();
BEGIN
 IF NOT public.can_manage_employee_record(p_employee) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 INSERT INTO employee_ponto_crachas(employee_id,token,atualizado_por) VALUES(p_employee,novo,auth.uid())
 ON CONFLICT(employee_id) DO UPDATE SET token=EXCLUDED.token,atualizado_em=now(),atualizado_por=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
 RETURN 'APICE:1:'||novo::text;
END $$;

CREATE FUNCTION public.validar_ponto_totem(p_device uuid,p_secret text,p_version text) RETURNS ponto_totem_dispositivos
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE d ponto_totem_dispositivos;
BEGIN
 SELECT * INTO d FROM ponto_totem_dispositivos WHERE id=p_device AND ativo AND segredo_hash=digest(coalesce(p_secret,''),'sha256') FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Equipamento não autorizado'; END IF;
 UPDATE ponto_totem_dispositivos SET ultimo_acesso_em=now(),versao_app=left(p_version,40),ultimo_ip=inet_client_addr() WHERE id=d.id;
 RETURN d;
END $$;
CREATE FUNCTION public.consultar_ponto_totem(p_cracha text,p_device uuid,p_secret text,p_version text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE d ponto_totem_dispositivos; e record; ultimo text; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; permitidos text[];
BEGIN
 d:=public.validar_ponto_totem(p_device,p_secret,coalesce(p_version,''));
 SELECT e0.id,e0.nome,e0.foto_url,e0.status,c.nome cargo INTO e FROM employee_ponto_crachas pc JOIN employees e0 ON e0.id=pc.employee_id LEFT JOIN cargos c ON c.id=e0.cargo_id
 WHERE 'APICE:1:'||pc.token::text=p_cracha;
 IF e.id IS NULL OR e.status<>'ativo' OR NOT EXISTS(SELECT 1 FROM obra_funcionarios v WHERE v.employee_id=e.id AND v.obra_id=d.obra_id AND v.status) THEN RAISE EXCEPTION 'Crachá inválido para este local'; END IF;
 SELECT evento INTO ultimo FROM employee_ponto_qr WHERE employee_id=e.id AND (registrado_em AT TIME ZONE 'America/Sao_Paulo')::date=hoje ORDER BY registrado_em DESC,id DESC LIMIT 1;
 permitidos:=CASE ultimo WHEN 'entrada' THEN ARRAY['intervalo_saida','saida'] WHEN 'intervalo_saida' THEN ARRAY['intervalo_retorno'] WHEN 'intervalo_retorno' THEN ARRAY['intervalo_saida','saida'] WHEN 'saida' THEN ARRAY[]::text[] ELSE ARRAY['entrada'] END;
 RETURN jsonb_build_object('employee_id',e.id,'nome',e.nome,'foto_url',e.foto_url,'cargo',coalesce(e.cargo,''),'obra',d.obra_id,'eventos',permitidos);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_ponto_totem(p_cracha text,p_device uuid,p_secret text,p_evento text,p_version text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE d ponto_totem_dispositivos; consulta jsonb; v_employee_id uuid; permitido boolean; registrado timestamptz:=now(); tipo_final text;
BEGIN
 d:=public.validar_ponto_totem(p_device,p_secret,coalesce(p_version,''));
 consulta:=public.consultar_ponto_totem(p_cracha,p_device,p_secret,p_version); v_employee_id:=(consulta->>'employee_id')::uuid;
 permitido:=coalesce((consulta->'eventos') ? p_evento,false);
 IF NOT permitido THEN RAISE EXCEPTION 'Sequência de jornada inválida. Leia novamente o crachá'; END IF;
 PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text,0));
 -- Revalida dentro da trava para impedir duas leituras concorrentes.
 consulta:=public.consultar_ponto_totem(p_cracha,p_device,p_secret,p_version);
 IF NOT coalesce((consulta->'eventos') ? p_evento,false) THEN RAISE EXCEPTION 'Registro já realizado. Leia novamente o crachá'; END IF;
 IF EXISTS(SELECT 1 FROM employee_ponto_qr WHERE employee_id=v_employee_id AND registrado_em>registrado-interval '30 seconds') THEN RAISE EXCEPTION 'Registro já realizado recentemente'; END IF;
 tipo_final:=CASE WHEN p_evento IN ('entrada','intervalo_retorno') THEN 'entrada' ELSE 'saida' END;
 INSERT INTO employee_ponto_qr(employee_id,obra_id,tipo,evento,dispositivo_id,registrado_por,metodo,registrado_em)
 VALUES(v_employee_id,d.obra_id,tipo_final,p_evento,d.id,NULL,'qr',registrado);
 RETURN consulta-'eventos'||jsonb_build_object('tipo',tipo_final,'evento',p_evento,'registrado_em',registrado,'totem',d.nome);
END $$;

-- Remove a assinatura anônima antiga imediatamente.
REVOKE ALL ON FUNCTION public.registrar_ponto_totem(uuid,uuid) FROM PUBLIC,anon,authenticated;
DROP FUNCTION public.registrar_ponto_totem(uuid,uuid);
REVOKE ALL ON FUNCTION public.criar_ponto_totem(uuid,text),public.redefinir_segredo_ponto_totem(uuid),public.definir_status_ponto_totem(uuid,boolean),public.listar_ponto_totens(),public.obter_token_cracha(uuid),public.renovar_token_cracha(uuid),public.validar_ponto_totem(uuid,text,text),public.consultar_ponto_totem(text,uuid,text,text),public.registrar_ponto_totem(text,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.criar_ponto_totem(uuid,text),public.redefinir_segredo_ponto_totem(uuid),public.definir_status_ponto_totem(uuid,boolean),public.listar_ponto_totens(),public.obter_token_cracha(uuid),public.renovar_token_cracha(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_ponto_totem(text,uuid,text,text),public.registrar_ponto_totem(text,uuid,text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.validar_ponto_totem(uuid,text,text) FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.criar_token_cracha_employee() FROM PUBLIC,anon,authenticated;
COMMIT;
