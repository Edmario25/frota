import { supabase } from "@/integrations/supabase/client";

/**
 * Busca os IDs dos veículos vinculados a uma obra específica
 */
export const getVehicleIdsByObra = async (obraId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('obra_veiculos')
    .select('vehicle_id')
    .eq('obra_id', obraId)
    .eq('status', true);

  if (error) {
    console.error('Erro ao buscar veículos da obra:', error);
    return [];
  }

  return data?.map(item => item.vehicle_id) || [];
};

/**
 * Busca os IDs dos funcionários vinculados a uma obra específica
 */
export const getEmployeeIdsByObra = async (obraId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('obra_funcionarios')
    .select('employee_id')
    .eq('obra_id', obraId)
    .eq('status', true);

  if (error) {
    console.error('Erro ao buscar funcionários da obra:', error);
    return [];
  }

  return data?.map(item => item.employee_id) || [];
};

/**
 * Busca os IDs dos fornecedores vinculados a uma obra específica
 */
export const getFornecedorIdsByObra = async (obraId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('obra_fornecedores')
    .select('fornecedor_id')
    .eq('obra_id', obraId)
    .eq('status', true);

  if (error) {
    console.error('Erro ao buscar fornecedores da obra:', error);
    return [];
  }

  return data?.map(item => item.fornecedor_id) || [];
};
