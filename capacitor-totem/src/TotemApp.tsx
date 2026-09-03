import {TotemScreen} from './TotemScreen'
const id=import.meta.env.VITE_TOTEM_DEVICE_ID||'',secret=import.meta.env.VITE_TOTEM_DEVICE_SECRET||'',version=import.meta.env.VITE_APP_VERSION||'1.1.0'
export function TotemApp(){return id&&secret?<TotemScreen deviceId={id} deviceSecret={secret} appVersion={version}/>:<div className="config-error"><b>Totem não configurado</b><span>Cadastre este equipamento e gere novamente o APK.</span><small>Versão {version}</small></div>}
