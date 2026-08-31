// Nunca executa escrita sem --apply. Remoção de originais públicos exige outra opção explícita.
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function legacyPath(raw,base){
 const u=new URL(raw),b=new URL(base);const prefix='/storage/v1/object/public/sms-midias/';
 if(u.origin!==b.origin||!u.pathname.startsWith(prefix))throw new Error('Origem não reconhecida; exige revisão manual.');
 const path=decodeURIComponent(u.pathname.slice(prefix.length));
 if(!path.startsWith('admissao/')||path.includes('..')||path.includes('\\')||u.search)throw new Error('Objeto fora da pasta admissao; exige revisão manual.');
 return path;
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function run(){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. Não coloque a chave em arquivos do projeto.');
 const client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const apply=process.argv.includes('--apply'),remove=process.argv.includes('--remove-public-originals');
 let files=[],offset=0;
 for(;;){const {data,error}=await client.from('sms_admissao_arquivos').select('*').not('legado_url','is',null).order('id').range(offset,offset+499);if(error)throw error;files.push(...data);if(data.length<500)break;offset+=500;}
 const groups=new Map();for(const f of files){try{const path=legacyPath(f.legado_url,base);groups.set(path,[...(groups.get(path)||[]),f]);}catch(e){console.error(`Anexo ${f.id}: ${e.message}`);}}
 console.log(`${files.length} referências legadas; ${groups.size} objetos elegíveis. Modo: ${apply?'EXECUÇÃO':'SIMULAÇÃO'}.`);
 if(!apply)return;
 for(const [path,refs] of groups){
  try{
   const source=await client.storage.from('sms-midias').download(path);
   let bytes=source.data?Buffer.from(await source.data.arrayBuffer()):null;
   if(source.error){
    if(String(source.error.statusCode)!=='404')throw new Error('Não foi possível conferir o original. Nenhuma remoção será feita; verifique conexão e permissões.');
    // Retomada após remoção pública concluída mas atualização de referências interrompida.
    const previous=refs.find(f=>f.caminho&&f.migracao_sha256);
    if(!previous)throw new Error('Original indisponível e nenhuma cópia verificada para retomada.');
    const copy=await client.storage.from('admissao-documentos').download(previous.caminho);if(copy.error)throw copy.error;
    bytes=Buffer.from(await copy.data.arrayBuffer());if(sha(bytes)!==previous.migracao_sha256)throw new Error('Cópia divergente; interrompido.');
    // Não confundir falha de rede/permissão com ausência do objeto: a remoção explícita será repetida abaixo.
   }
   const hash=sha(bytes),ext=path.split('.').pop().toLowerCase();
   const mime={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[ext];
   if(!mime||bytes.length>10485760)throw new Error('Formato/tamanho exige revisão manual.');
   for(const f of refs){
    const target=f.caminho||`${f.admissao_id}/${f.id}.${ext==='jpeg'?'jpg':ext}`;
    const upload=await client.storage.from('admissao-documentos').upload(target,bytes,{contentType:mime,upsert:false});
    // Mesmo se já existir, nunca sobrescrever: comparar todos os bytes.
    const check=await client.storage.from('admissao-documentos').download(target);if(check.error)throw upload.error||check.error;
    if(sha(Buffer.from(await check.data.arrayBuffer()))!==hash)throw new Error('Verificação de integridade falhou; original mantido.');
    const {error}=await client.from('sms_admissao_arquivos').update({caminho:target,migracao_sha256:hash}).eq('id',f.id).eq('legado_url',f.legado_url);if(error)throw error;
    f.caminho=target;
   }
   if(!remove){console.log(`Cópias privadas verificadas para ${refs.length} referências. Originais mantidos; execute com --remove-public-originals para proteger o legado.`);continue;}
   const deletion=await client.storage.from('sms-midias').remove([path]);if(deletion.error)throw deletion.error;
   for(const f of refs){
    const {error:hError}=await client.from('sms_admissao_historico').insert({admissao_id:f.admissao_id,evento:'migracao_privacidade',motivo:'Cópia SHA-256 verificada; original público removido pelo operador',dados:{arquivo_id:f.id,origem:path,destino:f.caminho,sha256:hash}});if(hError)throw hError;
    // Marcador privado preserva a posição da referência antiga sem criar um novo link público.
    const {data:adm,error:aError}=await client.from('sms_admissoes').select('documentos_urls').eq('id',f.admissao_id).single();if(aError)throw aError;
    const {error:uError}=await client.from('sms_admissoes').update({documentos_urls:(adm.documentos_urls||[]).map(url=>url===f.legado_url?`private:admissao-documentos/${f.caminho}`:url)}).eq('id',f.admissao_id);if(uError)throw uError;
    const {error}=await client.from('sms_admissao_arquivos').update({legado_url:null,confirmado:true}).eq('id',f.id);if(error)throw error;
   }
   console.log(`Protegidas ${refs.length} referências; cópia privada mantida para recuperação.`);
  }catch(e){console.error(`Grupo com ${refs.length} referências não concluído: ${e.message}`);process.exitCode=1;}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
