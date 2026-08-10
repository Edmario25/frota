export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      cargos: {
        Row: {
          acesso_fundo_fixo: boolean
          created_at: string
          descricao: string | null
          id: string
          nivel_acesso: string
          nivel_hierarquico: number | null
          nome: string
          updated_at: string
        }
        Insert: {
          acesso_fundo_fixo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nivel_acesso?: string
          nivel_hierarquico?: number | null
          nome: string
          updated_at?: string
        }
        Update: {
          acesso_fundo_fixo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nivel_acesso?: string
          nivel_hierarquico?: number | null
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      fundo_fixo: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nome: string
          observacoes: string | null
          obra_id: string
          saldo_atual: number
          saldo_inicial: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          obra_id: string
          saldo_atual?: number
          saldo_inicial?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          obra_id?: string
          saldo_atual?: number
          saldo_inicial?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundo_fixo_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      fundo_fixo_lancamentos: {
        Row: {
          categoria: string | null
          created_at: string
          created_by: string | null
          data_lancamento: string
          descricao: string
          fundo_fixo_id: string
          id: string
          nf_url: string | null
          observacoes: string | null
          recibo_url: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          descricao: string
          fundo_fixo_id: string
          id?: string
          nf_url?: string | null
          observacoes?: string | null
          recibo_url?: string | null
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          descricao?: string
          fundo_fixo_id?: string
          id?: string
          nf_url?: string | null
          observacoes?: string | null
          recibo_url?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fundo_lanc_fundo_fixo_id_fkey"
            columns: ["fundo_fixo_id"]
            isOneToOne: false
            referencedRelation: "fundo_fixo"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_reports: {
        Row: {
          created_at: string
          data_avaria: string
          descricao_avaria: string
          employee_id: string
          foto_url: string | null
          id: string
          local_ocorrencia: string | null
          responsavel_registro: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_avaria?: string
          descricao_avaria: string
          employee_id: string
          foto_url?: string | null
          id?: string
          local_ocorrencia?: string | null
          responsavel_registro?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_avaria?: string
          descricao_avaria?: string
          employee_id?: string
          foto_url?: string | null
          id?: string
          local_ocorrencia?: string | null
          responsavel_registro?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      departamentos: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          responsavel_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_departamentos_responsavel"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_scores: {
        Row: {
          comentarios: string | null
          created_at: string
          data_avaliacao: string
          employee_id: string
          id: string
          justificativa: string | null
          pontuacao: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          comentarios?: string | null
          created_at?: string
          data_avaliacao: string
          employee_id: string
          id?: string
          justificativa?: string | null
          pontuacao: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          comentarios?: string | null
          created_at?: string
          data_avaliacao?: string
          employee_id?: string
          id?: string
          justificativa?: string | null
          pontuacao?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          acesso_app_motorista: boolean
          cargo_id: string | null
          cpf: string
          created_at: string
          data_admissao: string | null
          departamento_id: string | null
          email: string
          escala_tipo_id: string | null
          foto_url: string | null
          id: string
          nome: string
          status: Database["public"]["Enums"]["employee_status"]
          telefone: string | null
          tipo_acesso: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acesso_app_motorista?: boolean
          cargo_id?: string | null
          cpf: string
          created_at?: string
          data_admissao?: string | null
          departamento_id?: string | null
          email: string
          escala_tipo_id?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          status?: Database["public"]["Enums"]["employee_status"]
          telefone?: string | null
          tipo_acesso?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acesso_app_motorista?: boolean
          cargo_id?: string | null
          cpf?: string
          created_at?: string
          data_admissao?: string | null
          departamento_id?: string | null
          email?: string
          escala_tipo_id?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          status?: Database["public"]["Enums"]["employee_status"]
          telefone?: string | null
          tipo_acesso?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_escala_tipo_id_fkey"
            columns: ["escala_tipo_id"]
            isOneToOne: false
            referencedRelation: "escala_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employees_cargo"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employees_departamento"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_periodos: {
        Row: {
          conflito_autorizado: boolean | null
          conflito_detectado: boolean | null
          created_at: string
          data_fim_folga: string
          data_fim_trabalho: string
          data_inicio_folga: string
          data_inicio_trabalho: string
          employee_id: string
          escala_tipo_id: string
          id: string
          observacoes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          conflito_autorizado?: boolean | null
          conflito_detectado?: boolean | null
          created_at?: string
          data_fim_folga: string
          data_fim_trabalho: string
          data_inicio_folga: string
          data_inicio_trabalho: string
          employee_id: string
          escala_tipo_id: string
          id?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          conflito_autorizado?: boolean | null
          conflito_detectado?: boolean | null
          created_at?: string
          data_fim_folga?: string
          data_fim_trabalho?: string
          data_inicio_folga?: string
          data_inicio_trabalho?: string
          employee_id?: string
          escala_tipo_id?: string
          id?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_periodos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_periodos_escala_tipo_id_fkey"
            columns: ["escala_tipo_id"]
            isOneToOne: false
            referencedRelation: "escala_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_tipos: {
        Row: {
          created_at: string
          descricao: string | null
          dias_folga: number
          dias_trabalho: number
          id: string
          nome: string
          permite_sobreposicao: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          dias_folga: number
          dias_trabalho: number
          id?: string
          nome: string
          permite_sobreposicao?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          dias_folga?: number
          dias_trabalho?: number
          id?: string
          nome?: string
          permite_sobreposicao?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          tipo_fornecedor: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_fornecedor?: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_fornecedor?: string
          updated_at?: string
        }
        Relationships: []
      }
      heavy_vehicle_inspection_items: {
        Row: {
          categoria: string
          created_at: string
          id: string
          inspection_id: string
          item_nome: string
          observacoes: string | null
          status: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          inspection_id: string
          item_nome: string
          observacoes?: string | null
          status: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          inspection_id?: string
          item_nome?: string
          observacoes?: string | null
          status?: string
        }
        Relationships: []
      }
      heavy_vehicle_inspections: {
        Row: {
          assinatura_inspetor: string | null
          assinatura_responsavel: string | null
          created_at: string
          data_inspecao: string
          employee_id: string
          fotos_checklist: string | null
          id: string
          inspetor_funcao: string
          inspetor_nome: string
          km_atual: number | null
          observacoes_gerais: string | null
          status_geral: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assinatura_inspetor?: string | null
          assinatura_responsavel?: string | null
          created_at?: string
          data_inspecao?: string
          employee_id: string
          fotos_checklist?: string | null
          id?: string
          inspetor_funcao: string
          inspetor_nome: string
          km_atual?: number | null
          observacoes_gerais?: string | null
          status_geral?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assinatura_inspetor?: string | null
          assinatura_responsavel?: string | null
          created_at?: string
          data_inspecao?: string
          employee_id?: string
          fotos_checklist?: string | null
          id?: string
          inspetor_funcao?: string
          inspetor_nome?: string
          km_atual?: number | null
          observacoes_gerais?: string | null
          status_geral?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      inspection_checklists: {
        Row: {
          created_at: string
          data_inspecao: string
          employee_id: string
          foto_url: string | null
          funcao: string | null
          id: string
          km_atual: number | null
          observacoes: string | null
          responsavel_checklist: string | null
          tipo_servico: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_inspecao?: string
          employee_id: string
          foto_url?: string | null
          funcao?: string | null
          id?: string
          km_atual?: number | null
          observacoes?: string | null
          responsavel_checklist?: string | null
          tipo_servico: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_inspecao?: string
          employee_id?: string
          foto_url?: string | null
          funcao?: string | null
          id?: string
          km_atual?: number | null
          observacoes?: string | null
          responsavel_checklist?: string | null
          tipo_servico?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      inspection_items: {
        Row: {
          checklist_id: string
          created_at: string
          foto_url: string | null
          id: string
          item_nome: string
          observacoes: string | null
          status: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          foto_url?: string | null
          id?: string
          item_nome: string
          observacoes?: string | null
          status: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          item_nome?: string
          observacoes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "inspection_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          created_at: string
          created_by: string
          custo: number | null
          data_agendada: string
          data_realizada: string | null
          descricao: string
          id: string
          foto_url: string | null
          observacoes: string | null
          oficina: string | null
          quilometragem: number | null
          responsavel: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          tipo: Database["public"]["Enums"]["maintenance_type"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          custo?: number | null
          data_agendada: string
          data_realizada?: string | null
          descricao: string
          foto_url?: string | null
          id?: string
          observacoes?: string | null
          oficina?: string | null
          quilometragem?: number | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          tipo: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          custo?: number | null
          data_agendada?: string
          data_realizada?: string | null
          descricao?: string
          foto_url?: string | null
          id?: string
          observacoes?: string | null
          oficina?: string | null
          quilometragem?: number | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          tipo?: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_records: {
        Row: {
          created_at: string
          data_final: string | null
          data_inicial: string
          destino: string | null
          employee_id: string
          id: string
          observacoes: string | null
          quilometragem_final: number | null
          quilometragem_inicial: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_final?: string | null
          data_inicial?: string
          destino?: string | null
          employee_id: string
          id?: string
          observacoes?: string | null
          quilometragem_final?: number | null
          quilometragem_inicial: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_final?: string | null
          data_inicial?: string
          destino?: string | null
          employee_id?: string
          id?: string
          observacoes?: string | null
          quilometragem_final?: number | null
          quilometragem_inicial?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_fornecedores: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string
          fornecedor_id: string
          id: string
          obra_id: string
          observacoes: string | null
          status: boolean
          tipo_contrato: string | null
          updated_at: string
          valor_contrato: number | null
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          fornecedor_id: string
          id?: string
          obra_id: string
          observacoes?: string | null
          status?: boolean
          tipo_contrato?: string | null
          updated_at?: string
          valor_contrato?: number | null
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          fornecedor_id?: string
          id?: string
          obra_id?: string
          observacoes?: string | null
          status?: boolean
          tipo_contrato?: string | null
          updated_at?: string
          valor_contrato?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "obra_fornecedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_fornecedores_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_funcionarios: {
        Row: {
          created_at: string
          data_entrada: string
          data_saida: string | null
          employee_id: string
          funcao_obra: string
          id: string
          obra_id: string
          status: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          employee_id: string
          funcao_obra: string
          id?: string
          obra_id: string
          status?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          employee_id?: string
          funcao_obra?: string
          id?: string
          obra_id?: string
          status?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_funcionarios_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_funcionarios_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_veiculos: {
        Row: {
          created_at: string
          data_entrada: string
          data_saida: string | null
          id: string
          obra_id: string
          responsavel_id: string | null
          status: boolean
          tipo_vinculo: Database["public"]["Enums"]["vinculo_veiculo_tipo"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          id?: string
          obra_id: string
          responsavel_id?: string | null
          status?: boolean
          tipo_vinculo?: Database["public"]["Enums"]["vinculo_veiculo_tipo"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          id?: string
          obra_id?: string
          responsavel_id?: string | null
          status?: boolean
          tipo_vinculo?: Database["public"]["Enums"]["vinculo_veiculo_tipo"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_veiculos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_veiculos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_veiculos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          cidade: string | null
          cliente_cnpj: string | null
          cliente_nome: string
          codigo_interno: string | null
          coordenadas_gps: string | null
          created_at: string
          data_inicio_prevista: string | null
          data_termino_prevista: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          responsavel_tecnico: string | null
          responsavel_tecnico_id: string | null
          status: Database["public"]["Enums"]["obra_status"]
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cliente_cnpj?: string | null
          cliente_nome: string
          codigo_interno?: string | null
          coordenadas_gps?: string | null
          created_at?: string
          data_inicio_prevista?: string | null
          data_termino_prevista?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          responsavel_tecnico?: string | null
          responsavel_tecnico_id?: string | null
          status?: Database["public"]["Enums"]["obra_status"]
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cliente_cnpj?: string | null
          cliente_nome?: string
          codigo_interno?: string | null
          coordenadas_gps?: string | null
          created_at?: string
          data_inicio_prevista?: string | null
          data_termino_prevista?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          responsavel_tecnico?: string | null
          responsavel_tecnico_id?: string | null
          status?: Database["public"]["Enums"]["obra_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obras_responsavel_tecnico_id_fkey"
            columns: ["responsavel_tecnico_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          foto_url: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          foto_url?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          foto_url?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rental_companies: {
        Row: {
          cnpj: string | null
          contato_responsavel: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          created_at: string
          created_by: string
          data_fim: string
          data_inicio: string
          descricao: string | null
          employee_id: string
          id: string
          local_trabalho: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_fim: string
          data_inicio: string
          descricao?: string | null
          employee_id: string
          id?: string
          local_trabalho?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          employee_id?: string
          id?: string
          local_trabalho?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      smoke_tests: {
        Row: {
          ano_fabricacao: number
          cargo: string
          condicoes_teste: string | null
          condutor: string
          created_at: string
          data_afericao: string
          data_hora_teste: string | null
          densidade_percentual: number | null
          dentro_limite: boolean | null
          distancia_observador: number | null
          employee_id: string
          evidencias_url: string | null
          id: string
          indice_ringelmann: number | null
          motor_tipo: string | null
          obra: string | null
          observacoes: string | null
          quilometragem_atual: number | null
          responsavel_elaboracao: string
          resultado: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          ano_fabricacao: number
          cargo: string
          condicoes_teste?: string | null
          condutor: string
          created_at?: string
          data_afericao: string
          data_hora_teste?: string | null
          densidade_percentual?: number | null
          dentro_limite?: boolean | null
          distancia_observador?: number | null
          employee_id: string
          evidencias_url?: string | null
          id?: string
          indice_ringelmann?: number | null
          motor_tipo?: string | null
          obra?: string | null
          observacoes?: string | null
          quilometragem_atual?: number | null
          responsavel_elaboracao: string
          resultado: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          ano_fabricacao?: number
          cargo?: string
          condicoes_teste?: string | null
          condutor?: string
          created_at?: string
          data_afericao?: string
          data_hora_teste?: string | null
          densidade_percentual?: number | null
          dentro_limite?: boolean | null
          distancia_observador?: number | null
          employee_id?: string
          evidencias_url?: string | null
          id?: string
          indice_ringelmann?: number | null
          motor_tipo?: string | null
          obra?: string | null
          observacoes?: string | null
          quilometragem_atual?: number | null
          responsavel_elaboracao?: string
          resultado?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tire_services: {
        Row: {
          created_at: string
          data_servico: string
          employee_id: string
          foto_pneus_url: string | null
          id: string
          local_servico: string | null
          observacoes: string | null
          quantidade_pneus: number | null
          responsavel: string | null
          tipo_servico: string
          updated_at: string
          valor_servico: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_servico: string
          employee_id: string
          foto_pneus_url?: string | null
          id?: string
          local_servico?: string | null
          observacoes?: string | null
          quantidade_pneus?: number | null
          responsavel?: string | null
          tipo_servico: string
          updated_at?: string
          valor_servico?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_servico?: string
          employee_id?: string
          foto_pneus_url?: string | null
          id?: string
          local_servico?: string | null
          observacoes?: string | null
          quantidade_pneus?: number | null
          responsavel?: string | null
          tipo_servico?: string
          valor_servico?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      traffic_fines: {
        Row: {
          comprovante_url: string | null
          created_at: string
          data_multa: string
          employee_id: string | null
          id: string
          local_infracao: string
          observacoes: string | null
          situacao: string
          tipo_infracao: string
          updated_at: string
          valor: number
          vehicle_id: string
        }
        Insert: {
          comprovante_url?: string | null
          created_at?: string
          data_multa: string
          employee_id?: string | null
          id?: string
          local_infracao: string
          observacoes?: string | null
          situacao?: string
          tipo_infracao: string
          updated_at?: string
          valor: number
          vehicle_id: string
        }
        Update: {
          comprovante_url?: string | null
          created_at?: string
          data_multa?: string
          employee_id?: string | null
          id?: string
          local_infracao?: string
          observacoes?: string | null
          situacao?: string
          tipo_infracao?: string
          updated_at?: string
          valor?: number
          vehicle_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_accessories: {
        Row: {
          created_at: string
          data_instalacao: string | null
          fornecedor_empresa: string | null
          foto_comprovante_url: string | null
          id: string
          observacoes: string | null
          tipo_acessorio: string
          updated_at: string
          valor: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_instalacao?: string | null
          fornecedor_empresa?: string | null
          foto_comprovante_url?: string | null
          id?: string
          observacoes?: string | null
          tipo_acessorio: string
          updated_at?: string
          valor?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_instalacao?: string | null
          fornecedor_empresa?: string | null
          foto_comprovante_url?: string | null
          id?: string
          observacoes?: string | null
          tipo_acessorio?: string
          updated_at?: string
          valor?: number | null
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          created_at: string
          data_vencimento: string | null
          id: string
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_vencimento?: string | null
          id?: string
          nome_arquivo: string
          tipo_documento: string
          url_arquivo: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_vencimento?: string | null
          id?: string
          nome_arquivo?: string
          tipo_documento?: string
          url_arquivo?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_km_cycles: {
        Row: {
          created_at: string
          cycle_end_date: string
          cycle_start_date: string
          id: string
          km_final: number | null
          km_inicial: number
          km_rodados: number | null
          limite_km_mensal: number
          status: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          cycle_end_date: string
          cycle_start_date: string
          id?: string
          km_final?: number | null
          km_inicial: number
          km_rodados?: number | null
          limite_km_mensal: number
          status?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          cycle_end_date?: string
          cycle_start_date?: string
          id?: string
          km_final?: number | null
          km_inicial?: number
          km_rodados?: number | null
          limite_km_mensal?: number
          status?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_km_cycles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_fuel_logs: {
        Row: {
          id: string
          vehicle_id: string
          data_abastecimento: string
          km_no_abastecimento: number | null
          horimetro_no_abastecimento: number | null
          litros: number
          valor_litro: number
          valor_total: number | null
          tipo_combustivel: string | null
          posto_nome: string | null
          foto_comprovante_url: string | null
          observacoes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          data_abastecimento?: string
          km_no_abastecimento?: number | null
          horimetro_no_abastecimento?: number | null
          litros: number
          valor_litro: number
          valor_total?: number | null
          tipo_combustivel?: string | null
          posto_nome?: string | null
          foto_comprovante_url?: string | null
          observacoes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          data_abastecimento?: string
          km_no_abastecimento?: number | null
          horimetro_no_abastecimento?: number | null
          litros?: number
          valor_litro?: number
          valor_total?: number | null
          tipo_combustivel?: string | null
          posto_nome?: string | null
          foto_comprovante_url?: string | null
          observacoes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          ano: number
          cor: string | null
          created_at: string
          data_ultima_revisao: string | null
          horimetro_atual: number | null
          id: string
          limite_horimetro_mensal: number | null
          limite_lavagens_mensal: number | null
          marca: string
          modelo: string
          observacoes: string | null
          placa: string
          quilometragem_atual: number
          quilometragem_maxima_mensal: number | null
          rental_company_id: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          tipo: Database["public"]["Enums"]["vehicle_type"]
          tipo_medicao: string
          tipo_propriedade: Database["public"]["Enums"]["ownership_type"] | null
          updated_at: string
          valor_aluguel_mensal: number | null
        }
        Insert: {
          ano: number
          cor?: string | null
          created_at?: string
          data_ultima_revisao?: string | null
          horimetro_atual?: number | null
          id?: string
          limite_horimetro_mensal?: number | null
          limite_lavagens_mensal?: number | null
          marca: string
          modelo: string
          observacoes?: string | null
          placa: string
          quilometragem_atual?: number
          quilometragem_maxima_mensal?: number | null
          rental_company_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tipo: Database["public"]["Enums"]["vehicle_type"]
          tipo_medicao?: string
          tipo_propriedade?:
            | Database["public"]["Enums"]["ownership_type"]
            | null
          updated_at?: string
          valor_aluguel_mensal?: number | null
        }
        Update: {
          ano?: number
          cor?: string | null
          created_at?: string
          data_ultima_revisao?: string | null
          horimetro_atual?: number | null
          id?: string
          limite_horimetro_mensal?: number | null
          limite_lavagens_mensal?: number | null
          marca?: string
          modelo?: string
          observacoes?: string | null
          placa?: string
          quilometragem_atual?: number
          quilometragem_maxima_mensal?: number | null
          rental_company_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tipo?: Database["public"]["Enums"]["vehicle_type"]
          tipo_medicao?: string
          tipo_propriedade?:
            | Database["public"]["Enums"]["ownership_type"]
            | null
          updated_at?: string
          valor_aluguel_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_rental_company_id_fkey"
            columns: ["rental_company_id"]
            isOneToOne: false
            referencedRelation: "rental_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_records: {
        Row: {
          created_at: string
          data_lavagem: string
          employee_id: string | null
          fornecedor: string | null
          foto_antes_url: string | null
          foto_depois_url: string | null
          id: string
          observacoes: string | null
          responsavel_lavagem: string | null
          tipo_lavagem: string
          updated_at: string
          valor: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          data_lavagem: string
          employee_id?: string | null
          fornecedor?: string | null
          foto_antes_url?: string | null
          foto_depois_url?: string | null
          id?: string
          observacoes?: string | null
          responsavel_lavagem?: string | null
          tipo_lavagem: string
          updated_at?: string
          valor?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          data_lavagem?: string
          employee_id?: string | null
          fornecedor?: string | null
          foto_antes_url?: string | null
          foto_depois_url?: string | null
          id?: string
          observacoes?: string | null
          responsavel_lavagem?: string | null
          tipo_lavagem?: string
          updated_at?: string
          valor?: number | null
          vehicle_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_employee: { Args: { employee_id: string }; Returns: boolean }
      close_expired_km_cycles: { Args: never; Returns: number }
      get_current_km_cycle: {
        Args: { p_vehicle_id: string }
        Returns: {
          cycle_end_date: string
          cycle_id: string
          cycle_start_date: string
          days_remaining: number
          km_inicial: number
          km_rodados: number
          limite_km_mensal: number
          percentage_used: number
        }[]
      }
      get_user_role: {
        Args: { user_uuid?: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_employee_in_same_obra: {
        Args: { target_employee_id: string }
        Returns: boolean
      }
      is_gestor_obra: { Args: never; Returns: boolean }
      is_maintenance_for_obra_vehicle: {
        Args: { target_vehicle_id: string }
        Returns: boolean
      }
      is_vehicle_in_same_obra: {
        Args: { target_vehicle_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gestor_frota" | "funcionario" | "gestor_obra" | "gestor_contrato"
      employee_status: "ativo" | "inativo" | "ferias" | "licenca"
      maintenance_status:
        | "agendada"
        | "em_andamento"
        | "concluida"
        | "cancelada"
      maintenance_type: "preventiva" | "corretiva" | "emergencial"
      obra_status: "planejada" | "em_andamento" | "pausada" | "concluida"
      ownership_type: "proprio" | "alugado"
      vehicle_status: "disponivel" | "em_uso" | "manutencao" | "inativo"
      vehicle_type: "leve" | "pesado"
      vinculo_veiculo_tipo: "exclusivo" | "compartilhado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor_frota", "funcionario", "gestor_obra", "gestor_contrato"],
      employee_status: ["ativo", "inativo", "ferias", "licenca"],
      maintenance_status: [
        "agendada",
        "em_andamento",
        "concluida",
        "cancelada",
      ],
      maintenance_type: ["preventiva", "corretiva", "emergencial"],
      obra_status: ["planejada", "em_andamento", "pausada", "concluida"],
      ownership_type: ["proprio", "alugado"],
      vehicle_status: ["disponivel", "em_uso", "manutencao", "inativo"],
      vehicle_type: ["leve", "pesado"],
      vinculo_veiculo_tipo: ["exclusivo", "compartilhado"],
    },
  },
} as const
