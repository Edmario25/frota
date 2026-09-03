import {createClient} from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if(!url||!key)throw new Error('Supabase não configurado no build do totem')
export const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
