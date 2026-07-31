import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  nome: string;
  tipo_acesso: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verificar se o usuário que está fazendo a requisição é um admin ou gestor
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autorizado - Token de autenticação ausente");
    }

    // Criar cliente com a chave anon para verificar o token do usuário
    const supabaseAnon = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verificar o token do usuário
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAnon.auth.getUser(token);
    
    if (authError || !requestingUser) {
      throw new Error("Não autorizado - Token inválido");
    }

    // Verificar se o usuário tem permissão (admin ou gestor_frota)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .single();

    if (roleError || !userRole) {
      throw new Error("Não foi possível verificar permissões do usuário");
    }

    if (!["gestor_contrato", "admin", "gestor_frota"].includes(userRole.role)) {
      throw new Error("Você não tem permissão para criar usuários");
    }

    // Processar a requisição
    const { email, password, nome, tipo_acesso }: CreateUserRequest = await req.json();

    if (!email || !password || !nome) {
      throw new Error("Email, senha e nome são obrigatórios");
    }

    // Mapear tipo_acesso para app_role
    const roleMapping: Record<string, string> = {
      gestor_contrato: "gestor_contrato",
      gestor_geral: "gestor_contrato",
      gestor_obra: "gestor_obra",
      colaborador: "funcionario",
      funcionario: "funcionario",
    };

    const appRole = roleMapping[tipo_acesso] || "funcionario";

    // Criar o usuário usando a Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma o email automaticamente
      user_metadata: {
        name: nome,
      },
    });

    if (createError) {
      console.error("Erro ao criar usuário:", createError);
      throw new Error(createError.message);
    }

    console.log("Usuário criado com sucesso:", newUser.user?.id);

    // Atualizar o role do usuário na tabela user_roles
    if (newUser.user) {
      const { error: updateRoleError } = await supabaseAdmin
        .from("user_roles")
        .update({ role: appRole })
        .eq("user_id", newUser.user.id);

      if (updateRoleError) {
        console.error("Erro ao atualizar role:", updateRoleError);
        // Não lançar erro, pois o usuário foi criado
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user?.id,
        message: "Usuário criado com sucesso",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Erro na função create-user:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
