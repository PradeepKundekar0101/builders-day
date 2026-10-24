export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      prompt_studio_sessions: {
        Row: { id: string; user_id: string; revision: number; created_at: string };
        Insert: { id: string; user_id: string; revision?: number; created_at?: string };
        Update: { id?: string; user_id?: string; revision?: number; created_at?: string };
        Relationships: [];
      };
      prompt_studio_versions: {
        Row: { session_id: string; revision: number; mutation_id: string; payload: Json; status: string; created_at: string };
        Insert: { session_id: string; revision: number; mutation_id: string; payload: Json; status: string; created_at?: string };
        Update: { session_id?: string; revision?: number; mutation_id?: string; payload?: Json; status?: string; created_at?: string };
        Relationships: [];
      };

      approvals: {
        Row: {
          decided_at: string | null;
          decided_by: string | null;
          decision: string | null;
          id: string;
          kind: string;
          note: string | null;
          requested_at: string;
          subject_id: string;
        };
        ComputedFields: never;
        Insert: {
          decided_at?: string | null;
          decided_by?: string | null;
          decision?: string | null;
          id?: string;
          kind: string;
          note?: string | null;
          requested_at?: string;
          subject_id: string;
        };
        Update: {
          decided_at?: string | null;
          decided_by?: string | null;
          decision?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          requested_at?: string;
          subject_id?: string;
        };
        Relationships: [];
      };
      audits: {
        Row: {
          attempt: number;
          created_at: string;
          deployment_id: string;
          id: string;
          overridden: boolean;
          passed: boolean;
          results: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          attempt?: number;
          created_at?: string;
          deployment_id: string;
          id?: string;
          overridden?: boolean;
          passed?: boolean;
          results?: NonNullable<Json>;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          deployment_id?: string;
          id?: string;
          overridden?: boolean;
          passed?: boolean;
          results?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "audits_deployment_id_fkey";
            columns: ["deployment_id"];
            isOneToOne: false;
            referencedRelation: "deployments";
            referencedColumns: ["id"];
          },
        ];
      };
      build_events: {
        Row: {
          build_id: string;
          id: number;
          payload: NonNullable<Json>;
          ts: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          build_id: string;
          id?: never;
          payload?: NonNullable<Json>;
          ts?: string;
          type: string;
        };
        Update: {
          build_id?: string;
          id?: never;
          payload?: NonNullable<Json>;
          ts?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "build_events_build_id_fkey";
            columns: ["build_id"];
            isOneToOne: false;
            referencedRelation: "builds";
            referencedColumns: ["id"];
          },
        ];
      };
      builds: {
        Row: {
          budget_usd: number;
          claimed_by: string | null;
          created_at: string;
          finished_at: string | null;
          heartbeat_at: string | null;
          id: string;
          mode: string;
          quote_id: string;
          retries: number;
          spent_usd: number;
          started_at: string | null;
          status: string;
          tokens_in: number;
          tokens_out: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          budget_usd: number;
          claimed_by?: string | null;
          created_at?: string;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          mode?: string;
          quote_id: string;
          retries?: number;
          spent_usd?: number;
          started_at?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          user_id: string;
        };
        Update: {
          budget_usd?: number;
          claimed_by?: string | null;
          created_at?: string;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          mode?: string;
          quote_id?: string;
          retries?: number;
          spent_usd?: number;
          started_at?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "builds_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      deployments: {
        Row: {
          build_id: string;
          created_at: string;
          id: string;
          status: string;
          supabase_project_ref: string | null;
          url: string | null;
          vercel_project_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          build_id: string;
          created_at?: string;
          id?: string;
          status?: string;
          supabase_project_ref?: string | null;
          url?: string | null;
          vercel_project_id?: string | null;
        };
        Update: {
          build_id?: string;
          created_at?: string;
          id?: string;
          status?: string;
          supabase_project_ref?: string | null;
          url?: string | null;
          vercel_project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deployments_build_id_fkey";
            columns: ["build_id"];
            isOneToOne: false;
            referencedRelation: "builds";
            referencedColumns: ["id"];
          },
        ];
      };
      ideas: {
        Row: {
          created_at: string;
          id: string;
          links: string[];
          status: string;
          text: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          links?: string[];
          status?: string;
          text: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          links?: string[];
          status?: string;
          text?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      intake_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          idea_id: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          idea_id: string;
          role: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          idea_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "intake_messages_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          id: string;
          provider: string;
          provider_order_id: string;
          quote_id: string;
          raw_event: Json | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency: string;
          id?: string;
          provider: string;
          provider_order_id: string;
          quote_id: string;
          raw_event?: Json | null;
          status?: string;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          provider?: string;
          provider_order_id?: string;
          quote_id?: string;
          raw_event?: Json | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          role?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          amount_inr: number | null;
          cost_usd: number;
          created_at: string;
          fx_rate: number | null;
          high_usd: number;
          hours: number;
          id: string;
          locked_at: string | null;
          low_usd: number;
          model_budget_usd: number;
          selected_features: NonNullable<Json>;
          share_slug: string;
          spec_id: string;
          status: string;
          user_id: string;
          weights_version: string;
        };
        ComputedFields: never;
        Insert: {
          amount_inr?: number | null;
          cost_usd: number;
          created_at?: string;
          fx_rate?: number | null;
          high_usd: number;
          hours: number;
          id?: string;
          locked_at?: string | null;
          low_usd: number;
          model_budget_usd: number;
          selected_features?: NonNullable<Json>;
          share_slug: string;
          spec_id: string;
          status?: string;
          user_id: string;
          weights_version: string;
        };
        Update: {
          amount_inr?: number | null;
          cost_usd?: number;
          created_at?: string;
          fx_rate?: number | null;
          high_usd?: number;
          hours?: number;
          id?: string;
          locked_at?: string | null;
          low_usd?: number;
          model_budget_usd?: number;
          selected_features?: NonNullable<Json>;
          share_slug?: string;
          spec_id?: string;
          status?: string;
          user_id?: string;
          weights_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_spec_id_fkey";
            columns: ["spec_id"];
            isOneToOne: false;
            referencedRelation: "specs";
            referencedColumns: ["id"];
          },
        ];
      };
      specs: {
        Row: {
          created_at: string;
          flag_reasons: string[];
          id: string;
          idea_id: string;
          operator_status: string;
          spec: NonNullable<Json>;
          user_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          flag_reasons?: string[];
          id?: string;
          idea_id: string;
          operator_status?: string;
          spec: NonNullable<Json>;
          user_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          flag_reasons?: string[];
          id?: string;
          idea_id?: string;
          operator_status?: string;
          spec?: NonNullable<Json>;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "specs_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id"];
          },
        ];
      };
      supabase_pool: {
        Row: {
          anon_key: string;
          api_url: string;
          assigned_build_id: string | null;
          created_at: string;
          project_ref: string;
          service_key_secret_ref: string;
        };
        ComputedFields: never;
        Insert: {
          anon_key: string;
          api_url: string;
          assigned_build_id?: string | null;
          created_at?: string;
          project_ref: string;
          service_key_secret_ref: string;
        };
        Update: {
          anon_key?: string;
          api_url?: string;
          assigned_build_id?: string | null;
          created_at?: string;
          project_ref?: string;
          service_key_secret_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supabase_pool_assigned_build_id_fkey";
            columns: ["assigned_build_id"];
            isOneToOne: false;
            referencedRelation: "builds";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_prompt_studio: {
        Args: { p_session_id: string; p_user_id: string; p_expected_revision: number; p_mutation_id: string; p_payload: Json; p_status: string };
        Returns: Json;
      };

      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      released_url: { Args: { p_build_id: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
