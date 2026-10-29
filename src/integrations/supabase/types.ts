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
      _diag_vendascasa: {
        Row: {
          created_at: string | null
          id: number
          kind: string | null
          request_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          kind?: string | null
          request_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          kind?: string | null
          request_id?: number | null
        }
        Relationships: []
      }
      _diag_vendascasa_register: {
        Row: {
          created_at: string | null
          id: number
          request_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          request_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          request_id?: number | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          amount: number
          commission_percentage: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string | null
          period_end: string
          period_start: string
          referral_id: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          commission_percentage: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          period_end: string
          period_start: string
          referral_id: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          commission_percentage?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          period_end?: string
          period_start?: string
          referral_id?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "subscription_with_affiliate"
            referencedColumns: ["referral_id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_with_affiliate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_coupons: {
        Row: {
          active: boolean
          affiliate_id: string
          code: string
          created_at: string
          current_uses: number
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          max_uses: number | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          affiliate_id: string
          code: string
          created_at?: string
          current_uses?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          max_uses?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          affiliate_id?: string
          code?: string
          created_at?: string
          current_uses?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          max_uses?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_coupons_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          affiliate_id: string
          coupon_id: string | null
          created_at: string
          first_payment_at: string | null
          id: string
          last_payment_at: string | null
          referred_user_id: string
          status: Database["public"]["Enums"]["referral_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          coupon_id?: string | null
          created_at?: string
          first_payment_at?: string | null
          id?: string
          last_payment_at?: string | null
          referred_user_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          coupon_id?: string | null
          created_at?: string
          first_payment_at?: string | null
          id?: string
          last_payment_at?: string | null
          referred_user_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "affiliate_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_with_affiliate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_withdrawals: {
        Row: {
          affiliate_id: string
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          invoice_pdf_url: string
          notes: string | null
          paid_at: string | null
          rejection_reason: string | null
          requested_at: string
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          invoice_pdf_url: string
          notes?: string | null
          paid_at?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          invoice_pdf_url?: string
          notes?: string | null
          paid_at?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_withdrawals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_withdrawals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          affiliate_code: string
          approved_at: string | null
          approved_by: string | null
          commission_percentage: number
          created_at: string
          id: string
          payment_details: Json | null
          payment_method: string | null
          status: Database["public"]["Enums"]["affiliate_status"]
          total_commission_earned: number
          total_commission_paid: number
          total_referrals: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          approved_at?: string | null
          approved_by?: string | null
          commission_percentage?: number
          created_at?: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_commission_earned?: number
          total_commission_paid?: number
          total_referrals?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          approved_at?: string | null
          approved_by?: string | null
          commission_percentage?: number
          created_at?: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_commission_earned?: number
          total_commission_paid?: number
          total_referrals?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_classification_mapping: {
        Row: {
          canonical_value: string
          created_at: string | null
          notes: string | null
          raw_value: string
        }
        Insert: {
          canonical_value: string
          created_at?: string | null
          notes?: string | null
          raw_value: string
        }
        Update: {
          canonical_value?: string
          created_at?: string | null
          notes?: string | null
          raw_value?: string
        }
        Relationships: []
      }
      carrier_status_map: {
        Row: {
          canonical_status: string
          carrier_name: string | null
          created_at: string
          id: string
          is_exception: boolean | null
          notify: boolean
          priority: number | null
          raw_idstatus: number
        }
        Insert: {
          canonical_status: string
          carrier_name?: string | null
          created_at?: string
          id?: string
          is_exception?: boolean | null
          notify?: boolean
          priority?: number | null
          raw_idstatus: number
        }
        Update: {
          canonical_status?: string
          carrier_name?: string | null
          created_at?: string
          id?: string
          is_exception?: boolean | null
          notify?: boolean
          priority?: number | null
          raw_idstatus?: number
        }
        Relationships: []
      }
      cashbacks: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          external_cashback_id: string | null
          id: string
          message_id: string | null
          order_id: string | null
          percentage: number | null
          redeemed_at: string | null
          seller_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["cashback_status"]
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          external_cashback_id?: string | null
          id?: string
          message_id?: string | null
          order_id?: string | null
          percentage?: number | null
          redeemed_at?: string | null
          seller_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["cashback_status"]
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          external_cashback_id?: string | null
          id?: string
          message_id?: string | null
          order_id?: string | null
          percentage?: number | null
          redeemed_at?: string | null
          seller_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["cashback_status"]
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashbacks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbacks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbacks_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbacks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      client_interactions: {
        Row: {
          client_id: string
          content: string | null
          created_at: string
          created_by: string
          id: string
          interaction_type: string
          metadata: Json | null
          seller_id: string
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string
          created_by: string
          id?: string
          interaction_type: string
          metadata?: Json | null
          seller_id: string
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string
          created_by?: string
          id?: string
          interaction_type?: string
          metadata?: Json | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics: {
        Row: {
          calculated_at: string
          client_id: string
          created_at: string
          first_order_at: string | null
          id: string
          last_order_at: string | null
          seller_id: string
          total_orders: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          client_id: string
          created_at?: string
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          seller_id: string
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          client_id?: string
          created_at?: string
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          seller_id?: string
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metrics_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pipeline: {
        Row: {
          cached_client_name: string | null
          cached_last_interaction_at: string | null
          cached_order_value: number | null
          client_id: string
          created_at: string
          id: string
          moved_at: string
          notes: string | null
          order_id: string | null
          previous_stage_id: string | null
          seller_id: string
          stage_id: string
        }
        Insert: {
          cached_client_name?: string | null
          cached_last_interaction_at?: string | null
          cached_order_value?: number | null
          client_id: string
          created_at?: string
          id?: string
          moved_at?: string
          notes?: string | null
          order_id?: string | null
          previous_stage_id?: string | null
          seller_id: string
          stage_id: string
        }
        Update: {
          cached_client_name?: string | null
          cached_last_interaction_at?: string | null
          cached_order_value?: number | null
          client_id?: string
          created_at?: string
          id?: string
          moved_at?: string
          notes?: string | null
          order_id?: string | null
          previous_stage_id?: string | null
          seller_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_pipeline_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipeline_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipeline_previous_stage_id_fkey"
            columns: ["previous_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipeline_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipeline_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tag_assignments: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          seller_id: string
          tag_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          seller_id: string
          tag_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          seller_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tag_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "client_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          age: number | null
          birthdate: string | null
          city: string | null
          complement: string | null
          country_code: string | null
          created_at: string
          document: string
          document_type: string
          email: string | null
          external_integration_id: string | null
          full_name: string | null
          gender: string | null
          id: string
          search_vector: unknown
          state_code: string | null
          street: string | null
          tracking_consent: boolean | null
          updated_at: string
          whatsapp: string | null
          whatsapp_opted_out: boolean
          whatsapp_opted_out_at: string | null
          whatsapp_opted_out_reason: string | null
          whatsapp_opted_out_source: string | null
          zip_code: string | null
        }
        Insert: {
          age?: number | null
          birthdate?: string | null
          city?: string | null
          complement?: string | null
          country_code?: string | null
          created_at?: string
          document: string
          document_type: string
          email?: string | null
          external_integration_id?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          search_vector?: unknown
          state_code?: string | null
          street?: string | null
          tracking_consent?: boolean | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
          whatsapp_opted_out_source?: string | null
          zip_code?: string | null
        }
        Update: {
          age?: number | null
          birthdate?: string | null
          city?: string | null
          complement?: string | null
          country_code?: string | null
          created_at?: string
          document?: string
          document_type?: string
          email?: string | null
          external_integration_id?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          search_vector?: unknown
          state_code?: string | null
          street?: string | null
          tracking_consent?: boolean | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
          whatsapp_opted_out_source?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_external_integration_id_fkey"
            columns: ["external_integration_id"]
            isOneToOne: false
            referencedRelation: "crm_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_sellers: {
        Row: {
          client_id: string
          first_seen_at: string
          id: string
          last_order_at: string | null
          seller_id: string
          source: Database["public"]["Enums"]["marketplace_platform"] | null
          whatsapp_opted_out: boolean
          whatsapp_opted_out_at: string | null
          whatsapp_opted_out_reason: string | null
          whatsapp_opted_out_source: string | null
        }
        Insert: {
          client_id: string
          first_seen_at?: string
          id?: string
          last_order_at?: string | null
          seller_id: string
          source?: Database["public"]["Enums"]["marketplace_platform"] | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
          whatsapp_opted_out_source?: string | null
        }
        Update: {
          client_id?: string
          first_seen_at?: string
          id?: string
          last_order_at?: string | null
          seller_id?: string
          source?: Database["public"]["Enums"]["marketplace_platform"] | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
          whatsapp_opted_out_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_sellers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_sellers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          message: string | null
          request_type: string
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_type: string
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_type?: string
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          client_id: string
          created_at: string
          has_email: boolean
          has_sms: boolean
          has_whatsapp: boolean
          id: string
          inbound_count: number
          last_inbound_message_at: string | null
          last_message_at: string
          last_message_preview: string | null
          seller_id: string
          status: string
          tags: string[] | null
          unread_count: number
          updated_at: string
          whatsapp_contact_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          client_id: string
          created_at?: string
          has_email?: boolean
          has_sms?: boolean
          has_whatsapp?: boolean
          id?: string
          inbound_count?: number
          last_inbound_message_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          seller_id: string
          status?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
          whatsapp_contact_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          client_id?: string
          created_at?: string
          has_email?: boolean
          has_sms?: boolean
          has_whatsapp?: boolean
          id?: string
          inbound_count?: number
          last_inbound_message_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          seller_id?: string
          status?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
          whatsapp_contact_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_cloud_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_integrations: {
        Row: {
          access_token: string | null
          access_token_encrypted: string | null
          admin_notes: string | null
          config: Json | null
          configured_by: string | null
          created_at: string
          custom_name: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["crm_provider"] | null
          refresh_token: string | null
          refresh_token_encrypted: string | null
          seller_id: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_encrypted?: string | null
          admin_notes?: string | null
          config?: Json | null
          configured_by?: string | null
          created_at?: string
          custom_name?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["crm_provider"] | null
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_encrypted?: string | null
          admin_notes?: string | null
          config?: Json | null
          configured_by?: string | null
          created_at?: string
          custom_name?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["crm_provider"] | null
          refresh_token?: string | null
          refresh_token_encrypted?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_integrations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_locks: {
        Row: {
          acquired_at: string
          acquired_by: string | null
          expires_at: string
          key: string
        }
        Insert: {
          acquired_at?: string
          acquired_by?: string | null
          expires_at: string
          key: string
        }
        Update: {
          acquired_at?: string
          acquired_by?: string | null
          expires_at?: string
          key?: string
        }
        Relationships: []
      }
      custom_payments: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          paid: boolean
          paid_at: string | null
          period_number: number
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid?: boolean
          paid_at?: string | null
          period_number: number
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid?: boolean
          paid_at?: string | null
          period_number?: number
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_with_affiliate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_audit_logs: {
        Row: {
          client_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          node_id: string | null
          node_type: string | null
          order_id: string | null
          provider: string | null
          queue_job_id: string | null
          seller_id: string
          status: string
          template_name: string | null
          workflow_execution_id: string | null
          workflow_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          node_id?: string | null
          node_type?: string | null
          order_id?: string | null
          provider?: string | null
          queue_job_id?: string | null
          seller_id: string
          status: string
          template_name?: string | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          node_id?: string | null
          node_type?: string | null
          order_id?: string | null
          provider?: string | null
          queue_job_id?: string | null
          seller_id?: string
          status?: string
          template_name?: string | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Relationships: []
      }
      evolution_instances: {
        Row: {
          active: boolean
          connected_at: string | null
          created_at: string
          id: string
          instance_name: string
          last_check_at: string | null
          phone_number: string | null
          qr_code: string | null
          qr_expires_at: string | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          connected_at?: string | null
          created_at?: string
          id?: string
          instance_name: string
          last_check_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          qr_expires_at?: string | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          connected_at?: string | null
          created_at?: string
          id?: string
          instance_name?: string
          last_check_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          qr_expires_at?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_instances_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_de_espera_soldiers_nova: {
        Row: {
          created_at: string
          pedido_id: number
          status: string | null
        }
        Insert: {
          created_at?: string
          pedido_id?: number
          status?: string | null
        }
        Update: {
          created_at?: string
          pedido_id?: number
          status?: string | null
        }
        Relationships: []
      }
      filtro_upseller: {
        Row: {
          created_at: string
          id: number
          pedido_id: string
          status: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          pedido_id: string
          status?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          pedido_id?: string
          status?: string | null
        }
        Relationships: []
      }
      link_clicks: {
        Row: {
          bot_reason: string | null
          clicked_at: string
          device_type: string | null
          id: string
          ip_hash: string | null
          is_bot: boolean
          seller_id: string
          short_link_id: string
          user_agent: string | null
        }
        Insert: {
          bot_reason?: string | null
          clicked_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          seller_id: string
          short_link_id: string
          user_agent?: string | null
        }
        Update: {
          bot_reason?: string | null
          clicked_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          seller_id?: string
          short_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clicks_short_link_id_fkey"
            columns: ["short_link_id"]
            isOneToOne: false
            referencedRelation: "short_links"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          marketplace_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          marketplace_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          marketplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_aliases_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplaces: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          enum_value: Database["public"]["Enums"]["marketplace_platform"]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          enum_value?: Database["public"]["Enums"]["marketplace_platform"]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          enum_value?: Database["public"]["Enums"]["marketplace_platform"]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_analyzed: boolean | null
          ai_entities: Json | null
          ai_intent: string | null
          ai_sentiment: string | null
          ai_summary: string | null
          content: string
          content_type: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          failed_reason: string | null
          id: string
          media_mime_type: string | null
          media_url: string | null
          metadata: Json | null
          read_at: string | null
          sender_id: string | null
          sender_type: string
          status: string | null
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          whatsapp_message_id: string | null
          whatsapp_timestamp: number | null
          workflow_execution_id: string | null
          workflow_id: string | null
        }
        Insert: {
          ai_analyzed?: boolean | null
          ai_entities?: Json | null
          ai_intent?: string | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          content: string
          content_type?: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          failed_reason?: string | null
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          whatsapp_message_id?: string | null
          whatsapp_timestamp?: number | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          ai_analyzed?: boolean | null
          ai_entities?: Json | null
          ai_intent?: string | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          content?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          failed_reason?: string | null
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          whatsapp_message_id?: string | null
          whatsapp_timestamp?: number | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workflow_execution_id_fkey"
            columns: ["workflow_execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_fetch_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          function_name: string
          id: string
          method: string
          status: number | null
          success: boolean | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          function_name: string
          id?: string
          method: string
          status?: number | null
          success?: boolean | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          function_name?: string
          id?: string
          method?: string
          status?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      mktg_meta_ads_insights: {
        Row: {
          ad_account_id: string
          add_to_cart: number | null
          campaign_id: string
          campaign_name: string | null
          campaign_status: string | null
          checkout: number | null
          clicks: number | null
          cost_per_link_click: number | null
          cost_per_messaging: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          daily_budget_cents: number | null
          date: string
          frequency: number | null
          impressions: number | null
          landing_page_views: number | null
          leads: number | null
          link_clicks: number | null
          link_ctr: number | null
          messaging_replied: number | null
          messaging_started: number | null
          objective: string | null
          post_engagement: number | null
          purchases: number | null
          reach: number | null
          revenue: number | null
          spend: number | null
          synced_at: string
          video_views: number | null
        }
        Insert: {
          ad_account_id: string
          add_to_cart?: number | null
          campaign_id: string
          campaign_name?: string | null
          campaign_status?: string | null
          checkout?: number | null
          clicks?: number | null
          cost_per_link_click?: number | null
          cost_per_messaging?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          daily_budget_cents?: number | null
          date: string
          frequency?: number | null
          impressions?: number | null
          landing_page_views?: number | null
          leads?: number | null
          link_clicks?: number | null
          link_ctr?: number | null
          messaging_replied?: number | null
          messaging_started?: number | null
          objective?: string | null
          post_engagement?: number | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          spend?: number | null
          synced_at?: string
          video_views?: number | null
        }
        Update: {
          ad_account_id?: string
          add_to_cart?: number | null
          campaign_id?: string
          campaign_name?: string | null
          campaign_status?: string | null
          checkout?: number | null
          clicks?: number | null
          cost_per_link_click?: number | null
          cost_per_messaging?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          daily_budget_cents?: number | null
          date?: string
          frequency?: number | null
          impressions?: number | null
          landing_page_views?: number | null
          leads?: number | null
          link_clicks?: number | null
          link_ctr?: number | null
          messaging_replied?: number | null
          messaging_started?: number | null
          objective?: string | null
          post_engagement?: number | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          spend?: number | null
          synced_at?: string
          video_views?: number | null
        }
        Relationships: []
      }
      numeros_invalidos: {
        Row: {
          cpf: string
          criado: string | null
          message_id: string | null
          phone_lookup_id: string | null
          provedor: string | null
          signal_type: string | null
          telefone_que_falhou: string | null
        }
        Insert: {
          cpf: string
          criado?: string | null
          message_id?: string | null
          phone_lookup_id?: string | null
          provedor?: string | null
          signal_type?: string | null
          telefone_que_falhou?: string | null
        }
        Update: {
          cpf?: string
          criado?: string | null
          message_id?: string | null
          phone_lookup_id?: string | null
          provedor?: string | null
          signal_type?: string | null
          telefone_que_falhou?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "numeros_invalidos_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_invalidos_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_outcome"
            referencedColumns: ["message_id_outcome"]
          },
          {
            foreignKeyName: "numeros_invalidos_phone_lookup_id_fkey"
            columns: ["phone_lookup_id"]
            isOneToOne: false
            referencedRelation: "phone_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_invalidos_phone_lookup_id_fkey"
            columns: ["phone_lookup_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_comparison"
            referencedColumns: ["lookup_assertiva_id"]
          },
          {
            foreignKeyName: "numeros_invalidos_phone_lookup_id_fkey"
            columns: ["phone_lookup_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_comparison"
            referencedColumns: ["lookup_credilink_id"]
          },
          {
            foreignKeyName: "numeros_invalidos_phone_lookup_id_fkey"
            columns: ["phone_lookup_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_outcome"
            referencedColumns: ["lookup_id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_status: string
          old_status: string | null
          order_id: string
          seller_id: string
          source: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status: string
          old_status?: string | null
          order_id: string
          seller_id: string
          source?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string
          old_status?: string | null
          order_id?: string
          seller_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          acquired_at: string
          client_id: string | null
          created_at: string
          currency: string
          external_integration_id: string | null
          external_order_id: string | null
          forecast_opt_in: boolean
          forecast_opt_in_at: string | null
          id: string
          is_second_sale: boolean | null
          marketplace: Database["public"]["Enums"]["marketplace_platform"]
          order_status: string
          product: string | null
          search_vector: unknown
          seller_id: string
          shipment_status: string | null
          sku: string | null
          store_id: string | null
          total_amount: number
          updated_at: string
          vendedor: string | null
          whatsapp_contacted_at: string | null
        }
        Insert: {
          acquired_at?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          external_integration_id?: string | null
          external_order_id?: string | null
          forecast_opt_in?: boolean
          forecast_opt_in_at?: string | null
          id?: string
          is_second_sale?: boolean | null
          marketplace: Database["public"]["Enums"]["marketplace_platform"]
          order_status?: string
          product?: string | null
          search_vector?: unknown
          seller_id: string
          shipment_status?: string | null
          sku?: string | null
          store_id?: string | null
          total_amount?: number
          updated_at?: string
          vendedor?: string | null
          whatsapp_contacted_at?: string | null
        }
        Update: {
          acquired_at?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          external_integration_id?: string | null
          external_order_id?: string | null
          forecast_opt_in?: boolean
          forecast_opt_in_at?: string | null
          id?: string
          is_second_sale?: boolean | null
          marketplace?: Database["public"]["Enums"]["marketplace_platform"]
          order_status?: string
          product?: string | null
          search_vector?: unknown
          seller_id?: string
          shipment_status?: string | null
          sku?: string | null
          store_id?: string | null
          total_amount?: number
          updated_at?: string
          vendedor?: string | null
          whatsapp_contacted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_external_integration_id_fkey"
            columns: ["external_integration_id"]
            isOneToOne: false
            referencedRelation: "crm_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_api_logs: {
        Row: {
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          ip_address: unknown
          method: string
          request_body: Json | null
          response_time_ms: number | null
          seller_id: string | null
          status_code: number | null
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          method: string
          request_body?: Json | null
          response_time_ms?: number | null
          seller_id?: string | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          seller_id?: string | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_api_logs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_api_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "partner_api_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_api_tokens: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          partner_id: string | null
          rate_limit_per_minute: number | null
          requests_count: number | null
          scopes: string[] | null
          seller_id: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          partner_id?: string | null
          rate_limit_per_minute?: number | null
          requests_count?: number | null
          scopes?: string[] | null
          seller_id: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          partner_id?: string | null
          rate_limit_per_minute?: number | null
          requests_count?: number | null
          scopes?: string[] | null
          seller_id?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_api_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_api_tokens_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_api_tokens_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_integrations: {
        Row: {
          active: boolean | null
          admin_token_hash: string
          admin_token_prefix: string
          allowed_embed_domains: string[] | null
          created_at: string | null
          default_client_limit: number | null
          default_plan_type: string | null
          id: string
          max_sellers_per_month: number | null
          name: string
          sellers_created_count: number | null
          sellers_created_reset_at: string | null
          slug: string
          updated_at: string | null
          webhook_ip_whitelist: string[] | null
        }
        Insert: {
          active?: boolean | null
          admin_token_hash: string
          admin_token_prefix: string
          allowed_embed_domains?: string[] | null
          created_at?: string | null
          default_client_limit?: number | null
          default_plan_type?: string | null
          id?: string
          max_sellers_per_month?: number | null
          name: string
          sellers_created_count?: number | null
          sellers_created_reset_at?: string | null
          slug: string
          updated_at?: string | null
          webhook_ip_whitelist?: string[] | null
        }
        Update: {
          active?: boolean | null
          admin_token_hash?: string
          admin_token_prefix?: string
          allowed_embed_domains?: string[] | null
          created_at?: string | null
          default_client_limit?: number | null
          default_plan_type?: string | null
          id?: string
          max_sellers_per_month?: number | null
          name?: string
          sellers_created_count?: number | null
          sellers_created_reset_at?: string | null
          slug?: string
          updated_at?: string | null
          webhook_ip_whitelist?: string[] | null
        }
        Relationships: []
      }
      phone_lookups: {
        Row: {
          client_id: string | null
          consulta_duracao_ms: number | null
          cpf_consultado: string
          created_at: string
          fase_experimento: string
          id: string
          marketplace: string | null
          message_id: string | null
          order_id: string | null
          payload_completo: Json | null
          provedor: string
          seller_id: string
          telefone_principal: string | null
          telefones_todos: Json | null
          tem_dado: boolean
          usado_no_disparo: boolean
          whatsapp_message_id: string | null
        }
        Insert: {
          client_id?: string | null
          consulta_duracao_ms?: number | null
          cpf_consultado: string
          created_at?: string
          fase_experimento?: string
          id?: string
          marketplace?: string | null
          message_id?: string | null
          order_id?: string | null
          payload_completo?: Json | null
          provedor: string
          seller_id: string
          telefone_principal?: string | null
          telefones_todos?: Json | null
          tem_dado?: boolean
          usado_no_disparo?: boolean
          whatsapp_message_id?: string | null
        }
        Update: {
          client_id?: string | null
          consulta_duracao_ms?: number | null
          cpf_consultado?: string
          created_at?: string
          fase_experimento?: string
          id?: string
          marketplace?: string | null
          message_id?: string | null
          order_id?: string | null
          payload_completo?: Json | null
          provedor?: string
          seller_id?: string
          telefone_principal?: string | null
          telefones_todos?: Json | null
          tem_dado?: boolean
          usado_no_disparo?: boolean
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_lookups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lookups_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lookups_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_outcome"
            referencedColumns: ["message_id_outcome"]
          },
          {
            foreignKeyName: "phone_lookups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lookups_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          condition: Json | null
          created_at: string
          id: string
          name: string
          position: number
          seller_id: string
          stage_type: string
          is_entry: boolean
          updated_at: string
        }
        Insert: {
          color?: string | null
          condition?: Json | null
          created_at?: string
          id?: string
          name: string
          position: number
          seller_id: string
          stage_type?: string
          is_entry?: boolean
          updated_at?: string
        }
        Update: {
          color?: string | null
          condition?: Json | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          seller_id?: string
          stage_type?: string
          is_entry?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          active: boolean
          cnpj: string | null
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_affiliate: boolean | null
          is_demo: boolean | null
          monthly_sales_total: number | null
          onboarding_completed: boolean | null
          phone: string | null
          signup_landing_page: string | null
          signup_referrer: string | null
          signup_user_agent: string | null
          signup_utm_campaign: string | null
          signup_utm_content: string | null
          signup_utm_medium: string | null
          signup_utm_source: string | null
          signup_utm_term: string | null
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          account_type?: string | null
          active?: boolean
          cnpj?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_affiliate?: boolean | null
          is_demo?: boolean | null
          monthly_sales_total?: number | null
          onboarding_completed?: boolean | null
          phone?: string | null
          signup_landing_page?: string | null
          signup_referrer?: string | null
          signup_user_agent?: string | null
          signup_utm_campaign?: string | null
          signup_utm_content?: string | null
          signup_utm_medium?: string | null
          signup_utm_source?: string | null
          signup_utm_term?: string | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          account_type?: string | null
          active?: boolean
          cnpj?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_affiliate?: boolean | null
          is_demo?: boolean | null
          monthly_sales_total?: number | null
          onboarding_completed?: boolean | null
          phone?: string | null
          signup_landing_page?: string | null
          signup_referrer?: string | null
          signup_user_agent?: string | null
          signup_utm_campaign?: string | null
          signup_utm_content?: string | null
          signup_utm_medium?: string | null
          signup_utm_source?: string | null
          signup_utm_term?: string | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          seller_id: string
          shortcut: string | null
          title: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          seller_id: string
          shortcut?: string | null
          title: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          seller_id?: string
          shortcut?: string | null
          title?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type: string
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seller_ai_agents: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          include_client_data: boolean
          include_conversation_history: boolean
          include_order_history: boolean
          max_history_messages: number
          max_tokens: number
          model: string
          response_delay_seconds: number
          seller_id: string
          system_prompt: string
          temperature: number
          updated_at: string
          working_hours: Json | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_client_data?: boolean
          include_conversation_history?: boolean
          include_order_history?: boolean
          max_history_messages?: number
          max_tokens?: number
          model?: string
          response_delay_seconds?: number
          seller_id: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          working_hours?: Json | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_client_data?: boolean
          include_conversation_history?: boolean
          include_order_history?: boolean
          max_history_messages?: number
          max_tokens?: number
          model?: string
          response_delay_seconds?: number
          seller_id?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_ai_agents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_api_keys: {
        Row: {
          active: boolean
          api_key_encrypted: string
          created_at: string
          created_by: string
          id: string
          key_type: string
          label: string | null
          last_used_at: string | null
          seller_id: string
          total_requests: number | null
        }
        Insert: {
          active?: boolean
          api_key_encrypted: string
          created_at?: string
          created_by: string
          id?: string
          key_type: string
          label?: string | null
          last_used_at?: string | null
          seller_id: string
          total_requests?: number | null
        }
        Update: {
          active?: boolean
          api_key_encrypted?: string
          created_at?: string
          created_by?: string
          id?: string
          key_type?: string
          label?: string | null
          last_used_at?: string | null
          seller_id?: string
          total_requests?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_api_keys_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_apps: {
        Row: {
          app_type: string
          created_at: string
          credentials: Json | null
          display_name: string
          id: string
          last_synced_at: string | null
          metadata: Json | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          app_type: string
          created_at?: string
          credentials?: Json | null
          display_name: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          app_type?: string
          created_at?: string
          credentials?: Json | null
          display_name?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_apps_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_capture_alerts: {
        Row: {
          created_at: string
          external_task_id: string | null
          hours_without_capture: number
          id: string
          last_order_at: string | null
          plan_type: string
          resolved_at: string | null
          seller_id: string
          task_created_at: string
        }
        Insert: {
          created_at?: string
          external_task_id?: string | null
          hours_without_capture: number
          id?: string
          last_order_at?: string | null
          plan_type: string
          resolved_at?: string | null
          seller_id: string
          task_created_at?: string
        }
        Update: {
          created_at?: string
          external_task_id?: string | null
          hours_without_capture?: number
          id?: string
          last_order_at?: string | null
          plan_type?: string
          resolved_at?: string | null
          seller_id?: string
          task_created_at?: string
        }
        Relationships: []
      }
      seller_dispatch_alerts: {
        Row: {
          created_at: string
          external_task_id: string | null
          hours_without_dispatch: number
          id: string
          last_dispatch_at: string | null
          pending_jobs_count: number | null
          resolved_at: string | null
          seller_id: string
        }
        Insert: {
          created_at?: string
          external_task_id?: string | null
          hours_without_dispatch: number
          id?: string
          last_dispatch_at?: string | null
          pending_jobs_count?: number | null
          resolved_at?: string | null
          seller_id: string
        }
        Update: {
          created_at?: string
          external_task_id?: string | null
          hours_without_dispatch?: number
          id?: string
          last_dispatch_at?: string | null
          pending_jobs_count?: number | null
          resolved_at?: string | null
          seller_id?: string
        }
        Relationships: []
      }
      seller_marketplace_aliases: {
        Row: {
          badge_color: string
          created_at: string
          display_name: string
          id: string
          original_value: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          badge_color?: string
          created_at?: string
          display_name: string
          id?: string
          original_value?: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          badge_color?: string
          created_at?: string
          display_name?: string
          id?: string
          original_value?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_marketplace_aliases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_email: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          seller_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["app_role"]
          seller_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_members_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          cloud_round_robin_index: number
          contact_email: string | null
          created_at: string
          created_by: string
          id: string
          monthly_sales_average: number | null
          name: string
          round_robin_index: number | null
          segunda_venda_percentage: number | null
          status: string | null
          subdomain_slug: string | null
          tax_id: string | null
          template_metrics_enabled: boolean
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          active?: boolean
          cloud_round_robin_index?: number
          contact_email?: string | null
          created_at?: string
          created_by: string
          id?: string
          monthly_sales_average?: number | null
          name: string
          round_robin_index?: number | null
          segunda_venda_percentage?: number | null
          status?: string | null
          subdomain_slug?: string | null
          tax_id?: string | null
          template_metrics_enabled?: boolean
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          active?: boolean
          cloud_round_robin_index?: number
          contact_email?: string | null
          created_at?: string
          created_by?: string
          id?: string
          monthly_sales_average?: number | null
          name?: string
          round_robin_index?: number | null
          segunda_venda_percentage?: number | null
          status?: string | null
          subdomain_slug?: string | null
          tax_id?: string | null
          template_metrics_enabled?: boolean
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          canonical_status: string | null
          created_at: string
          event_at: string
          event_key: string
          id: string
          is_exception: boolean | null
          order_id: string
          raw_carrier: string | null
          raw_description: string | null
          raw_idstatus: number | null
          shipment_id: string | null
        }
        Insert: {
          canonical_status?: string | null
          created_at?: string
          event_at: string
          event_key: string
          id?: string
          is_exception?: boolean | null
          order_id: string
          raw_carrier?: string | null
          raw_description?: string | null
          raw_idstatus?: number | null
          shipment_id?: string | null
        }
        Update: {
          canonical_status?: string | null
          created_at?: string
          event_at?: string
          event_key?: string
          id?: string
          is_exception?: boolean | null
          order_id?: string
          raw_carrier?: string | null
          raw_description?: string | null
          raw_idstatus?: number | null
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["order_id"]
          },
        ]
      }
      shipment_forecast_dispatches: {
        Row: {
          days_before: number
          dispatched_at: string
          id: string
          order_id: string
          seller_id: string
          workflow_id: string
        }
        Insert: {
          days_before: number
          dispatched_at?: string
          id?: string
          order_id: string
          seller_id: string
          workflow_id: string
        }
        Update: {
          days_before?: number
          dispatched_at?: string
          id?: string
          order_id?: string
          seller_id?: string
          workflow_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier_name: string | null
          created_at: string
          current_idstatus: number | null
          current_status: string | null
          delivered_at: string | null
          estimated_delivery_at: string | null
          is_exception: boolean | null
          last_event_at: string | null
          order_id: string
          seller_id: string
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          carrier_name?: string | null
          created_at?: string
          current_idstatus?: number | null
          current_status?: string | null
          delivered_at?: string | null
          estimated_delivery_at?: string | null
          is_exception?: boolean | null
          last_event_at?: string | null
          order_id: string
          seller_id: string
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          carrier_name?: string | null
          created_at?: string
          current_idstatus?: number | null
          current_status?: string | null
          delivered_at?: string | null
          estimated_delivery_at?: string | null
          is_exception?: boolean | null
          last_event_at?: string | null
          order_id?: string
          seller_id?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      short_links: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination_url: string
          expires_at: string | null
          id: string
          is_active: boolean
          metadata: Json
          order_id: string | null
          provider_message_id: string | null
          seller_id: string
          slug: string
          source: string | null
          template_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination_url: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          order_id?: string | null
          provider_message_id?: string | null
          seller_id: string
          slug: string
          source?: string | null
          template_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination_url?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          order_id?: string | null
          provider_message_id?: string | null
          seller_id?: string
          slug?: string
          source?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "short_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_links_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      showcase_niches: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "showcase_niches_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          created_at: string
          external_store_id: string | null
          id: string
          name: string | null
          platform: Database["public"]["Enums"]["marketplace_platform"]
          seller_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          external_store_id?: string | null
          id?: string
          name?: string | null
          platform: Database["public"]["Enums"]["marketplace_platform"]
          seller_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          external_store_id?: string | null
          id?: string
          name?: string | null
          platform?: Database["public"]["Enums"]["marketplace_platform"]
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean | null
          captura_anterior: number
          captura_anterior_ate: string | null
          captura_ciclo_fim: string | null
          captura_ciclo_inicio: string | null
          ciclo_ancora: string
          client_limit: number
          created_at: string
          currency: string | null
          current_client_count: number | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_enterprise: boolean | null
          limite_mensal: number | null
          notes: string | null
          payment_method: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_payment_link: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean | null
          captura_anterior?: number
          captura_anterior_ate?: string | null
          captura_ciclo_fim?: string | null
          captura_ciclo_inicio?: string | null
          ciclo_ancora?: string
          client_limit: number
          created_at?: string
          currency?: string | null
          current_client_count?: number | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_enterprise?: boolean | null
          limite_mensal?: never
          notes?: string | null
          payment_method?: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_payment_link?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean | null
          captura_anterior?: number
          captura_anterior_ate?: string | null
          captura_ciclo_fim?: string | null
          captura_ciclo_inicio?: string | null
          ciclo_ancora?: string
          client_limit?: number
          created_at?: string
          currency?: string | null
          current_client_count?: number | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_enterprise?: boolean | null
          limite_mensal?: never
          notes?: string | null
          payment_method?: string | null
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_payment_link?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_secrets: {
        Row: {
          created_at: string
          cron_secret: string
          id: number
        }
        Insert: {
          created_at?: string
          cron_secret?: string
          id?: number
        }
        Update: {
          created_at?: string
          cron_secret?: string
          id?: number
        }
        Relationships: []
      }
      template_send_events: {
        Row: {
          ai_classification: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          node_id: string
          replied_at: string | null
          reply_content: string | null
          response_time_seconds: number | null
          seller_id: string
          sent_at: string
          template_name: string
          updated_at: string
          workflow_execution_id: string | null
          workflow_id: string | null
        }
        Insert: {
          ai_classification?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          node_id: string
          replied_at?: string | null
          reply_content?: string | null
          response_time_seconds?: number | null
          seller_id: string
          sent_at?: string
          template_name: string
          updated_at?: string
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          ai_classification?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          node_id?: string
          replied_at?: string | null
          reply_content?: string | null
          response_time_seconds?: number | null
          seller_id?: string
          sent_at?: string
          template_name?: string
          updated_at?: string
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_send_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_send_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_send_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      template_status_tracking: {
        Row: {
          created_at: string
          created_in_meta_at: string | null
          id: string
          language: string | null
          last_status: string
          notified_approved_at: string | null
          seller_id: string | null
          template_id: string
          template_name: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          created_at?: string
          created_in_meta_at?: string | null
          id?: string
          language?: string | null
          last_status: string
          notified_approved_at?: string | null
          seller_id?: string | null
          template_id: string
          template_name: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          created_at?: string
          created_in_meta_at?: string | null
          id?: string
          language?: string | null
          last_status?: string
          notified_approved_at?: string | null
          seller_id?: string | null
          template_id?: string
          template_name?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_status_tracking_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      teste_upseller_rrm: {
        Row: {
          created_at: string
          id: number
          pedido_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          pedido_id: string
        }
        Update: {
          created_at?: string
          id?: number
          pedido_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invitation_token: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          seller_id: string | null
          used: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invitation_token?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          seller_id?: string | null
          used?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invitation_token?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          seller_id?: string | null
          used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_metrics: {
        Row: {
          calculated_at: string
          clients_last_30_days: number
          clients_last_7_days: number
          created_at: string
          id: string
          orders_last_30_days: number
          orders_last_7_days: number
          revenue_last_30_days: number
          revenue_last_7_days: number
          total_clients: number
          total_orders: number
          total_revenue: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calculated_at?: string
          clients_last_30_days?: number
          clients_last_7_days?: number
          created_at?: string
          id?: string
          orders_last_30_days?: number
          orders_last_7_days?: number
          revenue_last_30_days?: number
          revenue_last_7_days?: number
          total_clients?: number
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calculated_at?: string
          clients_last_30_days?: number
          clients_last_7_days?: number
          created_at?: string
          id?: string
          orders_last_30_days?: number
          orders_last_7_days?: number
          revenue_last_30_days?: number
          revenue_last_7_days?: number
          total_clients?: number
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waba_forwards: {
        Row: {
          created_at: string
          destination_url: string
          forwarder_secret: string
          id: string
          is_active: boolean
          label: string | null
          last_forward_error: string | null
          last_forward_status: number | null
          last_forwarded_at: string | null
          phone_number_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_url: string
          forwarder_secret: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_forward_error?: string | null
          last_forward_status?: number | null
          last_forwarded_at?: string | null
          phone_number_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_url?: string
          forwarder_secret?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_forward_error?: string | null
          last_forward_status?: number | null
          last_forwarded_at?: string | null
          phone_number_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          endpoint_url: string
          error_message: string | null
          id: string
          request_body: Json | null
          request_headers: Json | null
          request_method: string
          response_body: string | null
          response_status: number | null
          seller_id: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint_url: string
          error_message?: string | null
          id?: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          response_body?: string | null
          response_status?: number | null
          seller_id: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint_url?: string
          error_message?: string | null
          id?: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          response_body?: string | null
          response_status?: number | null
          seller_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_api_logs: {
        Row: {
          action: string
          created_at: string
          error_code: number | null
          error_message: string | null
          error_subcode: number | null
          error_user_msg: string | null
          id: string
          request_payload: Json | null
          response_payload: Json | null
          seller_id: string
          success: boolean
          template_name: string | null
          to_phone: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_user_msg?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          seller_id: string
          success?: boolean
          template_name?: string | null
          to_phone?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_user_msg?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          seller_id?: string
          success?: boolean
          template_name?: string | null
          to_phone?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_api_logs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_cloud_instances: {
        Row: {
          access_token: string | null
          access_token_encrypted: string | null
          auto_pause_reason: string | null
          auto_paused_at: string | null
          ban_error_code: number | null
          ban_reason: string | null
          banned_at: string | null
          business_phone_number: string
          circuit_breaker_activated_at: string | null
          circuit_breaker_active: boolean
          circuit_breaker_reason: string | null
          created_at: string
          daily_reset_at: string
          daily_sent_count: number
          dispatch_disabled_reason: string | null
          dispatch_enabled: boolean
          display_name: string | null
          error_message: string | null
          health_status: Json | null
          id: string
          invalid_number_pause_at: string | null
          invalid_number_pause_reason: string | null
          is_default: boolean | null
          is_permanent_token: boolean
          label: string | null
          last_status_check_at: string | null
          last_token_source: string | null
          last_token_source_at: string | null
          last_webhook_received_at: string | null
          messaging_limit: string | null
          messaging_limit_tier: string | null
          name_status: string | null
          payment_configured: boolean | null
          phone_number_id: string
          quality_rating: string | null
          quality_recovery_started_at: string | null
          seller_id: string
          spam_report_count: number | null
          spam_reports_reset_at: string | null
          status: string
          token_expires_at: string | null
          two_step_pin_encrypted: string | null
          updated_at: string
          verified_at: string | null
          waba_id: string
          waba_name: string | null
          warmup_curve: Json | null
          warmup_first_dispatch_at: string | null
          warmup_started_at: string | null
          webhook_url: string
          webhook_verified_at: string | null
          webhook_verify_token: string
          yellow_paused_until: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_encrypted?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          ban_error_code?: number | null
          ban_reason?: string | null
          banned_at?: string | null
          business_phone_number: string
          circuit_breaker_activated_at?: string | null
          circuit_breaker_active?: boolean
          circuit_breaker_reason?: string | null
          created_at?: string
          daily_reset_at?: string
          daily_sent_count?: number
          dispatch_disabled_reason?: string | null
          dispatch_enabled?: boolean
          display_name?: string | null
          error_message?: string | null
          health_status?: Json | null
          id?: string
          invalid_number_pause_at?: string | null
          invalid_number_pause_reason?: string | null
          is_default?: boolean | null
          is_permanent_token?: boolean
          label?: string | null
          last_status_check_at?: string | null
          last_token_source?: string | null
          last_token_source_at?: string | null
          last_webhook_received_at?: string | null
          messaging_limit?: string | null
          messaging_limit_tier?: string | null
          name_status?: string | null
          payment_configured?: boolean | null
          phone_number_id: string
          quality_rating?: string | null
          quality_recovery_started_at?: string | null
          seller_id: string
          spam_report_count?: number | null
          spam_reports_reset_at?: string | null
          status?: string
          token_expires_at?: string | null
          two_step_pin_encrypted?: string | null
          updated_at?: string
          verified_at?: string | null
          waba_id: string
          waba_name?: string | null
          warmup_curve?: Json | null
          warmup_first_dispatch_at?: string | null
          warmup_started_at?: string | null
          webhook_url: string
          webhook_verified_at?: string | null
          webhook_verify_token?: string
          yellow_paused_until?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_encrypted?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          ban_error_code?: number | null
          ban_reason?: string | null
          banned_at?: string | null
          business_phone_number?: string
          circuit_breaker_activated_at?: string | null
          circuit_breaker_active?: boolean
          circuit_breaker_reason?: string | null
          created_at?: string
          daily_reset_at?: string
          daily_sent_count?: number
          dispatch_disabled_reason?: string | null
          dispatch_enabled?: boolean
          display_name?: string | null
          error_message?: string | null
          health_status?: Json | null
          id?: string
          invalid_number_pause_at?: string | null
          invalid_number_pause_reason?: string | null
          is_default?: boolean | null
          is_permanent_token?: boolean
          label?: string | null
          last_status_check_at?: string | null
          last_token_source?: string | null
          last_token_source_at?: string | null
          last_webhook_received_at?: string | null
          messaging_limit?: string | null
          messaging_limit_tier?: string | null
          name_status?: string | null
          payment_configured?: boolean | null
          phone_number_id?: string
          quality_rating?: string | null
          quality_recovery_started_at?: string | null
          seller_id?: string
          spam_report_count?: number | null
          spam_reports_reset_at?: string | null
          status?: string
          token_expires_at?: string | null
          two_step_pin_encrypted?: string | null
          updated_at?: string
          verified_at?: string | null
          waba_id?: string
          waba_name?: string | null
          warmup_curve?: Json | null
          warmup_first_dispatch_at?: string | null
          warmup_started_at?: string | null
          webhook_url?: string
          webhook_verified_at?: string | null
          webhook_verify_token?: string
          yellow_paused_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_cloud_instances_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_configs: {
        Row: {
          created_at: string
          id: string
          instance_id: string | null
          message_template: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id?: string | null
          message_template?: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string | null
          message_template?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_configs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversion_cases: {
        Row: {
          admin_notes: string | null
          analyzed_at: string
          client_id: string
          conversation_id: string
          created_at: string
          evidence_message_ids: string[] | null
          first_order_id: string | null
          id: string
          intent_confidence: number
          intent_summary: string | null
          intent_type: string
          last_analyzed_inbound_count: number
          model_used: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          tokens_used: number | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          analyzed_at?: string
          client_id: string
          conversation_id: string
          created_at?: string
          evidence_message_ids?: string[] | null
          first_order_id?: string | null
          id?: string
          intent_confidence?: number
          intent_summary?: string | null
          intent_type: string
          last_analyzed_inbound_count?: number
          model_used?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          tokens_used?: number | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          analyzed_at?: string
          client_id?: string
          conversation_id?: string
          created_at?: string
          evidence_message_ids?: string[] | null
          first_order_id?: string | null
          id?: string
          intent_confidence?: number
          intent_summary?: string | null
          intent_type?: string
          last_analyzed_inbound_count?: number
          model_used?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          tokens_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversion_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversion_cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversion_cases_first_order_id_fkey"
            columns: ["first_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversion_cases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error: string | null
          id: string
          order_id: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"] | null
          provider_message_id: string | null
          read_at: string | null
          seller_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          store_id: string | null
          template_name: string | null
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          id?: string
          order_id?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"] | null
          provider_message_id?: string | null
          read_at?: string | null
          seller_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          store_id?: string | null
          template_name?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          id?: string
          order_id?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"] | null
          provider_message_id?: string | null
          read_at?: string | null
          seller_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          store_id?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_presets: {
        Row: {
          body: string
          buttons: Json | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          footer: string | null
          header_text: string | null
          header_type: string | null
          icon: string | null
          id: string
          is_active: boolean
          language: string
          name: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          body: string
          buttons?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer?: string | null
          header_text?: string | null
          header_type?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          body?: string
          buttons?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer?: string | null
          header_text?: string | null
          header_type?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          category: string
          components: Json
          created_at: string
          id: string
          language: string
          name: string
          rejected_reason: string | null
          seller_id: string
          status: string
          synced_at: string
          template_id: string
          updated_at: string | null
          whatsapp_instance_id: string
        }
        Insert: {
          category: string
          components: Json
          created_at?: string
          id?: string
          language?: string
          name: string
          rejected_reason?: string | null
          seller_id: string
          status: string
          synced_at?: string
          template_id: string
          updated_at?: string | null
          whatsapp_instance_id: string
        }
        Update: {
          category?: string
          components?: Json
          created_at?: string
          id?: string
          language?: string
          name?: string
          rejected_reason?: string | null
          seller_id?: string
          status?: string
          synced_at?: string
          template_id?: string
          updated_at?: string | null
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_cloud_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_distribution_state: {
        Row: {
          cursor: number
          id: string
          node_id: string
          per_stage_count: Json
          seller_id: string
          total_distributed: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          cursor?: number
          id?: string
          node_id: string
          per_stage_count?: Json
          seller_id: string
          total_distributed?: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          cursor?: number
          id?: string
          node_id?: string
          per_stage_count?: Json
          seller_id?: string
          total_distributed?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_distribution_state_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_distribution_state_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          execution_log: Json | null
          id: string
          order_id: string | null
          scheduled_for: string | null
          started_at: string
          status: string
          workflow_id: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          order_id?: string | null
          scheduled_for?: string | null
          started_at?: string
          status?: string
          workflow_id: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          order_id?: string | null
          scheduled_for?: string | null
          started_at?: string
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_queue: {
        Row: {
          client_id: string | null
          completed_at: string | null
          context: Json
          conversation_id: string | null
          created_at: string
          error_message: string | null
          execution_log: Json | null
          id: string
          max_retries: number
          message_id: string | null
          order_id: string | null
          priority: number
          retry_count: number
          scheduled_for: string
          seller_id: string
          started_at: string | null
          status: string
          workflow_id: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          max_retries?: number
          message_id?: string | null
          order_id?: string | null
          priority?: number
          retry_count?: number
          scheduled_for?: string
          seller_id: string
          started_at?: string | null
          status?: string
          workflow_id: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          max_retries?: number
          message_id?: string | null
          order_id?: string | null
          priority?: number
          retry_count?: number
          scheduled_for?: string
          seller_id?: string
          started_at?: string | null
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "vw_phone_lookups_outcome"
            referencedColumns: ["message_id_outcome"]
          },
          {
            foreignKeyName: "workflow_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_queue_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_queue_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          edges: Json
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          nodes: Json
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          edges?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          nodes?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          edges?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          nodes?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_test_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          events: Json
          finished_at: string | null
          id: string
          last_active_node_id: string | null
          seller_id: string
          started_at: string
          status: string
          test_phone: string | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          events?: Json
          finished_at?: string | null
          id?: string
          last_active_node_id?: string | null
          seller_id: string
          started_at?: string
          status?: string
          test_phone?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          events?: Json
          finished_at?: string | null
          id?: string
          last_active_node_id?: string | null
          seller_id?: string
          started_at?: string
          status?: string
          test_phone?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_test_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_test_runs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_test_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_waiting_replies: {
        Row: {
          ai_config: Json | null
          client_id: string
          context: Json
          conversation_id: string | null
          created_at: string | null
          execution_id: string | null
          expires_at: string
          id: string
          next_node_id: string
          replied_at: string | null
          seller_id: string
          status: string | null
          timeout_node_id: string | null
          workflow_id: string
        }
        Insert: {
          ai_config?: Json | null
          client_id: string
          context?: Json
          conversation_id?: string | null
          created_at?: string | null
          execution_id?: string | null
          expires_at: string
          id?: string
          next_node_id: string
          replied_at?: string | null
          seller_id: string
          status?: string | null
          timeout_node_id?: string | null
          workflow_id: string
        }
        Update: {
          ai_config?: Json | null
          client_id?: string
          context?: Json
          conversation_id?: string | null
          created_at?: string | null
          execution_id?: string | null
          expires_at?: string
          id?: string
          next_node_id?: string
          replied_at?: string | null
          seller_id?: string
          status?: string | null
          timeout_node_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_waiting_replies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waiting_replies_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waiting_replies_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waiting_replies_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_waiting_replies_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_waiting_status_changes: {
        Row: {
          client_id: string | null
          context: Json
          created_at: string
          execution_id: string | null
          expires_at: string | null
          id: string
          next_node_id: string | null
          order_id: string
          resumed_at: string | null
          resumed_with_status: string | null
          seller_id: string
          status: string
          statuses: string[]
          timeout_node_id: string | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          client_id?: string | null
          context?: Json
          created_at?: string
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          next_node_id?: string | null
          order_id: string
          resumed_at?: string | null
          resumed_with_status?: string | null
          seller_id: string
          status?: string
          statuses?: string[]
          timeout_node_id?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          client_id?: string | null
          context?: Json
          created_at?: string
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          next_node_id?: string | null
          order_id?: string
          resumed_at?: string | null
          resumed_with_status?: string | null
          seller_id?: string
          status?: string
          statuses?: string[]
          timeout_node_id?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          active: boolean
          auto_pause_reason: string | null
          auto_paused_at: string | null
          created_at: string
          created_by: string
          description: string | null
          edges: Json
          id: string
          name: string
          nodes: Json
          seller_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          edges?: Json
          id?: string
          name: string
          nodes?: Json
          seller_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      fila_pendentes_ordenada: {
        Row: {
          created_at: string | null
          pedido_id: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          pedido_id?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          pedido_id?: number | null
          status?: string | null
        }
        Relationships: []
      }
      subscription_with_affiliate: {
        Row: {
          affiliate_code: string | null
          affiliate_id: string | null
          affiliate_name: string | null
          amount: number | null
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          captura_ciclo_fim: string | null
          captura_ciclo_inicio: string | null
          ciclo_ancora: string | null
          client_limit: number | null
          created_at: string | null
          current_client_count: number | null
          current_period_end: string | null
          current_period_start: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_enterprise: boolean | null
          limite_mensal: number | null
          next_due_date: string | null
          notes: string | null
          paid_invoices_count: number | null
          payment_method: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          referral_id: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_payment_link: string | null
          total_paid: number | null
          unpaid_invoices_count: number | null
          updated_at: string | null
          user_id: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions_with_metrics: {
        Row: {
          amount: number | null
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end: boolean | null
          client_limit: number | null
          clients_last_30_days: number | null
          clients_last_7_days: number | null
          created_at: string | null
          currency: string | null
          current_client_count: number | null
          current_period_end: string | null
          current_period_start: string | null
          id: string | null
          is_enterprise: boolean | null
          metrics_calculated_at: string | null
          notes: string | null
          orders_last_30_days: number | null
          orders_last_7_days: number | null
          payment_method: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          revenue_last_30_days: number | null
          revenue_last_7_days: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_payment_link: string | null
          stripe_subscription_id: string | null
          total_clients: number | null
          total_orders: number | null
          total_revenue: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_phone_lookups_comparison: {
        Row: {
          ambos_retornaram: boolean | null
          assertiva_consulta_em: string | null
          assertiva_duracao_ms: number | null
          assertiva_fase: string | null
          assertiva_tem_dado: boolean | null
          cpf: string | null
          credilink_consulta_em: string | null
          credilink_duracao_ms: number | null
          credilink_fase: string | null
          credilink_tem_dado: boolean | null
          fase_experimento: string | null
          invalido_em: string | null
          lookup_assertiva_id: string | null
          lookup_credilink_id: string | null
          marcado_invalido: boolean | null
          marketplace: string | null
          provedor_que_falhou: string | null
          seller_id: string | null
          seller_name: string | null
          telefone_assertiva: string | null
          telefone_credilink: string | null
          telefone_que_falhou: string | null
          telefones_concordam: boolean | null
          tipo_erro: string | null
        }
        Relationships: []
      }
      vw_phone_lookups_outcome: {
        Row: {
          consulta_duracao_ms: number | null
          consulta_em: string | null
          conversation_id: string | null
          cpf_consultado: string | null
          delivered_at: string | null
          error_code: number | null
          error_message: string | null
          failed_reason: string | null
          falhou: boolean | null
          fase_experimento: string | null
          foi_entregue: boolean | null
          foi_lido: boolean | null
          lookup_id: string | null
          marketplace: string | null
          message_id_outcome: string | null
          message_status: string | null
          numero_invalido_meta: boolean | null
          order_id: string | null
          provedor: string | null
          qtd_telefones_retornados: number | null
          read_at: string | null
          seller_id: string | null
          seller_name: string | null
          telefone_principal: string | null
          tem_dado: boolean | null
          template_name: string | null
          to_phone: string | null
          usado_no_disparo: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lookups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lookups_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_existing_clients_to_pipeline: {
        Args: { _seller_id: string }
        Returns: Json
      }
      admin_count_all_orders: { Args: never; Returns: number }
      admin_deactivate_subscription: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_upsert_subscription: {
        Args: {
          _amount: number
          _billing_interval: Database["public"]["Enums"]["billing_interval"]
          _client_limit: number
          _is_enterprise?: boolean
          _notes?: string
          _payment_method?: string
          _plan_type: Database["public"]["Enums"]["subscription_plan"]
          _stripe_payment_link?: string
          _user_id: string
        }
        Returns: string
      }
      backfill_conversations_last_message_at: {
        Args: { _batch?: number }
        Returns: number
      }
      calculate_client_metrics: {
        Args: { _client_id: string; _seller_id: string }
        Returns: undefined
      }
      calculate_next_throttle_slot: {
        Args: {
          _days_of_week?: number[]
          _end_hour?: number
          _interval_seconds: number
          _respect_business_hours?: boolean
          _seller_id: string
          _start_hour?: number
          _timezone?: string
        }
        Returns: string
      }
      calculate_user_metrics: { Args: { _user_id: string }; Returns: Json }
      can_add_client: { Args: { _user_id: string }; Returns: boolean }
      can_update_client: { Args: { _client_id: string }; Returns: boolean }
      can_view_client: { Args: { _client_id: string }; Returns: boolean }
      cancel_order_safe: {
        Args: { _external_id: string; _seller_id: string }
        Returns: Json
      }
      check_api_rate_limit: {
        Args: { p_limit_per_minute?: number; p_token_id: string }
        Returns: boolean
      }
      check_dirty_list_pause: { Args: { _instance_id: string }; Returns: Json }
      check_webhook_rate_limit: {
        Args: {
          max_requests?: number
          webhook_identifier: string
          window_seconds?: number
        }
        Returns: boolean
      }
      clean_old_webhook_logs: { Args: never; Returns: undefined }
      cleanup_dispatch_audit_logs: { Args: never; Returns: undefined }
      complete_queue_job: {
        Args: {
          _error_message?: string
          _execution_log?: Json
          _job_id: string
          _success: boolean
        }
        Returns: undefined
      }
      count_deduplicated_orders: {
        Args: { _period_start?: string; _seller_ids: string[] }
        Returns: number
      }
      create_affiliate_referral: {
        Args: { _affiliate_code: string; _referred_user_id: string }
        Returns: Json
      }
      csv_escape_text: { Args: { value: string }; Returns: string }
      decrypt_api_key: { Args: { encrypted_key: string }; Returns: string }
      delete_user_completely: { Args: { _email: string }; Returns: Json }
      distribute_advance_cursor: {
        Args: {
          _node_id: string
          _seller_id: string
          _stage_count: number
          _workflow_id: string
        }
        Returns: number
      }
      distribute_record_choice: {
        Args: {
          _node_id: string
          _seller_id: string
          _stage_id: string
          _workflow_id: string
        }
        Returns: undefined
      }
      encrypt_api_key: { Args: { plain_key: string }; Returns: string }
      enqueue_workflow: {
        Args: {
          _client_id?: string
          _context?: Json
          _order_id?: string
          _priority?: number
          _scheduled_for?: string
          _seller_id: string
          _workflow_id: string
        }
        Returns: string
      }
      export_orders_csv_base: {
        Args: {
          p_end_date?: string
          p_has_client?: string
          p_marketplaces?: string[]
          p_max_amount?: number
          p_min_amount?: number
          p_seller_id: string
          p_start_date?: string
          p_whatsapp_contacted?: string
        }
        Returns: string
      }
      generate_affiliate_code: { Args: never; Returns: string }
      generate_affiliate_code_from_name: {
        Args: { full_name_input: string }
        Returns: string
      }
      get_admin_orders_count: { Args: never; Returns: number }
      get_clients_with_deduped_metrics:
        | {
            Args: {
              _client_id?: string
              _limit?: number
              _min_orders?: number
              _offset?: number
              _order_by?: string
              _period_start: string
              _seller_id: string
              _state_code?: string
            }
            Returns: {
              client_id: string
              document: string
              email: string
              first_order_at: string
              full_name: string
              last_order_at: string
              state_code: string
              total_count: number
              total_orders: number
              total_spent: number
              whatsapp: string
            }[]
          }
        | {
            Args: {
              _client_id?: string
              _limit?: number
              _min_orders?: number
              _offset?: number
              _order_by?: string
              _period_start: string
              _search?: string
              _seller_id: string
              _state_code?: string
            }
            Returns: {
              client_id: string
              document: string
              email: string
              first_order_at: string
              full_name: string
              last_order_at: string
              state_code: string
              total_count: number
              total_orders: number
              total_spent: number
              whatsapp: string
            }[]
          }
      get_conversion_case_sellers: {
        Args: never
        Returns: {
          company_name: string
          id: string
          name: string
        }[]
      }
      get_conversion_retroactive_stats: {
        Args: never
        Returns: {
          evaluated_retroactive: number
          pending_retroactive: number
          skipped_without_prior_order: number
          total_retroactive: number
        }[]
      }
      get_dashboard_age_distribution: {
        Args: { _end_date: string; _seller_ids: string[]; _start_date: string }
        Returns: {
          age_range: string
          client_count: number
        }[]
      }
      get_dashboard_gender_distribution: {
        Args: { _end_date: string; _seller_ids: string[]; _start_date: string }
        Returns: {
          client_count: number
          gender: string
        }[]
      }
      get_dashboard_orders_by_state: {
        Args: { _end_date: string; _seller_ids: string[]; _start_date: string }
        Returns: {
          order_count: number
          state_code: string
          total_revenue: number
        }[]
      }
      get_dashboard_recent_orders: {
        Args: {
          _end_date: string
          _limit?: number
          _seller_ids: string[]
          _start_date: string
        }
        Returns: {
          acquired_at: string
          client_id: string
          clients: Json
          external_order_id: string
          id: string
          is_second_sale: boolean
          marketplace: Database["public"]["Enums"]["marketplace_platform"]
          order_status: string
          product: string
          seller_id: string
          shipment_status: string
          total_amount: number
        }[]
      }
      get_dispatches_by_period: {
        Args: { _days?: number }
        Returns: {
          class_negativo: number
          class_neutro: number
          class_numero_errado: number
          class_outros: number
          class_positivo: number
          count: number
          ecosystem_fail_count: number
          failed_count: number
          replied_with_class: number
          reply_count: number
          seller_id: string
          total_sent: number
          undeliverable_fail_count: number
        }[]
      }
      get_marketplace_by_alias: {
        Args: { alias_text: string }
        Returns: string
      }
      get_marketplace_stats_by_seller: {
        Args: { _period_start?: string; _seller_id: string }
        Returns: {
          marketplace: string
          order_count: number
          total_revenue: number
        }[]
      }
      get_monitor_data: {
        Args: never
        Returns: {
          active_workflows: number
          approved_templates: number
          has_blocked_number: boolean
          user_id: string
        }[]
      }
      get_next_queue_job: {
        Args: never
        Returns: {
          client_id: string
          context: Json
          id: string
          order_id: string
          retry_count: number
          seller_id: string
          workflow_id: string
        }[]
      }
      get_next_queue_jobs_balanced: {
        Args: { _limit?: number }
        Returns: {
          client_id: string
          context: Json
          id: string
          order_id: string
          retry_count: number
          seller_id: string
          workflow_id: string
        }[]
      }
      get_omnichannel_marketplaces: {
        Args: { p_seller_id: string }
        Returns: {
          marketplace: string
        }[]
      }
      get_orders_by_state: {
        Args: { _user_id: string }
        Returns: {
          order_count: number
          state_code: string
          total_revenue: number
        }[]
      }
      get_pending_conversion_candidates: {
        Args: { _limit?: number }
        Returns: {
          client_id: string
          conversation_id: string
          inbound_count: number
          seller_id: string
        }[]
      }
      get_recent_dispatches_by_seller: {
        Args: { _hours?: number }
        Returns: {
          count: number
          seller_id: string
        }[]
      }
      get_redacted_clients: {
        Args: never
        Returns: {
          city: string
          country_code: string
          created_at: string
          document: string
          email: string
          external_integration_id: string
          full_name: string
          id: string
          state_code: string
          street: string
          updated_at: string
          whatsapp: string
          zip_code: string
        }[]
      }
      get_seller_marketplaces: {
        Args: { p_seller_id: string }
        Returns: {
          marketplace: string
        }[]
      }
      get_seller_metrics_by_period: {
        Args: {
          p_end_date: string
          p_seller_ids: string[]
          p_start_date: string
        }
        Returns: {
          total_orders: number
          total_revenue: number
          unique_clients: number
        }[]
      }
      get_template_metrics_for_sellers: {
        Args: { _days?: number; _seller_ids: string[] }
        Returns: {
          avg_response_time_minutes: number
          classifications: Json
          node_id: string
          reply_rate: number
          seller_id: string
          template_name: string
          total_delivered: number
          total_failed: number
          total_replied: number
          total_sent: number
        }[]
      }
      get_throttle_queue_for_seller: {
        Args: { _filter?: string; _limit?: number; _seller_id: string }
        Returns: {
          client_id: string
          client_name: string
          client_whatsapp: string
          completed_at: string
          error_message: string
          external_order_id: string
          job_created_at: string
          job_id: string
          order_id: string
          reserved: boolean
          retry_count: number
          scheduled_for: string
          status: string
          workflow_id: string
          workflow_name: string
        }[]
      }
      get_throttle_queue_summary: {
        Args: { _seller_id: string }
        Returns: {
          completed_today_count: number
          eta_seconds: number
          failed_24h_count: number
          has_throttle_workflow: boolean
          last_scheduled: string
          next_scheduled: string
          pending_count: number
        }[]
      }
      get_webhook_sparkline_data: {
        Args: { end_date: string; start_date: string }
        Returns: {
          count: number
          day: string
          seller_id: string
        }[]
      }
      get_whatsapp_config: { Args: { _seller_id: string }; Returns: string }
      has_seller_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _seller_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_seller_role_simple: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _seller_id: string
          _user_id: string
        }
        Returns: boolean
      }
      increment_api_key_usage: {
        Args: { p_key_type: string; p_seller_id: string }
        Returns: undefined
      }
      increment_conversation_unread: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      increment_daily_send_count: {
        Args: { _instance_id: string }
        Returns: Json
      }
      infer_gender_from_name: { Args: { p_name: string }; Returns: string }
      reordenar_pipeline_stages: {
        Args: { _seller_id: string; _stage_ids: string[] }
        Returns: undefined
      }
      definir_fase_de_entrada: {
        Args: { _seller_id: string; _stage_id: string }
        Returns: undefined
      }
      garantir_fase_de_entrada: {
        Args: { _seller_id: string }
        Returns: string
      }
      initialize_default_pipeline_stages: {
        Args: { _seller_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_seller_member: {
        Args: { _seller_id: string; _user_id: string }
        Returns: boolean
      }
      is_seller_owner: {
        Args: { _seller_id: string; _user_id: string }
        Returns: boolean
      }
      is_service_role_call: { Args: never; Returns: boolean }
      link_subscription_to_referral: {
        Args: { _referred_user_id: string; _subscription_id: string }
        Returns: Json
      }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type: string
          p_status?: string
        }
        Returns: undefined
      }
      log_sensitive_data_access: {
        Args: {
          p_access_type?: string
          p_fields_accessed: string[]
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
      }
      member_can_for: {
        Args: {
          _area: string
          _required?: string
          _seller_id: string
          _user_id: string
        }
        Returns: boolean
      }
      normalize_brazilian_phone: { Args: { phone: string }; Returns: string }
      normalize_phone_number: { Args: { phone: string }; Returns: string }
      populate_historical_client_metrics: { Args: never; Returns: undefined }
      process_shipment_event: {
        Args: {
          _canonical_status: string
          _event_at: string
          _event_key: string
          _is_exception: boolean
          _order_id: string
          _raw_carrier: string
          _raw_description: string
          _raw_idstatus: number
          _seller_id: string
        }
        Returns: {
          current_idstatus: number
          current_status: string
          delivered_at: string
          is_exception: boolean
          order_id: string
        }[]
      }
      quality_recovery_daily_cap: {
        Args: { _started_at: string; _tier_limit: number }
        Returns: number
      }
      release_cron_lock: { Args: { _key: string }; Returns: undefined }
      reset_seller_data: { Args: { p_seller_ids: string[] }; Returns: Json }
      reset_seller_data_batch: {
        Args: { p_batch_size?: number; p_seller_ids: string[] }
        Returns: Json
      }
      roll_manual_subscription_periods: {
        Args: never
        Returns: {
          cycles_advanced: number
          new_period_end: string
          new_period_start: string
          subscription_id: string
          user_id: string
        }[]
      }
      search_kanban_clients: {
        Args: { _limit?: number; _search: string; _seller_id: string }
        Returns: {
          client_id: string
        }[]
      }
      seed_default_roles_for_seller: {
        Args: { _seller_id: string }
        Returns: undefined
      }
      set_default_whatsapp_cloud_instance: {
        Args: { _instance_id: string }
        Returns: undefined
      }
      set_yellow_pause: {
        Args: { _hours?: number; _instance_id: string }
        Returns: string
      }
      setup_demo_user: { Args: { _user_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      try_acquire_cron_lock: {
        Args: { _acquired_by?: string; _key: string; _ttl_seconds?: number }
        Returns: boolean
      }
      upsert_client_and_link: {
        Args: {
          _age?: number
          _birthdate?: string
          _city?: string
          _country_code?: string
          _document: string
          _document_type?: string
          _email?: string
          _full_name?: string
          _gender?: string
          _seller_id: string
          _state_code?: string
          _street?: string
          _whatsapp?: string
          _zip_code?: string
        }
        Returns: string
      }
      upsert_whatsapp_config: {
        Args: { _message_template: string; _seller_id: string }
        Returns: undefined
      }
      validate_webhook_signature: {
        Args: { payload: string; secret: string; signature: string }
        Returns: boolean
      }
      warmup_daily_limit: { Args: { _started_at: string }; Returns: number }
      warmup_daily_limit_custom: {
        Args: { _curve: Json; _started_at: string }
        Returns: number
      }
      warmup_effective_start: {
        Args: { _instance_id: string }
        Returns: string
      }
      workflow_test_run_log_event: {
        Args: { _event: Json; _run_id: string }
        Returns: undefined
      }
    }
    Enums: {
      affiliate_status: "pending" | "active" | "suspended" | "inactive"
      app_role: "owner" | "admin" | "manager" | "member" | "viewer"
      billing_interval: "monthly" | "yearly" | "quarterly" | "semiannual"
      cashback_status:
        | "pending"
        | "queued"
        | "sent"
        | "failed"
        | "redeemed"
        | "cancelled"
      commission_status: "pending" | "approved" | "paid" | "canceled"
      crm_provider: "bling" | "tiny"
      discount_type: "percentage" | "fixed_amount"
      integration_status: "pending" | "active" | "error" | "disconnected"
      marketplace_platform:
        | "mercado_livre"
        | "shopee"
        | "shopify"
        | "woocommerce"
        | "lojaintegrada"
        | "magalu"
        | "amazon_br"
        | "other"
        | "segundavenda"
        | "shein"
        | "americanas"
        | "aliexpress"
        | "netshoes"
        | "retroativo"
        | "tiktok"
        | "kwai"
        | "kabum"
        | "casas_bahia"
        | "bradesco"
        | "droga_raia"
        | "ml_full"
        | "shopee_xpress"
        | "carrefour"
        | "casa_video"
        | "mosaico"
        | "mais_correios"
        | "inter_shop"
        | "ifood"
        | "noventa_nove"
        | "temu"
        | "leroy_merlin"
        | "madeira_madeira"
        | "nuvemshop"
        | "tray"
        | "webcontinental"
        | "amazon_full"
        | "shopee_full"
      message_direction: "outbound" | "inbound"
      message_status: "queued" | "sent" | "delivered" | "read" | "failed"
      order_status:
        | "created"
        | "paid"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      plan_type: "starter" | "pro" | "enterprise"
      referral_status: "pending" | "active" | "canceled" | "churned"
      subscription_plan: "starter" | "pro" | "enterprise" | "nano"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "incomplete"
        | "trialing"
      whatsapp_provider: "twilio" | "gupshup" | "360dialog" | "zapi" | "other"
      withdrawal_status: "pending" | "approved" | "rejected" | "paid"
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
      affiliate_status: ["pending", "active", "suspended", "inactive"],
      app_role: ["owner", "admin", "manager", "member", "viewer"],
      billing_interval: ["monthly", "yearly", "quarterly", "semiannual"],
      cashback_status: [
        "pending",
        "queued",
        "sent",
        "failed",
        "redeemed",
        "cancelled",
      ],
      commission_status: ["pending", "approved", "paid", "canceled"],
      crm_provider: ["bling", "tiny"],
      discount_type: ["percentage", "fixed_amount"],
      integration_status: ["pending", "active", "error", "disconnected"],
      marketplace_platform: [
        "mercado_livre",
        "shopee",
        "shopify",
        "woocommerce",
        "lojaintegrada",
        "magalu",
        "amazon_br",
        "other",
        "segundavenda",
        "shein",
        "americanas",
        "aliexpress",
        "netshoes",
        "retroativo",
        "tiktok",
        "kwai",
        "kabum",
        "casas_bahia",
        "bradesco",
        "droga_raia",
        "ml_full",
        "shopee_xpress",
        "carrefour",
        "casa_video",
        "mosaico",
        "mais_correios",
        "inter_shop",
        "ifood",
        "noventa_nove",
        "temu",
        "leroy_merlin",
        "madeira_madeira",
        "nuvemshop",
        "tray",
        "webcontinental",
        "amazon_full",
        "shopee_full",
      ],
      message_direction: ["outbound", "inbound"],
      message_status: ["queued", "sent", "delivered", "read", "failed"],
      order_status: [
        "created",
        "paid",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      plan_type: ["starter", "pro", "enterprise"],
      referral_status: ["pending", "active", "canceled", "churned"],
      subscription_plan: ["starter", "pro", "enterprise", "nano"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "incomplete",
        "trialing",
      ],
      whatsapp_provider: ["twilio", "gupshup", "360dialog", "zapi", "other"],
      withdrawal_status: ["pending", "approved", "rejected", "paid"],
    },
  },
} as const
