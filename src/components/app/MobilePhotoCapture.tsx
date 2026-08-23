import { useState, useRef } from "react";
import { Camera, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Componente de captura de foto para o app mobile do motorista.
 * Faz upload direto para o Supabase Storage e retorna a URL pública.
 */
export function MobilePhotoCapture({ label, bucket, vehicleId, value, onChange }: {
  label: string;
  bucket: string;
  vehicleId?: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string>(value);
  const fileRef                   = useRef<HTMLInputElement>(null);
  const { toast }                 = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 50MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const path = vehicleId ? `${vehicleId}/${name}` : name;

      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw error;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);

      // preview local (sem depender da URL pública que pode demorar)
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);

      toast({ title: "Foto carregada ✓" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (value) {
      try {
        const url   = new URL(value);
        const parts = url.pathname.split("/");
        const path  = parts.slice(-2).join("/");
        await supabase.storage.from(bucket).remove([path]);
      } catch { /* A remoção é apenas uma limpeza de melhor esforço. */ }
    }
    setPreview("");
    onChange("");
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>

      {preview ? (
        <div className="relative inline-block w-full">
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-48 object-cover rounded-xl border border-slate-200 dark:border-slate-600"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={() => window.open(preview, "_blank")}
              className="h-8 w-8 rounded-full bg-black/50 flex items-center justify-center"
            >
              <ImageIcon className="h-4 w-4 text-white" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="h-8 w-8 rounded-full bg-red-500/80 flex items-center justify-center"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={cn(
            "w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl",
            "flex flex-col items-center justify-center gap-2 text-slate-400",
            "active:bg-slate-100 dark:active:bg-slate-700 transition-colors",
            uploading && "opacity-60"
          )}
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Enviando...</span>
            </>
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-xs font-medium">Tirar foto / Galeria</span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
