/**
 * FornecedorSelect — campo de seleção de fornecedor reutilizável.
 *
 * Comportamento:
 * - Carrega os fornecedores ativos do banco via useFornecedores()
 * - Filtra opcionalmente por tipo_fornecedor
 * - Exibe Select com os fornecedores + opção "Outro (digitar)"
 * - Quando "Outro" é selecionado, exibe um Input de texto livre
 * - Se não houver fornecedores cadastrados, exibe apenas Input
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFornecedores } from "@/hooks/useFornecedores";

const OUTRO = "__outro__";

interface FornecedorSelectProps {
  /** Valor atual do campo (nome do fornecedor ou texto livre) */
  value: string;
  onChange: (value: string) => void;
  /** Filtra por tipo_fornecedor — ex: ['servicos','geral'] */
  tipos?: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const FornecedorSelect = ({
  value,
  onChange,
  tipos,
  placeholder = "Selecione o fornecedor",
  disabled,
}: FornecedorSelectProps) => {
  const { fornecedores, loading } = useFornecedores();

  // Filtered active list
  const lista = fornecedores.filter(f => {
    if (f.status !== "ativo") return false;
    if (tipos && tipos.length > 0) {
      return tipos.includes(f.tipo_fornecedor);
    }
    return true;
  });

  // Determine if current value is a known supplier or free-text
  const isKnown = lista.some(f => f.nome === value);
  const [mode, setMode] = useState<"select" | "input">(
    !value || isKnown ? "select" : "input"
  );

  // When the list loads, decide mode
  useEffect(() => {
    if (!loading) {
      const known = lista.some(f => f.nome === value);
      if (value && !known) setMode("input");
    }
  }, [loading]);

  // No suppliers → plain input
  if (!loading && lista.length === 0) {
    return (
      <Input
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (mode === "input") {
    return (
      <div className="flex gap-2">
        <Input
          placeholder="Digite o nome do fornecedor"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1"
        />
        <button
          type="button"
          className="text-xs text-primary underline whitespace-nowrap px-1"
          onClick={() => { onChange(""); setMode("select"); }}
        >
          Usar lista
        </button>
      </div>
    );
  }

  return (
    <Select
      disabled={disabled || loading}
      value={value || ""}
      onValueChange={v => {
        if (v === OUTRO) {
          onChange("");
          setMode("input");
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Carregando..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {lista.map(f => (
          <SelectItem key={f.id} value={f.nome}>
            {f.nome}
          </SelectItem>
        ))}
        <SelectItem value={OUTRO} className="text-muted-foreground italic">
          Outro (digitar manualmente)
        </SelectItem>
      </SelectContent>
    </Select>
  );
};
