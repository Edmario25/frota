import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { Database } from "@/integrations/supabase/types";

type RentalCompany = Database['public']['Tables']['rental_companies']['Row'];
type RentalCompanyInsert = Database['public']['Tables']['rental_companies']['Insert'];

const rentalCompanyFormSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  cnpj: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  endereco: z.string().optional(),
  contato_responsavel: z.string().optional(),
  observacoes: z.string().optional(),
});

interface RentalCompanyFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalCompany?: RentalCompany;
  onSubmit: (data: RentalCompanyInsert) => Promise<void>;
}

export const RentalCompanyFormModal = ({ 
  open, 
  onOpenChange, 
  rentalCompany, 
  onSubmit 
}: RentalCompanyFormModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof rentalCompanyFormSchema>>({
    resolver: zodResolver(rentalCompanyFormSchema),
    defaultValues: {
      nome: "",
      cnpj: "",
      telefone: "",
      email: "",
      endereco: "",
      contato_responsavel: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (rentalCompany) {
      form.reset({
        nome: rentalCompany.nome,
        cnpj: rentalCompany.cnpj || "",
        telefone: rentalCompany.telefone || "",
        email: rentalCompany.email || "",
        endereco: rentalCompany.endereco || "",
        contato_responsavel: rentalCompany.contato_responsavel || "",
        observacoes: rentalCompany.observacoes || "",
      });
    } else {
      form.reset({
        nome: "",
        cnpj: "",
        telefone: "",
        email: "",
        endereco: "",
        contato_responsavel: "",
        observacoes: "",
      });
    }
  }, [rentalCompany, form]);

  const handleSubmit = async (values: z.infer<typeof rentalCompanyFormSchema>) => {
    setIsSubmitting(true);
    try {
      const companyData = {
        nome: values.nome,
        cnpj: values.cnpj || null,
        telefone: values.telefone || null,
        email: values.email || null,
        endereco: values.endereco || null,
        contato_responsavel: values.contato_responsavel || null,
        observacoes: values.observacoes || null,
      };
      
      await onSubmit(companyData);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error is handled in the hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rentalCompany ? "Editar Locadora" : "Nova Locadora"}</DialogTitle>
          <DialogDescription>
            {rentalCompany ? "Edite as informações da locadora" : "Cadastre uma nova locadora"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Locadora</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da empresa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="contato@locadora.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="contato_responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contato Responsável</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do responsável" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Endereço completo da locadora..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Observações sobre a locadora..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : rentalCompany ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};