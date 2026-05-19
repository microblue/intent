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
      activation_codes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          created_by_user_id: string | null
          credit_usd: number | null
          expires_at: string | null
          id: string
          notes: string | null
          partner_id: string | null
          partner_name: string | null
          plan_id: string | null
          provider: string | null
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          redeemed_claw_id: string | null
          region: string | null
          seats: number
          seats_used: number
          sku_kind: string
          status: string
          tier_label: string | null
          validity_days: number | null
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          created_by_user_id?: string | null
          credit_usd?: number | null
          expires_at?: string | null
          id: string
          notes?: string | null
          partner_id?: string | null
          partner_name?: string | null
          plan_id?: string | null
          provider?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          redeemed_claw_id?: string | null
          region?: string | null
          seats?: number
          seats_used?: number
          sku_kind?: string
          status?: string
          tier_label?: string | null
          validity_days?: number | null
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          created_by_user_id?: string | null
          credit_usd?: number | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          partner_id?: string | null
          partner_name?: string | null
          plan_id?: string | null
          provider?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          redeemed_claw_id?: string | null
          region?: string | null
          seats?: number
          seats_used?: number
          sku_kind?: string
          status?: string
          tier_label?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_codes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_redeemed_by_user_id_fkey"
            columns: ["redeemed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_seats: {
        Row: {
          activation_code_id: string
          claw_id: string | null
          expires_at: string | null
          id: string
          redeemed_at: string
          redeemed_by_user_id: string
        }
        Insert: {
          activation_code_id: string
          claw_id?: string | null
          expires_at?: string | null
          id: string
          redeemed_at?: string
          redeemed_by_user_id: string
        }
        Update: {
          activation_code_id?: string
          claw_id?: string | null
          expires_at?: string | null
          id?: string
          redeemed_at?: string
          redeemed_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_seats_activation_code_id_fkey"
            columns: ["activation_code_id"]
            isOneToOne: false
            referencedRelation: "activation_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_seats_redeemed_by_user_id_fkey"
            columns: ["redeemed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          agent_key: string | null
          created_at: string
          detail: string | null
          id: string
          intent_id: string
          options: Json | null
          prompt: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_key?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          intent_id: string
          options?: Json | null
          prompt: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_key?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          intent_id?: string
          options?: Json | null
          prompt?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_kind: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id: string
          metadata?: Json | null
          target_id?: string | null
          target_kind?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partners: {
        Row: {
          created_at: string
          display_name: string
          payout_method: Json | null
          revenue_share_pct: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          payout_method?: Json | null
          revenue_share_pct?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          payout_method?: Json | null
          revenue_share_pct?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claw_exports: {
        Row: {
          claw_id: string
          created_at: string
          file_size: number | null
          id: string
          user_id: string
        }
        Insert: {
          claw_id: string
          created_at?: string
          file_size?: number | null
          id: string
          user_id: string
        }
        Update: {
          claw_id?: string
          created_at?: string
          file_size?: number | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claw_exports_claw_id_fkey"
            columns: ["claw_id"]
            isOneToOne: false
            referencedRelation: "claws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claw_exports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claw_install_phases: {
        Row: {
          claw_id: string
          created_at: string
          id: string
          install_run_id: string
          log_chunk: string
          phase: string
        }
        Insert: {
          claw_id: string
          created_at?: string
          id: string
          install_run_id: string
          log_chunk: string
          phase: string
        }
        Update: {
          claw_id?: string
          created_at?: string
          id?: string
          install_run_id?: string
          log_chunk?: string
          phase?: string
        }
        Relationships: [
          {
            foreignKeyName: "claw_install_phases_claw_id_fkey"
            columns: ["claw_id"]
            isOneToOne: false
            referencedRelation: "claws"
            referencedColumns: ["id"]
          },
        ]
      }
      claws: {
        Row: {
          activation_code_id: string | null
          billing_interval: string | null
          central_token: string | null
          claw_type: string
          created_at: string
          deletion_scheduled_at: string | null
          gateway_token: string | null
          id: string
          install_run_id: string | null
          ip: string | null
          last_reinstalled_at: string | null
          location: string | null
          model: string | null
          name: string
          plan_id: string
          polar_customer_id: string | null
          polar_product_id: string | null
          polar_subscription_id: string | null
          provider: string
          provider_server_id: string | null
          root_password: string | null
          ssh_key_id: string | null
          status: string
          subdomain: string | null
          subscription_status: string | null
          user_id: string
        }
        Insert: {
          activation_code_id?: string | null
          billing_interval?: string | null
          central_token?: string | null
          claw_type?: string
          created_at?: string
          deletion_scheduled_at?: string | null
          gateway_token?: string | null
          id: string
          install_run_id?: string | null
          ip?: string | null
          last_reinstalled_at?: string | null
          location?: string | null
          model?: string | null
          name: string
          plan_id: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          provider?: string
          provider_server_id?: string | null
          root_password?: string | null
          ssh_key_id?: string | null
          status?: string
          subdomain?: string | null
          subscription_status?: string | null
          user_id: string
        }
        Update: {
          activation_code_id?: string | null
          billing_interval?: string | null
          central_token?: string | null
          claw_type?: string
          created_at?: string
          deletion_scheduled_at?: string | null
          gateway_token?: string | null
          id?: string
          install_run_id?: string | null
          ip?: string | null
          last_reinstalled_at?: string | null
          location?: string | null
          model?: string | null
          name?: string
          plan_id?: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          provider?: string
          provider_server_id?: string | null
          root_password?: string | null
          ssh_key_id?: string | null
          status?: string
          subdomain?: string | null
          subscription_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claws_ssh_key_id_fkey"
            columns: ["ssh_key_id"]
            isOneToOne: false
            referencedRelation: "ssh_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claws_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          feature: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          feature: string
          id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          feature?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          request_hash: string
          response_body: Json
          status_code: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          request_hash: string
          response_body: Json
          status_code: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          request_hash?: string
          response_body?: Json
          status_code?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      install_reports: {
        Row: {
          arch: string
          bootstrap_phase: string
          created_at: string
          desktop_version: string
          env_info: Json
          error_message: string
          error_stack: string | null
          hostname: string
          id: string
          install_id: string
          ip: string | null
          logs: string
          node_version: string
          os_release: string
          platform: string
          user_agent: string | null
          username: string
        }
        Insert: {
          arch: string
          bootstrap_phase: string
          created_at?: string
          desktop_version: string
          env_info: Json
          error_message: string
          error_stack?: string | null
          hostname: string
          id: string
          install_id: string
          ip?: string | null
          logs: string
          node_version: string
          os_release: string
          platform: string
          user_agent?: string | null
          username: string
        }
        Update: {
          arch?: string
          bootstrap_phase?: string
          created_at?: string
          desktop_version?: string
          env_info?: Json
          error_message?: string
          error_stack?: string | null
          hostname?: string
          id?: string
          install_id?: string
          ip?: string | null
          logs?: string
          node_version?: string
          os_release?: string
          platform?: string
          user_agent?: string | null
          username?: string
        }
        Relationships: []
      }
      intent_agents: {
        Row: {
          agent_key: string
          created_at: string
          display_name: string
          intent_id: string
          is_orchestrator: boolean
        }
        Insert: {
          agent_key: string
          created_at?: string
          display_name: string
          intent_id: string
          is_orchestrator?: boolean
        }
        Update: {
          agent_key?: string
          created_at?: string
          display_name?: string
          intent_id?: string
          is_orchestrator?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "intent_agents_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_artifacts: {
        Row: {
          created_at: string
          created_by_agent: string | null
          id: string
          intent_id: string
          kind: string
          name: string
          pointer: string
          sha256: string | null
          size_bytes: number | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_agent?: string | null
          id: string
          intent_id: string
          kind: string
          name: string
          pointer: string
          sha256?: string | null
          size_bytes?: number | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_agent?: string | null
          id?: string
          intent_id?: string
          kind?: string
          name?: string
          pointer?: string
          sha256?: string | null
          size_bytes?: number | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intent_artifacts_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      intents: {
        Row: {
          archived_at: string | null
          claw_id: string
          cover: string | null
          created_at: string
          emoji: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          preview: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          claw_id: string
          cover?: string | null
          created_at?: string
          emoji?: string | null
          id: string
          last_message_at?: string | null
          last_message_preview?: string | null
          preview?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          claw_id?: string
          cover?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          preview?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intents_claw_id_fkey"
            columns: ["claw_id"]
            isOneToOne: false
            referencedRelation: "claws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_facts: {
        Row: {
          category: string
          created_at: string
          id: string
          origin_intent_id: string | null
          text: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          origin_intent_id?: string | null
          text: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          origin_intent_id?: string | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_facts_origin_intent_id_fkey"
            columns: ["origin_intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          intent_id: string
          role: string
          status: string | null
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          intent_id: string
          role: string
          status?: string | null
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          intent_id?: string
          role?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_quotas: {
        Row: {
          created_at: string
          credit_usd: number | null
          partner_id: string
          sku_kind: string
          total: number
          updated_at: string
          used: number
          validity_days: number | null
        }
        Insert: {
          created_at?: string
          credit_usd?: number | null
          partner_id: string
          sku_kind: string
          total: number
          updated_at?: string
          used?: number
          validity_days?: number | null
        }
        Update: {
          created_at?: string
          credit_usd?: number | null
          partner_id?: string
          sku_kind?: string
          total?: number
          updated_at?: string
          used?: number
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_quotas_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pending_claws: {
        Row: {
          api_token: string | null
          billing_interval: string | null
          checkout_id: string
          claw_type: string
          created_at: string
          expires_at: string
          id: string
          location: string
          model: string | null
          name: string
          plan_id: string
          price_monthly: number
          provider: string
          referral_code: string | null
          root_password: string | null
          ssh_key_id: string | null
          user_id: string
          volume_size: number | null
        }
        Insert: {
          api_token?: string | null
          billing_interval?: string | null
          checkout_id: string
          claw_type?: string
          created_at?: string
          expires_at: string
          id: string
          location: string
          model?: string | null
          name: string
          plan_id: string
          price_monthly: number
          provider?: string
          referral_code?: string | null
          root_password?: string | null
          ssh_key_id?: string | null
          user_id: string
          volume_size?: number | null
        }
        Update: {
          api_token?: string | null
          billing_interval?: string | null
          checkout_id?: string
          claw_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          location?: string
          model?: string | null
          name?: string
          plan_id?: string
          price_monthly?: number
          provider?: string
          referral_code?: string | null
          root_password?: string | null
          ssh_key_id?: string | null
          user_id?: string
          volume_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_claws_ssh_key_id_fkey"
            columns: ["ssh_key_id"]
            isOneToOne: false
            referencedRelation: "ssh_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claws_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_grants: {
        Row: {
          capability_id: string
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capability_id: string
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capability_id?: string
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          last_sent_at: string
        }
        Insert: {
          key: string
          last_sent_at: string
        }
        Update: {
          key?: string
          last_sent_at?: string
        }
        Relationships: []
      }
      referral_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          referral_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id: string
          referral_id: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          referral_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_payments_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_user_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id: string
          referred_user_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_events: {
        Row: {
          created_at: string
          fire_at: string
          id: string
          intent_id: string
          recurrence: Json | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fire_at: string
          id?: string
          intent_id: string
          recurrence?: Json | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fire_at?: string
          id?: string
          intent_id?: string
          recurrence?: Json | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      ssh_keys: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          name: string
          provider_key_id: number | null
          public_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id: string
          name: string
          provider_key_id?: number | null
          public_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          name?: string
          provider_key_id?: number | null
          public_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssh_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          default_cover: string | null
          default_emoji: string | null
          display_name: string | null
          preferred_lang: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_cover?: string | null
          default_emoji?: string | null
          display_name?: string | null
          preferred_lang?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_cover?: string | null
          default_emoji?: string | null
          display_name?: string | null
          preferred_lang?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          has_license: boolean
          id: string
          name: string | null
          polar_customer_id: string | null
          referral_code: string | null
          referral_code_changed: boolean
          referred_by: string | null
          role: string
          used_free_trial: boolean
        }
        Insert: {
          created_at?: string
          has_license?: boolean
          id: string
          name?: string | null
          polar_customer_id?: string | null
          referral_code?: string | null
          referral_code_changed?: boolean
          referred_by?: string | null
          role?: string
          used_free_trial?: boolean
        }
        Update: {
          created_at?: string
          has_license?: boolean
          id?: string
          name?: string | null
          polar_customer_id?: string | null
          referral_code?: string | null
          referral_code_changed?: boolean
          referred_by?: string | null
          role?: string
          used_free_trial?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      volumes: {
        Row: {
          claw_id: string | null
          created_at: string
          id: string
          location: string
          name: string
          provider_volume_id: number | null
          size: number
          status: string
          user_id: string
        }
        Insert: {
          claw_id?: string | null
          created_at?: string
          id: string
          location: string
          name: string
          provider_volume_id?: number | null
          size: number
          status?: string
          user_id: string
        }
        Update: {
          claw_id?: string | null
          created_at?: string
          id?: string
          location?: string
          name?: string
          provider_volume_id?: number | null
          size?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volumes_claw_id_fkey"
            columns: ["claw_id"]
            isOneToOne: false
            referencedRelation: "claws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
