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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_digit: string | null
          account_number: string
          agency: string | null
          company_id: string
          created_at: string
          created_by: string | null
          holder: string | null
          holder_document: string | null
          id: string
          institution_id: string
          nickname: string | null
          status: Database["public"]["Enums"]["record_status"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          account_digit?: string | null
          account_number: string
          agency?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          holder?: string | null
          holder_document?: string | null
          id?: string
          institution_id: string
          nickname?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          account_digit?: string | null
          account_number?: string
          agency?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          holder?: string | null
          holder_document?: string | null
          id?: string
          institution_id?: string
          nickname?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          administrator_id: string | null
          brand: string | null
          closing_day: number | null
          company_id: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          due_day: number | null
          holder: string | null
          id: string
          institution_id: string | null
          last_four_digits: string | null
          nickname: string
          status: Database["public"]["Enums"]["card_status"]
          type: Database["public"]["Enums"]["card_type"]
          updated_at: string
        }
        Insert: {
          administrator_id?: string | null
          brand?: string | null
          closing_day?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          due_day?: number | null
          holder?: string | null
          id?: string
          institution_id?: string | null
          last_four_digits?: string | null
          nickname: string
          status?: Database["public"]["Enums"]["card_status"]
          type?: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Update: {
          administrator_id?: string | null
          brand?: string | null
          closing_day?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          due_day?: number | null
          holder?: string | null
          id?: string
          institution_id?: string | null
          last_four_digits?: string | null
          nickname?: string
          status?: Database["public"]["Enums"]["card_status"]
          type?: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          dias_alerta_vencimento: number
          document: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_alerta_vencimento?: number
          document?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_alerta_vencimento?: number
          document?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      financial_institutions: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["record_status"]
          type: Database["public"]["Enums"]["institution_type"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          type?: Database["public"]["Enums"]["institution_type"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          type?: Database["public"]["Enums"]["institution_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_institutions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account_id: string | null
          card_id: string | null
          company_id: string
          confirmed_count: number
          created_at: string
          created_by: string | null
          duplicate_of: string | null
          error_message: string | null
          file_format: Database["public"]["Enums"]["import_file_format"]
          file_hash: string
          file_name: string
          file_size: number
          id: string
          institution_id: string | null
          parsed_count: number
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          source_type: Database["public"]["Enums"]["import_source_type"]
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          card_id?: string | null
          company_id: string
          confirmed_count?: number
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          file_format: Database["public"]["Enums"]["import_file_format"]
          file_hash: string
          file_name: string
          file_size?: number
          id?: string
          institution_id?: string | null
          parsed_count?: number
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          source_type: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_status"]
          storage_path: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          card_id?: string | null
          company_id?: string
          confirmed_count?: number
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          error_message?: string | null
          file_format?: Database["public"]["Enums"]["import_file_format"]
          file_hash?: string
          file_name?: string
          file_size?: number
          id?: string
          institution_id?: string | null
          parsed_count?: number
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          source_type?: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      staged_transactions: {
        Row: {
          amount: number | null
          category_id: string | null
          company_id: string
          created_at: string
          currency: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          duplicate_reason: string | null
          duplicate_state: Database["public"]["Enums"]["duplicate_flag"]
          fingerprint: string | null
          id: string
          import_id: string
          normalized_description: string
          posted_at: string | null
          raw: Json | null
          row_index: number
          status: Database["public"]["Enums"]["staged_status"]
          subcategory_id: string | null
          updated_at: string
          warnings: string[]
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          company_id: string
          created_at?: string
          currency?: string
          description?: string
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          duplicate_reason?: string | null
          duplicate_state?: Database["public"]["Enums"]["duplicate_flag"]
          fingerprint?: string | null
          id?: string
          import_id: string
          normalized_description?: string
          posted_at?: string | null
          raw?: Json | null
          row_index?: number
          status?: Database["public"]["Enums"]["staged_status"]
          subcategory_id?: string | null
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          description?: string
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          duplicate_reason?: string | null
          duplicate_state?: Database["public"]["Enums"]["duplicate_flag"]
          fingerprint?: string | null
          id?: string
          import_id?: string
          normalized_description?: string
          posted_at?: string | null
          raw?: Json | null
          row_index?: number
          status?: Database["public"]["Enums"]["staged_status"]
          subcategory_id?: string | null
          updated_at?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "staged_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staged_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staged_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staged_transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "transaction_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_subcategories: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_subcategories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          card_id: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          fingerprint: string | null
          id: string
          import_id: string | null
          institution_id: string | null
          normalized_description: string
          notes: string | null
          origin: Database["public"]["Enums"]["transaction_origin"]
          posted_at: string
          source_type: Database["public"]["Enums"]["import_source_type"]
          staged_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          subcategory_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          card_id?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          fingerprint?: string | null
          id?: string
          import_id?: string | null
          institution_id?: string | null
          normalized_description?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["transaction_origin"]
          posted_at: string
          source_type: Database["public"]["Enums"]["import_source_type"]
          staged_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          subcategory_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          card_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          fingerprint?: string | null
          id?: string
          import_id?: string | null
          institution_id?: string | null
          normalized_description?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["transaction_origin"]
          posted_at?: string
          source_type?: Database["public"]["Enums"]["import_source_type"]
          staged_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          subcategory_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "transaction_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type:
        | "corrente"
        | "poupanca"
        | "pagamento"
        | "investimento"
        | "outra"
      app_role: "admin" | "financeiro" | "consulta" | "auditor"
      card_status: "ativo" | "bloqueado" | "cancelado" | "inativo"
      card_type: "credito" | "debito" | "credito_debito"
      duplicate_flag: "nenhuma" | "possivel" | "confirmada" | "ignorada"
      import_file_format: "pdf" | "ofx" | "csv" | "xlsx"
      import_source_type: "conta" | "cartao"
      import_status:
        | "recebido"
        | "processando"
        | "revisao"
        | "confirmado"
        | "erro"
        | "cancelado"
      institution_type:
        | "banco"
        | "cooperativa"
        | "fintech"
        | "administradora_cartao"
        | "instituicao_pagamento"
        | "outra"
      record_status: "ativo" | "inativo"
      staged_status: "pendente" | "confirmado" | "descartado"
      transaction_direction: "entrada" | "saida"
      transaction_origin: "importado" | "manual"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: [
        "corrente",
        "poupanca",
        "pagamento",
        "investimento",
        "outra",
      ],
      app_role: ["admin", "financeiro", "consulta", "auditor"],
      card_status: ["ativo", "bloqueado", "cancelado", "inativo"],
      card_type: ["credito", "debito", "credito_debito"],
      duplicate_flag: ["nenhuma", "possivel", "confirmada", "ignorada"],
      import_file_format: ["pdf", "ofx", "csv", "xlsx"],
      import_source_type: ["conta", "cartao"],
      import_status: [
        "recebido",
        "processando",
        "revisao",
        "confirmado",
        "erro",
        "cancelado",
      ],
      institution_type: [
        "banco",
        "cooperativa",
        "fintech",
        "administradora_cartao",
        "instituicao_pagamento",
        "outra",
      ],
      record_status: ["ativo", "inativo"],
      staged_status: ["pendente", "confirmado", "descartado"],
      transaction_direction: ["entrada", "saida"],
      transaction_origin: ["importado", "manual"],
    },
  },
} as const
