import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { useI18n } from "@/i18n";

interface ObraFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra?: any;
}

export function ObraFormModal({ isOpen, onClose, obra }: ObraFormModalProps) {
  const { t } = useI18n();
  const { createObra, updateObra } = useObras();
  const { employees, refetchEmployees } = useEmployees();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    codigo_interno: "",
    endereco: "",
    cidade: "",
    estado: "",
    coordenadas_gps: "",
    cliente_nome: "",
    cliente_cnpj: "",
    data_inicio_prevista: "",
    data_termino_prevista: "",
    status: "planejada",
    responsavel_tecnico: "",
    responsavel_tecnico_id: "",
    numero_contrato: "",
    objeto_contrato: "",
    valor_contrato: "",
    centro_custo: "",
    tipo_obra: "",
    data_inicio_real: "",
    data_termino_real: "",
    gerente_obra_id: "",
    responsavel_sms_id: "",
    responsavel_qualidade_id: "",
    contato_cliente_nome: "",
    contato_cliente_email: "",
    contato_cliente_telefone: "",
    motivo_status: "",
    observacoes: "",
  });

  useEffect(() => {
    if (isOpen) {
      refetchEmployees(); // Recarregar funcionários sempre que abrir
    }
    
    if (obra) {
      setFormData({
        nome: obra.nome || "",
        codigo_interno: obra.codigo_interno || "",
        endereco: obra.endereco || "",
        cidade: obra.cidade || "",
        estado: obra.estado || "",
        coordenadas_gps: obra.coordenadas_gps || "",
        cliente_nome: obra.cliente_nome || "",
        cliente_cnpj: obra.cliente_cnpj || "",
        data_inicio_prevista: obra.data_inicio_prevista || "",
        data_termino_prevista: obra.data_termino_prevista || "",
        status: obra.status || "planejada",
        responsavel_tecnico: obra.responsavel_tecnico || "",
        responsavel_tecnico_id: obra.responsavel_tecnico_id || "",
        numero_contrato: obra.numero_contrato || "", objeto_contrato: obra.objeto_contrato || "",
        valor_contrato: obra.valor_contrato?.toString() || "", centro_custo: obra.centro_custo || "", tipo_obra: obra.tipo_obra || "",
        data_inicio_real: obra.data_inicio_real || "", data_termino_real: obra.data_termino_real || "",
        gerente_obra_id: obra.gerente_obra_id || "", responsavel_sms_id: obra.responsavel_sms_id || "",
        responsavel_qualidade_id: obra.responsavel_qualidade_id || "", contato_cliente_nome: obra.contato_cliente_nome || "",
        contato_cliente_email: obra.contato_cliente_email || "", contato_cliente_telefone: obra.contato_cliente_telefone || "",
        motivo_status: "",
        observacoes: obra.observacoes || "",
      });
    } else {
      setFormData({
        nome: "",
        codigo_interno: "",
        endereco: "",
        cidade: "",
        estado: "",
        coordenadas_gps: "",
        cliente_nome: "",
        cliente_cnpj: "",
        data_inicio_prevista: "",
        data_termino_prevista: "",
        status: "planejada",
        responsavel_tecnico: "",
        responsavel_tecnico_id: "",
        numero_contrato: "", objeto_contrato: "", valor_contrato: "", centro_custo: "", tipo_obra: "",
        data_inicio_real: "", data_termino_real: "", gerente_obra_id: "", responsavel_sms_id: "",
        responsavel_qualidade_id: "", contato_cliente_nome: "", contato_cliente_email: "", contato_cliente_telefone: "", motivo_status: "",
        observacoes: "",
      });
    }
  }, [obra, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        data_inicio_prevista: formData.data_inicio_prevista || null,
        data_termino_prevista: formData.data_termino_prevista || null,
        responsavel_tecnico_id: formData.responsavel_tecnico_id || null,
        gerente_obra_id: formData.gerente_obra_id || null,
        responsavel_sms_id: formData.responsavel_sms_id || null,
        responsavel_qualidade_id: formData.responsavel_qualidade_id || null,
        data_inicio_real: formData.data_inicio_real || null,
        data_termino_real: formData.data_termino_real || null,
        valor_contrato: formData.valor_contrato ? Number(formData.valor_contrato) : null,
      };

      if (obra) {
        await updateObra(obra.id, data);
      } else {
        await createObra(data);
      }
      onClose();
    } catch (error) {
      console.error("Erro ao salvar obra:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{obra ? t("Editar Obra") : t("Nova Obra")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-semibold">{t("Identificação e contrato")}</p>
            <p className="text-xs text-muted-foreground">{t("Dados usados em RDOs, relatórios, orçamento e portal do cliente.")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">{t("Nome da Obra")} *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="codigo_interno">{t("Código Interno")}</Label>
              <Input
                id="codigo_interno"
                value={formData.codigo_interno}
                onChange={(e) => handleChange("codigo_interno", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label htmlFor="numero_contrato">{t("Nº do Contrato")}</Label><Input id="numero_contrato" value={formData.numero_contrato} onChange={e => handleChange("numero_contrato", e.target.value)} /></div>
            <div><Label htmlFor="centro_custo">{t("Centro de Custo")}</Label><Input id="centro_custo" value={formData.centro_custo} onChange={e => handleChange("centro_custo", e.target.value)} /></div>
            <div><Label htmlFor="tipo_obra">{t("Tipo de Obra")}</Label><Input id="tipo_obra" value={formData.tipo_obra} onChange={e => handleChange("tipo_obra", e.target.value)} placeholder={t("Ex.: civil, industrial")} /></div>
          </div>
          <div><Label htmlFor="objeto_contrato">{t("Objeto do Contrato")}</Label><Textarea id="objeto_contrato" value={formData.objeto_contrato} onChange={e => handleChange("objeto_contrato", e.target.value)} rows={2} /></div>
          <div><Label htmlFor="valor_contrato">{t("Valor Contratado (R$)")}</Label><Input id="valor_contrato" type="number" min="0" step="0.01" value={formData.valor_contrato} onChange={e => handleChange("valor_contrato", e.target.value)} /></div>

          <div>
            <Label htmlFor="endereco">{t("Endereço")}</Label>
            <Input
              id="endereco"
              value={formData.endereco}
              onChange={(e) => handleChange("endereco", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label htmlFor="data_inicio_real">{t("Início Real")}</Label><Input id="data_inicio_real" type="date" value={formData.data_inicio_real} onChange={e => handleChange("data_inicio_real", e.target.value)} /></div>
            <div><Label htmlFor="data_termino_real">{t("Término Real")}</Label><Input id="data_termino_real" type="date" value={formData.data_termino_real} onChange={e => handleChange("data_termino_real", e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cidade">{t("Cidade")}</Label>
              <Input
                id="cidade"
                value={formData.cidade}
                onChange={(e) => handleChange("cidade", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="estado">{t("Estado")}</Label>
              <Input
                id="estado"
                value={formData.estado}
                onChange={(e) => handleChange("estado", e.target.value)}
              />
            </div>
          </div>

          {(formData.status === "pausada" || formData.status === "concluida") && obra?.status !== formData.status && (
            <div><Label htmlFor="motivo_status">{t("Justificativa da alteração")} *</Label><Textarea id="motivo_status" value={formData.motivo_status} onChange={e => handleChange("motivo_status", e.target.value)} required rows={2} placeholder={t("Informe o motivo e as condições da mudança de fase")} /></div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              ["gerente_obra_id", t("Gerente da Obra")], ["responsavel_sms_id", t("Responsável SMS")], ["responsavel_qualidade_id", t("Responsável Qualidade")],
            ].map(([field, label]) => (
              <div key={field}><Label>{label}</Label><Select value={(formData as any)[field]} onValueChange={value => handleChange(field, value)}><SelectTrigger><SelectValue placeholder={t("Selecione")} /></SelectTrigger><SelectContent>{employees.filter(e => e.status === "ativo").map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3"><p className="text-sm font-semibold">{t("Contato do cliente")}</p></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>{t("Responsável")}</Label><Input value={formData.contato_cliente_nome} onChange={e => handleChange("contato_cliente_nome", e.target.value)} /></div>
            <div><Label>{t("E-mail")}</Label><Input type="email" value={formData.contato_cliente_email} onChange={e => handleChange("contato_cliente_email", e.target.value)} /></div>
            <div><Label>{t("Telefone")}</Label><Input value={formData.contato_cliente_telefone} onChange={e => handleChange("contato_cliente_telefone", e.target.value)} /></div>
          </div>

          <div>
            <Label htmlFor="coordenadas_gps">{t("Coordenadas GPS")}</Label>
            <Input
              id="coordenadas_gps"
              value={formData.coordenadas_gps}
              onChange={(e) => handleChange("coordenadas_gps", e.target.value)}
              placeholder={t("Ex: -15.7942, -47.8822")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cliente_nome">{t("Cliente/Contratante")} *</Label>
              <Input
                id="cliente_nome"
                value={formData.cliente_nome}
                onChange={(e) => handleChange("cliente_nome", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="cliente_cnpj">{t("CNPJ do Cliente")}</Label>
              <Input
                id="cliente_cnpj"
                value={formData.cliente_cnpj}
                onChange={(e) => handleChange("cliente_cnpj", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="data_inicio_prevista">{t("Data de Início Prevista")}</Label>
              <Input
                id="data_inicio_prevista"
                type="date"
                value={formData.data_inicio_prevista}
                onChange={(e) => handleChange("data_inicio_prevista", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="data_termino_prevista">{t("Data de Término Prevista")}</Label>
              <Input
                id="data_termino_prevista"
                type="date"
                value={formData.data_termino_prevista}
                onChange={(e) => handleChange("data_termino_prevista", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">{t("Status da Obra")} *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => handleChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecione o status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejada">{t("Planejada")}</SelectItem>
                  <SelectItem value="em_andamento">{t("Em Andamento")}</SelectItem>
                  <SelectItem value="pausada">{t("Pausada")}</SelectItem>
                  <SelectItem value="concluida">{t("Concluída")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="responsavel_tecnico_id">{t("Responsável Técnico")}</Label>
              <Select 
                value={formData.responsavel_tecnico_id} 
                onValueChange={(value) => handleChange("responsavel_tecnico_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecione um responsável técnico")} />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <SelectItem value="no-employees" disabled>{t("Nenhum funcionário disponível")}</SelectItem>
                  ) : (
                    employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.nome} - {employee.cargos?.nome || t("Sem cargo")}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="responsavel_tecnico">{t("Responsável (texto legado)")}</Label>
            <Input
              id="responsavel_tecnico"
              value={formData.responsavel_tecnico}
              onChange={(e) => handleChange("responsavel_tecnico", e.target.value)}
              placeholder={t("Campo legado - use o campo responsável técnico acima")}
            />
          </div>

          <div>
            <Label htmlFor="observacoes">{t("Observações")}</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange("observacoes", e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("Salvando...") : obra ? t("Atualizar") : t("Criar")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
