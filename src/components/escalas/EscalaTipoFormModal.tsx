import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EscalaTipo, useEscalas } from "@/hooks/useEscalas";
import { useI18n } from "@/i18n";

const formSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(50, "Nome muito longo"),
  dias_trabalho: z.number().min(1, "Mínimo 1 dia").max(365, "Máximo 365 dias"),
  dias_folga: z.number().min(1, "Mínimo 1 dia").max(365, "Máximo 365 dias"),
  permite_sobreposicao: z.boolean(),
  descricao: z.string().max(500, "Descrição muito longa").optional(),
});

type FormData = z.infer<typeof formSchema>;

interface EscalaTipoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  escalaTipo?: EscalaTipo | null;
}

export const EscalaTipoFormModal = ({
  isOpen,
  onClose,
  escalaTipo,
}: EscalaTipoFormModalProps) => {
  const { t } = useI18n();
  const { createEscalaTipo, updateEscalaTipo } = useEscalas();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      dias_trabalho: 20,
      dias_folga: 7,
      permite_sobreposicao: false,
      descricao: "",
    },
  });

  React.useEffect(() => {
    if (escalaTipo) {
      form.reset({
        nome: escalaTipo.nome,
        dias_trabalho: escalaTipo.dias_trabalho,
        dias_folga: escalaTipo.dias_folga,
        permite_sobreposicao: escalaTipo.permite_sobreposicao,
        descricao: escalaTipo.descricao || "",
      });
    } else {
      form.reset({
        nome: "",
        dias_trabalho: 20,
        dias_folga: 7,
        permite_sobreposicao: false,
        descricao: "",
      });
    }
  }, [escalaTipo, form]);

  const onSubmit = async (data: FormData) => {
    try {
      if (escalaTipo) {
        await updateEscalaTipo(escalaTipo.id, {
          nome: data.nome,
          dias_trabalho: data.dias_trabalho,
          dias_folga: data.dias_folga,
          permite_sobreposicao: data.permite_sobreposicao,
          descricao: data.descricao || null,
        });
      } else {
        await createEscalaTipo({
          nome: data.nome,
          dias_trabalho: data.dias_trabalho,
          dias_folga: data.dias_folga,
          permite_sobreposicao: data.permite_sobreposicao,
          descricao: data.descricao || null,
        });
      }
      onClose();
      form.reset();
    } catch (error) {
      console.error("Error saving escala tipo:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {escalaTipo ? t("Editar Tipo de Escala") : t("Novo Tipo de Escala")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Nome")}</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 20x7" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dias_trabalho"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Dias de Trabalho")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dias_folga"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Dias de Folga")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="permite_sobreposicao"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t("Permitir Sobreposição")}</FormLabel>
                    <FormDescription>
                      {t("Permitir que funcionários da mesma função tirem folga simultaneamente")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Descrição")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("Descrição opcional...")}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                {t("Cancelar")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? t("Salvando...")
                  : escalaTipo
                  ? t("Atualizar")
                  : t("Salvar")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
