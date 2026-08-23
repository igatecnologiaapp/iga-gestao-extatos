import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Provisiona uma nova empresa: cria o registro, atribui o papel de
 * Administrador ao fundador e semeia as categorias padrão (Compra/Taxa/Juros
 * e demais categorias iniciais + subcategorias de Taxa e Juros).
 *
 * Operação privilegiada: usa o cliente administrativo somente após a
 * autenticação do chamador ser validada pelo middleware.
 */
export const provisionCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2, "Informe o nome da empresa").max(120),
        document: z.string().trim().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const defaultCategories: Array<{ name: string; isSystem: boolean }> = [
      { name: "Compra", isSystem: true },
      { name: "Taxa", isSystem: true },
      { name: "Juros", isSystem: true },
      { name: "Pagamento", isSystem: false },
      { name: "Transferência", isSystem: false },
      { name: "PIX", isSystem: false },
      { name: "Recebimento", isSystem: false },
      { name: "Estorno", isSystem: false },
      { name: "Saque", isSystem: false },
      { name: "Investimento", isSystem: false },
      { name: "Imposto", isSystem: false },
      { name: "Tarifa", isSystem: false },
      { name: "Multa", isSystem: false },
      { name: "Anuidade", isSystem: false },
      { name: "Encargos", isSystem: false },
      { name: "Outros", isSystem: false },
    ];
    const defaultSubcategories: Record<string, string[]> = {
      Taxa: [
        "Tarifa bancária",
        "Anuidade",
        "Taxa administrativa",
        "Taxa de manutenção",
        "IOF",
        "Taxa de saque",
      ],
      Juros: ["Juros rotativos", "Juros de atraso", "Juros de financiamento", "Juros de parcelamento"],
    };

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: data.name, document: data.document || null })
      .select("id")
      .single();
    if (companyError) throw new Error(companyError.message);

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId,
      company_id: company.id,
      role: "admin",
    });
    if (roleError) throw new Error(roleError.message);

    const { data: categories, error: catError } = await supabaseAdmin
      .from("transaction_categories")
      .insert(
        defaultCategories.map((c) => ({
          company_id: company.id,
          name: c.name,
          is_system: c.isSystem,
        })),
      )
      .select("id, name");
    if (catError) throw new Error(catError.message);

    const subcategoryRows = (categories ?? []).flatMap((cat) =>
      (defaultSubcategories[cat.name] ?? []).map((sub) => ({
        company_id: company.id,
        category_id: cat.id,
        name: sub,
      })),
    );
    if (subcategoryRows.length > 0) {
      const { error: subError } = await supabaseAdmin
        .from("transaction_subcategories")
        .insert(subcategoryRows);
      if (subError) throw new Error(subError.message);
    }

    await supabaseAdmin.from("audit_log").insert({
      company_id: company.id,
      user_id: context.userId,
      action: "create",
      entity: "companies",
      entity_id: company.id,
      new_data: { name: data.name },
    });

    return { companyId: company.id };
  });

/**
 * Convida um usuário para a empresa com um papel. Somente administradores da
 * empresa podem convidar (verificado com o cliente autenticado do chamador,
 * sujeito a RLS). Usuário já existente é apenas vinculado; novo usuário
 * recebe convite por e-mail.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        companyId: z.string().uuid(),
        email: z.string().trim().email("E-mail inválido"),
        fullName: z.string().trim().min(2, "Informe o nome").max(120),
        role: z.enum(["admin", "financeiro", "consulta", "auditor"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: membership } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .eq("status", "ativo")
      .maybeSingle();

    if (membership?.role !== "admin") {
      throw new Error("Apenas administradores podem convidar usuários.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.id;
    } else {
      const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        { data: { full_name: data.fullName } },
      );
      if (inviteError) throw new Error(inviteError.message);
      userId = invited.user.id;
      await supabaseAdmin.from("profiles").insert({
        id: userId,
        email: data.email,
        full_name: data.fullName,
      });
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, company_id: data.companyId, role: data.role, status: "ativo" },
        { onConflict: "user_id,company_id,role" },
      );
    if (roleError) throw new Error(roleError.message);

    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      action: "invite",
      entity: "user_roles",
      new_data: { email: data.email, role: data.role },
    });

    return { ok: true };
  });
