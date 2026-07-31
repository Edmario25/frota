import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhotoUploadProps {
  label: string;
  value?: string;
  onChange: (url: string | null) => void;
  bucketName: string;
  vehicleId?: string;
  disabled?: boolean;
  accept?: string;
}

export function PhotoUpload({
  label,
  value,
  onChange,
  bucketName,
  vehicleId,
  disabled = false,
  accept = "image/jpeg,image/png,image/webp"
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Por favor, selecione apenas arquivos JPEG, PNG ou WebP.",
        variant: "destructive",
      });
      return;
    }

    // Validar tamanho do arquivo (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 50MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Gerar nome único para o arquivo
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = vehicleId ? `${vehicleId}/${fileName}` : fileName;

      // Upload do arquivo
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obter URL pública
      const publicUrl = getImageUrl(filePath);
      
      // Criar preview local
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      onChange(publicUrl);
      
      toast({
        title: "Foto carregada",
        description: "A foto foi carregada com sucesso.",
      });

    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast({
        title: "Erro no upload",
        description: error.message || "Erro ao carregar a foto.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Limpar o input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    if (value && preview) {
      // Extrair o caminho do arquivo da URL
      try {
        const url = new URL(value);
        const pathParts = url.pathname.split('/');
        const filePath = pathParts.slice(-2).join('/'); // pegar vehicle_id/filename
        
        // Remover do storage
        await supabase.storage.from(bucketName).remove([filePath]);
      } catch (error) {
        console.error('Erro ao remover foto do storage:', error);
      }
    }
    
    setPreview(null);
    onChange(null);
    
    toast({
      title: "Foto removida",
      description: "A foto foi removida com sucesso.",
    });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {/* Preview da imagem */}
      {preview && (
        <div className="relative inline-block">
          <img
            src={preview}
            alt="Preview"
            className="w-32 h-32 object-cover rounded-lg border border-border"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
            onClick={handleRemove}
            disabled={disabled || uploading}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Botões de upload */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-2"
        >
          {uploading ? (
            <>
              <Upload className="h-4 w-4 animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              {preview ? 'Alterar Foto' : 'Carregar Foto'}
            </>
          )}
        </Button>

        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => window.open(preview, '_blank')}
            className="flex items-center gap-1"
          >
            <ImageIcon className="h-4 w-4" />
            Ver
          </Button>
        )}
      </div>

      {/* Input file oculto */}
      <Input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      <p className="text-xs text-muted-foreground">
        Formatos aceitos: JPEG, PNG, WebP. Tamanho máximo: 50MB.
      </p>
    </div>
  );
}