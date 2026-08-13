import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Camera, FileText, Loader2, X, ZoomIn } from "lucide-react";

// ─── Props ───────────────────────────────────────────────────────────────────
interface FotoUploaderProps {
  /** Storage bucket name */
  bucket?: string;
  /** Sub-folder inside the bucket, e.g. "desvios/2024" */
  folder?: string;
  /** Current array of public URLs */
  urls: string[];
  /** Called whenever the array changes */
  onChange: (urls: string[]) => void;
  /** Maximum number of files (default 10) */
  maxFiles?: number;
  /** Accept pattern (default images only) */
  accept?: string;
  /** Label shown on the add button */
  addLabel?: string;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function FotoUploader({
  bucket = "sms-midias",
  folder = "uploads",
  urls,
  onChange,
  maxFiles = 10,
  accept = "image/jpeg,image/png,image/webp,image/heic",
  addLabel = "Adicionar foto",
  className,
}: FotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const isPdf = (url: string) =>
    url.toLowerCase().includes(".pdf") || url.toLowerCase().includes("application%2fpdf");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxFiles - urls.length;
    if (remaining <= 0) return;

    setUploading(true);
    const newUrls: string[] = [];

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
    }

    onChange([...urls, ...newUrls]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeUrl(url: string) {
    onChange(urls.filter(u => u !== url));
  }

  const canAdd = urls.length < maxFiles && !uploading;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Thumbnails grid */}
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map(url => (
            <div key={url} className="relative group">
              {isPdf(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors gap-1 text-muted-foreground"
                >
                  <FileText className="h-7 w-7 text-red-500" />
                  <span className="text-[9px] font-medium">PDF</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="block w-20 h-20 rounded-lg overflow-hidden border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <img
                    src={url}
                    alt="evidência"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg">
                    <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 h-9 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {uploading ? "Enviando..." : addLabel}
          {!uploading && urls.length > 0 && (
            <span className="text-muted-foreground">({urls.length}/{maxFiles})</span>
          )}
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Evidência ampliada"
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─── Document variant (images + PDF) ─────────────────────────────────────────
export function DocumentoUploader(props: Omit<FotoUploaderProps, "accept" | "addLabel">) {
  return (
    <FotoUploader
      {...props}
      accept="image/jpeg,image/png,image/webp,application/pdf"
      addLabel="Anexar documento"
    />
  );
}
