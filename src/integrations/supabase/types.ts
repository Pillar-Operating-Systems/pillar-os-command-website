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
      ai_agents: {
        Row: {
          created_at: string | null
          digital_employee_id: string | null
          estimated_cost_month: number | null
          id: string
          last_run: string | null
          model: string | null
          name: string
          system_prompt: string | null
          system_prompt_version: number | null
          tokens_used_month: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          digital_employee_id?: string | null
          estimated_cost_month?: number | null
          id?: string
          last_run?: string | null
          model?: string | null
          name: string
          system_prompt?: string | null
          system_prompt_version?: number | null
          tokens_used_month?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          digital_employee_id?: string | null
          estimated_cost_month?: number | null
          id?: string
          last_run?: string | null
          model?: string | null
          name?: string
          system_prompt?: string | null
          system_prompt_version?: number | null
          tokens_used_month?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_digital_employee_id_fkey"
            columns: ["digital_employee_id"]
            isOneToOne: false
            referencedRelation: "digital_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          used: boolean
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          used?: boolean
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "allowed_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics: {
        Row: {
          action_type: string | null
          client_id: string | null
          id: string
          lead_business_name: string | null
          lead_id: string | null
          metric_key: string | null
          metric_value: number | null
          recorded_at: string
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          client_id?: string | null
          id?: string
          lead_business_name?: string | null
          lead_id?: string | null
          metric_key?: string | null
          metric_value?: number | null
          recorded_at?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          client_id?: string | null
          id?: string
          lead_business_name?: string | null
          lead_id?: string | null
          metric_key?: string | null
          metric_value?: number | null
          recorded_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_config: {
        Row: {
          automation_id: string | null
          client_id: string | null
          created_at: string | null
          digital_employee_id: string | null
          enabled: boolean | null
          id: string
        }
        Insert: {
          automation_id?: string | null
          client_id?: string | null
          created_at?: string | null
          digital_employee_id?: string | null
          enabled?: boolean | null
          id?: string
        }
        Update: {
          automation_id?: string | null
          client_id?: string | null
          created_at?: string | null
          digital_employee_id?: string | null
          enabled?: boolean | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_config_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_config_digital_employee_id_fkey"
            columns: ["digital_employee_id"]
            isOneToOne: false
            referencedRelation: "digital_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string | null
          description: string | null
          digital_employee_id: string | null
          id: string
          is_standalone: boolean | null
          last_triggered: string | null
          n8n_workflow_id: string | null
          name: string
          status: string | null
          times_triggered_week: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          digital_employee_id?: string | null
          id?: string
          is_standalone?: boolean | null
          last_triggered?: string | null
          n8n_workflow_id?: string | null
          name: string
          status?: string | null
          times_triggered_week?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          digital_employee_id?: string | null
          id?: string
          is_standalone?: boolean | null
          last_triggered?: string | null
          n8n_workflow_id?: string | null
          name?: string
          status?: string | null
          times_triggered_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_digital_employee_id_fkey"
            columns: ["digital_employee_id"]
            isOneToOne: false
            referencedRelation: "digital_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active_employees: Json
          bif_data: Json
          business_name: string
          created_at: string
          id: string
          industry: string | null
          internal_notes: string | null
          mrr: number | null
          owner_email: string | null
          owner_mobile: string | null
          owner_name: string | null
          plan: string | null
          status: string | null
          suburb: string | null
          updated_at: string
        }
        Insert: {
          active_employees?: Json
          bif_data?: Json
          business_name: string
          created_at?: string
          id?: string
          industry?: string | null
          internal_notes?: string | null
          mrr?: number | null
          owner_email?: string | null
          owner_mobile?: string | null
          owner_name?: string | null
          plan?: string | null
          status?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Update: {
          active_employees?: Json
          bif_data?: Json
          business_name?: string
          created_at?: string
          id?: string
          industry?: string | null
          internal_notes?: string | null
          mrr?: number | null
          owner_email?: string | null
          owner_mobile?: string | null
          owner_name?: string | null
          plan?: string | null
          status?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          assigned_to: string | null
          client_name: string | null
          created_at: string
          deal_id: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_name?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_name?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_employees: {
        Row: {
          active_client_count: number | null
          created_at: string | null
          emoji: string | null
          error_count: number | null
          id: string
          last_activity: string | null
          model: string | null
          name: string
          status: string | null
          system_prompt: string | null
        }
        Insert: {
          active_client_count?: number | null
          created_at?: string | null
          emoji?: string | null
          error_count?: number | null
          id?: string
          last_activity?: string | null
          model?: string | null
          name: string
          status?: string | null
          system_prompt?: string | null
        }
        Update: {
          active_client_count?: number | null
          created_at?: string | null
          emoji?: string | null
          error_count?: number | null
          id?: string
          last_activity?: string | null
          model?: string | null
          name?: string
          status?: string | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          assigned_to: string | null
          automation_name: string | null
          client_name: string | null
          created_at: string | null
          employee_name: string | null
          error_description: string | null
          id: string
          notes: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          assigned_to?: string | null
          automation_name?: string | null
          client_name?: string | null
          created_at?: string | null
          employee_name?: string | null
          error_description?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          assigned_to?: string | null
          automation_name?: string | null
          client_name?: string | null
          created_at?: string | null
          employee_name?: string | null
          error_description?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          billing_date: string | null
          category: string | null
          created_at: string | null
          frequency: string | null
          id: string
          name: string
          notes: string | null
          recurring: boolean | null
          status: string | null
        }
        Insert: {
          amount: number
          billing_date?: string | null
          category?: string | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          name: string
          notes?: string | null
          recurring?: boolean | null
          status?: string | null
        }
        Update: {
          amount?: number
          billing_date?: string | null
          category?: string | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          name?: string
          notes?: string | null
          recurring?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_number: string
          items: Json
          monthly_amount: number
          notes: string | null
          payment_method: string | null
          service_description: string | null
          setup_fee: number
          status: string
          stripe_invoice_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string
          items?: Json
          monthly_amount?: number
          notes?: string | null
          payment_method?: string | null
          service_description?: string | null
          setup_fee?: number
          status?: string
          stripe_invoice_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string
          items?: Json
          monthly_amount?: number
          notes?: string | null
          payment_method?: string | null
          service_description?: string | null
          setup_fee?: number
          status?: string
          stripe_invoice_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      kpis: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          id: string
          metric_action: string | null
          name: string
          period: string
          target: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_action?: string | null
          name: string
          period?: string
          target?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_action?: string | null
          name?: string
          period?: string
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpis_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          business_name: string
          cold_call_opener: string | null
          created_at: string
          created_by: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          industry: string | null
          last_contacted: string | null
          notes: string | null
          phone: string
          pillaros_pitch: string | null
          rating: number | null
          review_count: number | null
          source: string
          status: string
          suburb: string | null
          updated_at: string
          web_score: string | null
          website: string | null
          why_need_us: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_name: string
          cold_call_opener?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          industry?: string | null
          last_contacted?: string | null
          notes?: string | null
          phone?: string
          pillaros_pitch?: string | null
          rating?: number | null
          review_count?: number | null
          source?: string
          status?: string
          suburb?: string | null
          updated_at?: string
          web_score?: string | null
          website?: string | null
          why_need_us?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_name?: string
          cold_call_opener?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          industry?: string | null
          last_contacted?: string | null
          notes?: string | null
          phone?: string
          pillaros_pitch?: string | null
          rating?: number | null
          review_count?: number | null
          source?: string
          status?: string
          suburb?: string | null
          updated_at?: string
          web_score?: string | null
          website?: string | null
          why_need_us?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_deals: {
        Row: {
          assigned_to: string | null
          business_name: string
          client_approved: boolean
          client_approved_date: string | null
          contact_email: string | null
          contact_mobile: string | null
          contact_name: string | null
          created_at: string
          deal_value: number | null
          id: string
          industry: string | null
          mrr: number | null
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          other_fee: number | null
          other_fee_label: string | null
          services: Json
          setup_fee: number | null
          stages: Json
          status: string
          suburb: string | null
          updated_at: string
          waiting_reason: string | null
          website_fee: number | null
        }
        Insert: {
          assigned_to?: string | null
          business_name: string
          client_approved?: boolean
          client_approved_date?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          created_at?: string
          deal_value?: number | null
          id?: string
          industry?: string | null
          mrr?: number | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          other_fee?: number | null
          other_fee_label?: string | null
          services?: Json
          setup_fee?: number | null
          stages?: Json
          status?: string
          suburb?: string | null
          updated_at?: string
          waiting_reason?: string | null
          website_fee?: number | null
        }
        Update: {
          assigned_to?: string | null
          business_name?: string
          client_approved?: boolean
          client_approved_date?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          created_at?: string
          deal_value?: number | null
          id?: string
          industry?: string | null
          mrr?: number | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          other_fee?: number | null
          other_fee_label?: string | null
          services?: Json
          setup_fee?: number | null
          stages?: Json
          status?: string
          suburb?: string | null
          updated_at?: string
          waiting_reason?: string | null
          website_fee?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          id: string
          items: Json
          notes: string | null
          payment_method: string | null
          receipt_number: string
          service_description: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          receipt_number?: string
          service_description?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          receipt_number?: string
          service_description?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lead_facets: { Args: never; Returns: Json }
      next_invoice_number: { Args: never; Returns: string }
      next_receipt_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "owner" | "sales"
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
      app_role: ["owner", "sales"],
    },
  },
} as const
