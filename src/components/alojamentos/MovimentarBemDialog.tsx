import { useEffect, useState } from "react";
import { Loader2, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dados, ESTADO_BEM, localDoBem } from "./shared";

const GERAL = "__geral";
const QUARTO_TODO = "__quarto";

interface Props {
  bem: any | null;
  onClose: () => void;
  dados: Dados;
  onDone: () => void;
}

export function MovimentarBemDialog({ bem, onClose, dados, onDone }: Props) {
  const [unidade, setUnidade] = useState("");
  const [ambiente, setAmbiente] = useState(GERAL);
  const [leito, setLeito] = useState(QUARTO_TODO);
  const [estado, setEstado] = useState("manter");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!bem) return;
    setUnidade(bem.alojamento_id);
    setAmbiente(bem.ambiente_id ?? GERAL);
    setLeito(bem.leito_id ?? QUARTO_TODO);
    setEstado("manter");
    setMotivo("");
  }, [bem]);

  if (!bem) return null;

  const ambientes = dados.ambientes
    .filter(a => a.alojamento_id === unidade && a.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const ehQuarto = dados.quartos.some(q => q.id === ambiente);
  const leitos = ehQuarto ? dados.leitos.filter(l => l.quarto_id === ambiente) : [];

  const mesmoLugar =
    unidade === bem.alojamento_id &&
    (ambiente === GERAL ? null : ambiente) === (bem.ambiente_id ?? null) &&
    (leito === QUARTO_TODO || !ehQuarto ? null : leito) === (bem.leito_id ?? null);

  async function salvar() {
    if (motivo.trim().length < 3) return toast.error("Informe o motivo da movimentação.");
    if (mesmoLugar && estado === "manter") return toast.error("Escolha outro local ou altere o estado.");
    setSalvando(true);
    const { error } = await (supabase as any).rpc("alojamento_movimentar_bem", {
      p_bem: bem.id,
      p_alojamento: unidade,
      p_ambiente: ambiente === GERAL ? null : ambiente,
      p_leito: !ehQuarto || leito === QUARTO_TODO ? null : leito,
      p_motivo: motivo.trim(),
      p_estado: estado === "manter" ? null : estado,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(mesmoLugar ? "Estado do bem atualizado." : "Bem movimentado e registrado no histórico.");
    onClose();
    onDone();
  }

  return (
    <Dialog open={!!bem} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar bem</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="font-medium">{bem.descricao}</p>
            <p className="font-mono text-xs text-muted-foreground">{bem.tombamento}</p>
            <p className="mt-1 text-xs text-muted-foreground">Hoje em: {localDoBem(bem, dados)}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Unidade de destino</Label>
            <Select value={unidade} onValueChange={v => { setUnidade(v); setAmbiente(GERAL); setLeito(QUARTO_TODO); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {dados.unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select value={ambiente} onValueChange={v => { setAmbiente(v); setLeito(QUARTO_TODO); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GERAL}>Área geral / depósito</SelectItem>
                  {ambientes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leito</Label>
              <Select value={leito} onValueChange={setLeito} disabled={!ehQuarto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={QUARTO_TODO}>Quarto inteiro</SelectItem>
                  {leitos.map(l => <SelectItem key={l.id} value={l.id}>Leito {l.identificacao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manter">Manter ({ESTADO_BEM[bem.estado]?.label ?? bem.estado})</SelectItem>
                {["novo", "bom", "regular", "danificado", "inservivel"].map(e => (
                  <SelectItem key={e} value={e}>{ESTADO_BEM[e].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: troca de colchão, TV levada para manutenção, redistribuição entre blocos"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MoveRight className="mr-2 h-4 w-4" />}
            Movimentar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
