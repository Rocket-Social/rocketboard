export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          card_id: string | null
          created_at: string
          event_action: string
          event_type: string
          id: string
          metadata: Json
          project_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          card_id?: string | null
          created_at?: string
          event_action: string
          event_type: string
          id?: string
          metadata?: Json
          project_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          card_id?: string | null
          created_at?: string
          event_action?: string
          event_type?: string
          id?: string
          metadata?: Json
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_api_keys: {
        Row: {
          created_at: string
          credential_kind: string
          encrypted_key: string
          encrypted_refresh_token: string | null
          expires_at: string | null
          id: string
          last_four: string | null
          organization_id: string | null
          provider: string
          set_by: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credential_kind?: string
          encrypted_key: string
          encrypted_refresh_token?: string | null
          expires_at?: string | null
          id?: string
          last_four?: string | null
          organization_id?: string | null
          provider: string
          set_by: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credential_kind?: string
          encrypted_key?: string
          encrypted_refresh_token?: string | null
          expires_at?: string | null
          id?: string
          last_four?: string | null
          organization_id?: string | null
          provider?: string
          set_by?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          persona_id: string
          surface: string
          surface_resource_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          persona_id: string
          surface: string
          surface_resource_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          persona_id?: string
          surface?: string
          surface_resource_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "ai_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          tool_calls: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_personas: {
        Row: {
          accent_color: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          fallback_credential_kind: string | null
          fallback_model: string | null
          fallback_provider: string | null
          focus_area: string | null
          id: string
          is_default: boolean
          is_enabled: boolean
          model: string
          name: string
          organization_id: string
          primary_credential_kind: string
          provider: string
          slug: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          fallback_credential_kind?: string | null
          fallback_model?: string | null
          fallback_provider?: string | null
          focus_area?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          model?: string
          name: string
          organization_id: string
          primary_credential_kind?: string
          provider?: string
          slug: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          fallback_credential_kind?: string | null
          fallback_model?: string | null
          fallback_provider?: string | null
          focus_area?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          model?: string
          name?: string
          organization_id?: string
          primary_credential_kind?: string
          provider?: string
          slug?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_personas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_oauth_states: {
        Row: {
          code_verifier: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          provider: string
          return_path: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          provider: string
          return_path: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          return_path?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      app_feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          card_id: string | null
          content_type: string | null
          created_at: string
          document_id: string | null
          file_name: string
          id: string
          project_id: string
          size_bytes: number
          storage_path: string
          uploaded_by_user_id: string
        }
        Insert: {
          card_id?: string | null
          content_type?: string | null
          created_at?: string
          document_id?: string | null
          file_name: string
          id?: string
          project_id: string
          size_bytes?: number
          storage_path: string
          uploaded_by_user_id: string
        }
        Update: {
          card_id?: string | null
          content_type?: string | null
          created_at?: string
          document_id?: string | null
          file_name?: string
          id?: string
          project_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      award_invites: {
        Row: {
          accept_token: string
          accepted_at: string | null
          accepted_by_user_id: string | null
          award_type: string
          created_at: string
          created_by_user_id: string
          credit_months: number | null
          custom_message: string | null
          expires_at: string
          id: string
          plan: string
          reason: string
          recipient_email: string
          status: string
          target_org_id: string | null
          updated_at: string
        }
        Insert: {
          accept_token?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          award_type: string
          created_at?: string
          created_by_user_id: string
          credit_months?: number | null
          custom_message?: string | null
          expires_at?: string
          id?: string
          plan?: string
          reason: string
          recipient_email: string
          status?: string
          target_org_id?: string | null
          updated_at?: string
        }
        Update: {
          accept_token?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          award_type?: string
          created_at?: string
          created_by_user_id?: string
          credit_months?: number | null
          custom_message?: string | null
          expires_at?: string
          id?: string
          plan?: string
          reason?: string
          recipient_email?: string
          status?: string
          target_org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_invites_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          event_created_at: string
          event_payload: Json
          event_type: string
          organization_id: string | null
          processed_at: string
          processing_result: string
          stripe_customer_id: string | null
          stripe_event_id: string
        }
        Insert: {
          event_created_at: string
          event_payload?: Json
          event_type: string
          organization_id?: string | null
          processed_at?: string
          processing_result: string
          stripe_customer_id?: string | null
          stripe_event_id: string
        }
        Update: {
          event_created_at?: string
          event_payload?: Json
          event_type?: string
          organization_id?: string | null
          processed_at?: string
          processing_result?: string
          stripe_customer_id?: string | null
          stripe_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_elements: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          element_type: string
          height: number
          id: string
          is_resolved: boolean
          path_data: string | null
          project_view_id: string
          style: Json
          updated_at: string
          url: string | null
          width: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          element_type: string
          height?: number
          id?: string
          is_resolved?: boolean
          path_data?: string | null
          project_view_id: string
          style?: Json
          updated_at?: string
          url?: string | null
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          element_type?: string
          height?: number
          id?: string
          is_resolved?: boolean
          path_data?: string | null
          project_view_id?: string
          style?: Json
          updated_at?: string
          url?: string | null
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_elements_project_view_id_fkey"
            columns: ["project_view_id"]
            isOneToOne: false
            referencedRelation: "project_views"
            referencedColumns: ["id"]
          },
        ]
      }
      card_comments: {
        Row: {
          body_text: string
          card_id: string
          created_at: string
          created_by_user_id: string
          id: string
          metadata: Json
        }
        Insert: {
          body_text: string
          card_id: string
          created_at?: string
          created_by_user_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          body_text?: string
          card_id?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "card_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_github_links: {
        Row: {
          card_id: string
          created_at: string
          id: string
          link_type: string
          pull_request_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          link_type?: string
          pull_request_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          link_type?: string
          pull_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_github_links_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_github_links_pull_request_id_fkey"
            columns: ["pull_request_id"]
            isOneToOne: false
            referencedRelation: "github_pull_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          archived_at: string | null
          archived_by_user_id: string | null
          assignee_user_id: string | null
          body_json: Json
          body_md: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          custom_data: Json
          deleted_at: string | null
          deleted_by_user_id: string | null
          due_at: string | null
          effort: number | null
          group_id: string | null
          group_position: number
          id: string
          initiative_id: string | null
          position: number
          priority_option_id: string | null
          project_card_number: number
          project_id: string
          sprint_id: string | null
          start_at: string | null
          status_option_id: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          assignee_user_id?: string | null
          body_json?: Json
          body_md?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          custom_data?: Json
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          due_at?: string | null
          effort?: number | null
          group_id?: string | null
          group_position?: number
          id?: string
          initiative_id?: string | null
          position?: number
          priority_option_id?: string | null
          project_card_number: number
          project_id: string
          sprint_id?: string | null
          start_at?: string | null
          status_option_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          assignee_user_id?: string | null
          body_json?: Json
          body_md?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          custom_data?: Json
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          due_at?: string | null
          effort?: number | null
          group_id?: string | null
          group_position?: number
          id?: string
          initiative_id?: string | null
          position?: number
          priority_option_id?: string | null
          project_card_number?: number
          project_id?: string
          sprint_id?: string | null
          start_at?: string | null
          status_option_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "project_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_initiative_fk"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "workspace_initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_priority_option_id_fkey"
            columns: ["priority_option_id"]
            isOneToOne: false
            referencedRelation: "project_priority_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "project_sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_status_option_id_fkey"
            columns: ["status_option_id"]
            isOneToOne: false
            referencedRelation: "project_status_options"
            referencedColumns: ["id"]
          },
        ]
      }
      document_comments: {
        Row: {
          body_text: string
          created_at: string
          created_by_user_id: string
          document_id: string
          id: string
          parent_comment_id: string | null
          reactions: Json
        }
        Insert: {
          body_text: string
          created_at?: string
          created_by_user_id: string
          document_id: string
          id?: string
          parent_comment_id?: string | null
          reactions?: Json
        }
        Update: {
          body_text?: string
          created_at?: string
          created_by_user_id?: string
          document_id?: string
          id?: string
          parent_comment_id?: string | null
          reactions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "document_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_presence: {
        Row: {
          document_id: string
          last_seen_at: string
          state: string
          user_id: string
        }
        Insert: {
          document_id: string
          last_seen_at?: string
          state?: string
          user_id: string
        }
        Update: {
          document_id?: string
          last_seen_at?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_presence_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          content_json: Json
          content_md: string
          created_at: string
          created_by_user_id: string
          document_id: string
          id: string
          title: string
          version: number
        }
        Insert: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id: string
          document_id: string
          id?: string
          title: string
          version: number
        }
        Update: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id?: string
          document_id?: string
          id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_json: Json
          content_md: string
          created_at: string
          created_by_user_id: string
          id: string
          project_id: string
          project_view_id: string
          title: string
          updated_at: string
          updated_by_user_id: string | null
          version: number
        }
        Insert: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id: string
          id?: string
          project_id: string
          project_view_id: string
          title: string
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
        }
        Update: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          project_id?: string
          project_view_id?: string
          title?: string
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_view_id_fkey"
            columns: ["project_view_id"]
            isOneToOne: true
            referencedRelation: "project_views"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by_user_id: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          key: string
          name: string
          position: number
          project_id: string
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by_user_id: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          key: string
          name: string
          position: number
          project_id: string
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by_user_id?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          key?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_definitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      field_options: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string
          field_definition_id: string
          id: string
          label: string
          position: number
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id: string
          field_definition_id: string
          id?: string
          label: string
          position: number
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string
          field_definition_id?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_options_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      github_commit_daily_rollups: {
        Row: {
          activity_date: string
          commit_count: number
          computed_timezone: string
          created_at: string
          id: string
          repo_id: string
          updated_at: string
        }
        Insert: {
          activity_date: string
          commit_count?: number
          computed_timezone?: string
          created_at?: string
          id?: string
          repo_id: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          commit_count?: number
          computed_timezone?: string
          created_at?: string
          id?: string
          repo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_commit_daily_rollups_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "github_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connection_allowed_repositories: {
        Row: {
          connection_source_id: string
          created_at: string
          default_branch: string
          full_name: string
          github_repo_id: number
          id: string
          is_private: boolean
          name: string
          updated_at: string
        }
        Insert: {
          connection_source_id: string
          created_at?: string
          default_branch?: string
          full_name: string
          github_repo_id: number
          id?: string
          is_private?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          connection_source_id?: string
          created_at?: string
          default_branch?: string
          full_name?: string
          github_repo_id?: number
          id?: string
          is_private?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_connection_allowed_repositorie_connection_source_id_fkey"
            columns: ["connection_source_id"]
            isOneToOne: false
            referencedRelation: "github_connection_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connection_install_states: {
        Row: {
          created_at: string
          expires_at: string
          organization_id: string
          requested_by: string
          return_path: string | null
          state: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          organization_id: string
          requested_by: string
          return_path?: string | null
          state: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          organization_id?: string
          requested_by?: string
          return_path?: string | null
          state?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "github_connection_install_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connection_sources: {
        Row: {
          account_avatar_url: string | null
          account_login: string
          account_type: string
          auth_type: string
          created_at: string
          events: Json
          id: string
          installation_id: number
          installed_by: string | null
          last_validated_at: string | null
          organization_id: string | null
          owner_user_id: string | null
          permissions: Json
          scope_type: string
          status: string
          updated_at: string
        }
        Insert: {
          account_avatar_url?: string | null
          account_login: string
          account_type: string
          auth_type: string
          created_at?: string
          events?: Json
          id?: string
          installation_id?: number
          installed_by?: string | null
          last_validated_at?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          permissions?: Json
          scope_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_avatar_url?: string | null
          account_login?: string
          account_type?: string
          auth_type?: string
          created_at?: string
          events?: Json
          id?: string
          installation_id?: number
          installed_by?: string | null
          last_validated_at?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          permissions?: Json
          scope_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_connection_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      github_events: {
        Row: {
          actor_avatar_url: string | null
          actor_login: string | null
          created_at: string
          event_type: string
          github_created_at: string
          id: string
          payload: Json
          pull_request_id: string | null
          repo_id: string
        }
        Insert: {
          actor_avatar_url?: string | null
          actor_login?: string | null
          created_at?: string
          event_type: string
          github_created_at: string
          id?: string
          payload?: Json
          pull_request_id?: string | null
          repo_id: string
        }
        Update: {
          actor_avatar_url?: string | null
          actor_login?: string | null
          created_at?: string
          event_type?: string
          github_created_at?: string
          id?: string
          payload?: Json
          pull_request_id?: string | null
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_events_pull_request_id_fkey"
            columns: ["pull_request_id"]
            isOneToOne: false
            referencedRelation: "github_pull_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_events_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "github_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installations: {
        Row: {
          account_avatar_url: string | null
          account_login: string
          account_type: string
          created_at: string
          events: Json
          id: string
          installation_id: number
          installed_by: string | null
          permissions: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_avatar_url?: string | null
          account_login: string
          account_type: string
          created_at?: string
          events?: Json
          id?: string
          installation_id: number
          installed_by?: string | null
          permissions?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_avatar_url?: string | null
          account_login?: string
          account_type?: string
          created_at?: string
          events?: Json
          id?: string
          installation_id?: number
          installed_by?: string | null
          permissions?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_installations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      github_pull_requests: {
        Row: {
          additions: number
          approval_count: number
          author_avatar_url: string | null
          author_login: string | null
          base_ref: string | null
          body: string | null
          changes_requested_count: number
          checks_status: string | null
          closed_at: string | null
          created_at: string
          deletions: number
          draft: boolean
          first_review_submitted_at: string | null
          github_pr_id: number
          head_ref: string | null
          html_url: string
          id: string
          last_review_submitted_at: string | null
          merged_at: string | null
          number: number
          repo_id: string
          review_count: number
          review_state: string | null
          reviewers: Json
          state: string
          synced_at: string
          title: string
          updated_at: string
        }
        Insert: {
          additions?: number
          approval_count?: number
          author_avatar_url?: string | null
          author_login?: string | null
          base_ref?: string | null
          body?: string | null
          changes_requested_count?: number
          checks_status?: string | null
          closed_at?: string | null
          created_at: string
          deletions?: number
          draft?: boolean
          first_review_submitted_at?: string | null
          github_pr_id: number
          head_ref?: string | null
          html_url: string
          id?: string
          last_review_submitted_at?: string | null
          merged_at?: string | null
          number: number
          repo_id: string
          review_count?: number
          review_state?: string | null
          reviewers?: Json
          state?: string
          synced_at?: string
          title: string
          updated_at: string
        }
        Update: {
          additions?: number
          approval_count?: number
          author_avatar_url?: string | null
          author_login?: string | null
          base_ref?: string | null
          body?: string | null
          changes_requested_count?: number
          checks_status?: string | null
          closed_at?: string | null
          created_at?: string
          deletions?: number
          draft?: boolean
          first_review_submitted_at?: string | null
          github_pr_id?: number
          head_ref?: string | null
          html_url?: string
          id?: string
          last_review_submitted_at?: string | null
          merged_at?: string | null
          number?: number
          repo_id?: string
          review_count?: number
          review_state?: string | null
          reviewers?: Json
          state?: string
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_pull_requests_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "github_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      github_repositories: {
        Row: {
          color_index: number
          connection_source_id: string
          created_at: string
          default_branch: string
          full_name: string
          github_repo_id: number
          history_backfilled_at: string | null
          id: string
          installation_id: string | null
          is_private: boolean
          last_synced_at: string | null
          name: string
          project_id: string
        }
        Insert: {
          color_index?: number
          connection_source_id: string
          created_at?: string
          default_branch?: string
          full_name: string
          github_repo_id: number
          history_backfilled_at?: string | null
          id?: string
          installation_id?: string | null
          is_private?: boolean
          last_synced_at?: string | null
          name: string
          project_id: string
        }
        Update: {
          color_index?: number
          connection_source_id?: string
          created_at?: string
          default_branch?: string
          full_name?: string
          github_repo_id?: number
          history_backfilled_at?: string | null
          id?: string
          installation_id?: string | null
          is_private?: boolean
          last_synced_at?: string | null
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_repositories_connection_source_id_fkey"
            columns: ["connection_source_id"]
            isOneToOne: false
            referencedRelation: "github_connection_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_repositories_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "github_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_repositories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      initiative_updates: {
        Row: {
          body_text: string
          created_at: string
          created_by_user_id: string
          health_snapshot:
            | Database["public"]["Enums"]["initiative_health"]
            | null
          id: string
          initiative_id: string
        }
        Insert: {
          body_text: string
          created_at?: string
          created_by_user_id: string
          health_snapshot?:
            | Database["public"]["Enums"]["initiative_health"]
            | null
          id?: string
          initiative_id: string
        }
        Update: {
          body_text?: string
          created_at?: string
          created_by_user_id?: string
          health_snapshot?:
            | Database["public"]["Enums"]["initiative_health"]
            | null
          id?: string
          initiative_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "initiative_updates_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "workspace_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accept_token: string
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          email: string
          email_sent_at: string | null
          expires_at: string | null
          id: string
          message: string | null
          resource_id: string
          resource_type: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          accept_token?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          email: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string | null
          resource_id: string
          resource_type: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          accept_token?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          email?: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string | null
          resource_id?: string
          resource_type?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      note_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      note_import_connections: {
        Row: {
          auth_method: string
          backfill_cursor: string | null
          created_at: string
          encrypted_access_token: string | null
          id: string
          initial_import_completed_at: string | null
          last_source_updated_at: string | null
          last_sync_error: string | null
          last_sync_finished_at: string | null
          last_sync_started_at: string | null
          mode: string
          provider: string
          root_folder_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_method?: string
          backfill_cursor?: string | null
          created_at?: string
          encrypted_access_token?: string | null
          id?: string
          initial_import_completed_at?: string | null
          last_source_updated_at?: string | null
          last_sync_error?: string | null
          last_sync_finished_at?: string | null
          last_sync_started_at?: string | null
          mode?: string
          provider: string
          root_folder_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_method?: string
          backfill_cursor?: string | null
          created_at?: string
          encrypted_access_token?: string | null
          id?: string
          initial_import_completed_at?: string | null
          last_source_updated_at?: string | null
          last_sync_error?: string | null
          last_sync_finished_at?: string | null
          last_sync_started_at?: string | null
          mode?: string
          provider?: string
          root_folder_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_import_connections_root_folder_id_fkey"
            columns: ["root_folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content_json: Json
          content_md: string
          created_at: string
          deleted_at: string | null
          folder_id: string | null
          id: string
          position: number
          preview_text: string
          source_connection_id: string | null
          source_created_at: string | null
          source_detached: boolean
          source_id: string | null
          source_metadata: Json
          source_provider: string | null
          source_updated_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_json?: Json
          content_md?: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          id?: string
          position?: number
          preview_text?: string
          source_connection_id?: string | null
          source_created_at?: string | null
          source_detached?: boolean
          source_id?: string | null
          source_metadata?: Json
          source_provider?: string | null
          source_updated_at?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_json?: Json
          content_md?: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          id?: string
          position?: number
          preview_text?: string
          source_connection_id?: string | null
          source_created_at?: string | null
          source_detached?: boolean
          source_id?: string | null
          source_metadata?: Json
          source_provider?: string | null
          source_updated_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_source_connection_id_fkey"
            columns: ["source_connection_id"]
            isOneToOne: false
            referencedRelation: "note_import_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          seat_status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          seat_status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          seat_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          admin_grant_ends_at: string | null
          admin_grant_plan: string | null
          allowed_domains: string[]
          billing_email: string | null
          billing_period: string
          created_at: string
          created_by_user_id: string
          icon: string
          id: string
          invite_link_enabled: boolean
          invite_link_token: string
          limits: Json
          name: string
          plan: string
          plan_status: string
          slug: string
          storage_used_bytes: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          admin_grant_ends_at?: string | null
          admin_grant_plan?: string | null
          allowed_domains?: string[]
          billing_email?: string | null
          billing_period?: string
          created_at?: string
          created_by_user_id: string
          icon?: string
          id?: string
          invite_link_enabled?: boolean
          invite_link_token?: string
          limits?: Json
          name: string
          plan?: string
          plan_status?: string
          slug: string
          storage_used_bytes?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          admin_grant_ends_at?: string | null
          admin_grant_plan?: string | null
          allowed_domains?: string[]
          billing_email?: string | null
          billing_period?: string
          created_at?: string
          created_by_user_id?: string
          icon?: string
          id?: string
          invite_link_enabled?: boolean
          invite_link_token?: string
          limits?: Json
          name?: string
          plan?: string
          plan_status?: string
          slug?: string
          storage_used_bytes?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_release_cards: {
        Row: {
          card_id: string
          linked_at: string
          linked_by_user_id: string
          release_id: string
        }
        Insert: {
          card_id: string
          linked_at?: string
          linked_by_user_id: string
          release_id: string
        }
        Update: {
          card_id?: string
          linked_at?: string
          linked_by_user_id?: string
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_release_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_release_cards_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "plan_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_release_checklist_items: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by_user_id: string | null
          id: string
          label: string
          position: number
          release_id: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by_user_id?: string | null
          id: string
          label: string
          position?: number
          release_id: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by_user_id?: string | null
          id?: string
          label?: string
          position?: number
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_release_checklist_items_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "plan_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_release_note_sections: {
        Row: {
          content: Json
          id: string
          label: string
          position: number
          release_id: string
        }
        Insert: {
          content?: Json
          id?: string
          label: string
          position?: number
          release_id: string
        }
        Update: {
          content?: Json
          id?: string
          label?: string
          position?: number
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_release_note_sections_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "plan_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_release_sprints: {
        Row: {
          linked_at: string
          linked_by_user_id: string
          release_id: string
          sprint_id: string
        }
        Insert: {
          linked_at?: string
          linked_by_user_id: string
          release_id: string
          sprint_id: string
        }
        Update: {
          linked_at?: string
          linked_by_user_id?: string
          release_id?: string
          sprint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_release_sprints_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "plan_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_release_sprints_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "project_sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_releases: {
        Row: {
          ab_variations: string | null
          actual_date: string | null
          archived_at: string | null
          build_number: string | null
          created_at: string
          created_by_user_id: string
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          name: string
          plan_view_id: string
          planned_date: string | null
          position: number
          release_notes: string | null
          retro_notes: string | null
          retro_url: string | null
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          ab_variations?: string | null
          actual_date?: string | null
          archived_at?: string | null
          build_number?: string | null
          created_at?: string
          created_by_user_id: string
          force_upgrade?: boolean
          health?: Database["public"]["Enums"]["release_health"]
          id?: string
          name: string
          plan_view_id: string
          planned_date?: string | null
          position?: number
          release_notes?: string | null
          retro_notes?: string | null
          retro_url?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          ab_variations?: string | null
          actual_date?: string | null
          archived_at?: string | null
          build_number?: string | null
          created_at?: string
          created_by_user_id?: string
          force_upgrade?: boolean
          health?: Database["public"]["Enums"]["release_health"]
          id?: string
          name?: string
          plan_view_id?: string
          planned_date?: string | null
          position?: number
          release_notes?: string | null
          retro_notes?: string | null
          retro_url?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_releases_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: false
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_roadmap_items: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string
          description: string | null
          end_period: string
          id: string
          initiative_id: string | null
          item_type: Database["public"]["Enums"]["roadmap_item_type"]
          label: string
          lane_id: string
          position: number
          start_period: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          end_period: string
          id?: string
          initiative_id?: string | null
          item_type?: Database["public"]["Enums"]["roadmap_item_type"]
          label: string
          lane_id: string
          position?: number
          start_period: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          end_period?: string
          id?: string
          initiative_id?: string | null
          item_type?: Database["public"]["Enums"]["roadmap_item_type"]
          label?: string
          lane_id?: string
          position?: number
          start_period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_roadmap_items_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "workspace_initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_roadmap_items_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "plan_roadmap_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_roadmap_lanes: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string
          group: string | null
          group_type: string
          id: string
          plan_view_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id: string
          group?: string | null
          group_type?: string
          id?: string
          plan_view_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string
          group?: string | null
          group_type?: string
          id?: string
          plan_view_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_roadmap_lanes_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: false
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_roadmap_matrix_cells: {
        Row: {
          content_text: string
          created_at: string
          id: string
          lane_id: string
          period_key: string
          plan_view_id: string
          updated_at: string
        }
        Insert: {
          content_text?: string
          created_at?: string
          id?: string
          lane_id: string
          period_key: string
          plan_view_id: string
          updated_at?: string
        }
        Update: {
          content_text?: string
          created_at?: string
          id?: string
          lane_id?: string
          period_key?: string
          plan_view_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_roadmap_matrix_cells_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "plan_roadmap_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_roadmap_matrix_cells_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: false
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_roadmap_milestones: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string
          id: string
          label: string
          lane_id: string | null
          milestone_date: string
          milestone_type: Database["public"]["Enums"]["roadmap_milestone_type"]
          plan_view_id: string
          position: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id: string
          id?: string
          label: string
          lane_id?: string | null
          milestone_date: string
          milestone_type?: Database["public"]["Enums"]["roadmap_milestone_type"]
          plan_view_id: string
          position?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string
          id?: string
          label?: string
          lane_id?: string | null
          milestone_date?: string
          milestone_type?: Database["public"]["Enums"]["roadmap_milestone_type"]
          plan_view_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_roadmap_milestones_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "plan_roadmap_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_roadmap_milestones_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: false
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_scorecard_items: {
        Row: {
          composite_score: number
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          linked_release_id: string | null
          linked_roadmap_item_id: string | null
          plan_view_id: string
          position: number
          scores_json: Json
          title: string
          tracked: boolean
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          composite_score?: number
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          linked_release_id?: string | null
          linked_roadmap_item_id?: string | null
          plan_view_id: string
          position?: number
          scores_json?: Json
          title: string
          tracked?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          composite_score?: number
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          linked_release_id?: string | null
          linked_roadmap_item_id?: string | null
          plan_view_id?: string
          position?: number
          scores_json?: Json
          title?: string
          tracked?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_scorecard_items_linked_release_id_fkey"
            columns: ["linked_release_id"]
            isOneToOne: false
            referencedRelation: "plan_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_scorecard_items_linked_roadmap_item_id_fkey"
            columns: ["linked_roadmap_item_id"]
            isOneToOne: false
            referencedRelation: "plan_roadmap_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_scorecard_items_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: false
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_view_release_shares: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          plan_view_id: string
          revoked_at: string | null
          share_token: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          plan_view_id: string
          revoked_at?: string | null
          share_token?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          plan_view_id?: string
          revoked_at?: string | null
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_view_release_shares_plan_view_id_fkey"
            columns: ["plan_view_id"]
            isOneToOne: true
            referencedRelation: "plan_views"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_views: {
        Row: {
          config_json: Json
          created_at: string
          id: string
          name: string
          plan_id: string
          position: number
          updated_at: string
          view_type: Database["public"]["Enums"]["plan_view_type"]
          workspace_id: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          id?: string
          name: string
          plan_id: string
          position?: number
          updated_at?: string
          view_type: Database["public"]["Enums"]["plan_view_type"]
          workspace_id: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          id?: string
          name?: string
          plan_id?: string
          position?: number
          updated_at?: string
          view_type?: Database["public"]["Enums"]["plan_view_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_views_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workspace_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          github_login: string | null
          is_internal_admin: boolean
          updated_at: string
          user_id: string
          week_starts_on: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          github_login?: string | null
          is_internal_admin?: boolean
          updated_at?: string
          user_id: string
          week_starts_on?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          github_login?: string | null
          is_internal_admin?: boolean
          updated_at?: string
          user_id?: string
          week_starts_on?: string | null
        }
        Relationships: []
      }
      project_automation_runs: {
        Row: {
          actions_executed: Json
          automation_id: string | null
          card_id: string | null
          created_at: string
          id: string
          metadata: Json
          outcome: string
          project_id: string
          reason_code: string
          trigger_type: string
        }
        Insert: {
          actions_executed?: Json
          automation_id?: string | null
          card_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          outcome: string
          project_id: string
          reason_code: string
          trigger_type: string
        }
        Update: {
          actions_executed?: Json
          automation_id?: string | null
          card_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          outcome?: string
          project_id?: string
          reason_code?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "project_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_automation_runs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_automation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_automations: {
        Row: {
          actions: Json
          condition_clauses: Json
          created_at: string
          created_by_user_id: string | null
          id: string
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          actions?: Json
          condition_clauses?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          position: number
          project_id: string
          status?: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          actions?: Json
          condition_clauses?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          position?: number
          project_id?: string
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_github_settings: {
        Row: {
          analytics_last_sprint_end_date: string | null
          analytics_sprint_length_weeks: number | null
          analytics_timezone: string | null
          auto_transitions_enabled: boolean
          configured_by: string | null
          connection_source_id: string | null
          created_at: string
          project_id: string
          updated_at: string
        }
        Insert: {
          analytics_last_sprint_end_date?: string | null
          analytics_sprint_length_weeks?: number | null
          analytics_timezone?: string | null
          auto_transitions_enabled?: boolean
          configured_by?: string | null
          connection_source_id?: string | null
          created_at?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          analytics_last_sprint_end_date?: string | null
          analytics_sprint_length_weeks?: number | null
          analytics_timezone?: string | null
          auto_transitions_enabled?: boolean
          configured_by?: string | null
          connection_source_id?: string | null
          created_at?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_github_settings_connection_source_id_fkey"
            columns: ["connection_source_id"]
            isOneToOne: false
            referencedRelation: "github_connection_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_github_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_groups: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          label: string
          position: number
          project_id: string
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          label: string
          position: number
          project_id: string
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          label?: string
          position?: number
          project_id?: string
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invites: {
        Row: {
          accept_token: string
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          email: string
          email_sent_at: string | null
          expires_at: string | null
          id: string
          message: string | null
          project_id: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          role: Database["public"]["Enums"]["scope_access_role"]
          updated_at: string
        }
        Insert: {
          accept_token: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          email: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string | null
          project_id: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: Database["public"]["Enums"]["scope_access_role"]
          updated_at?: string
        }
        Update: {
          accept_token?: string
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          email?: string
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string | null
          project_id?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: Database["public"]["Enums"]["scope_access_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["scope_access_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["scope_access_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["scope_access_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_priority_options: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_default: boolean
          key: string
          label: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          key: string
          label: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_priority_options_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sprints: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          end_date: string | null
          goal: string | null
          id: string
          name: string
          position: number
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
          updated_by_user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          position?: number
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
          updated_by_user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          position?: number
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_options: {
        Row: {
          category: string
          color: string | null
          created_at: string
          id: string
          is_default: boolean
          key: string
          label: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          key: string
          label: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_options_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_view_user_configs: {
        Row: {
          base_shared_version: number
          config: Json
          created_at: string
          id: string
          project_view_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_shared_version?: number
          config?: Json
          created_at?: string
          id?: string
          project_view_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_shared_version?: number
          config?: Json
          created_at?: string
          id?: string
          project_view_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_view_user_configs_project_view_id_fkey"
            columns: ["project_view_id"]
            isOneToOne: false
            referencedRelation: "project_views"
            referencedColumns: ["id"]
          },
        ]
      }
      project_views: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          is_default: boolean
          name: string
          position: number
          project_id: string
          shared_config: Json
          updated_at: string
          updated_by_user_id: string | null
          version: number
          view_type: Database["public"]["Enums"]["project_view_type"]
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          project_id: string
          shared_config?: Json
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
          view_type: Database["public"]["Enums"]["project_view_type"]
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          project_id?: string
          shared_config?: Json
          updated_at?: string
          updated_by_user_id?: string | null
          version?: number
          view_type?: Database["public"]["Enums"]["project_view_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          access: Database["public"]["Enums"]["resource_access"]
          archived_at: string | null
          archived_by_user_id: string | null
          builtin_field_labels: Json
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          deleted_by_user_id: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          next_card_number: number
          position: number
          project_key: string
          slug: string
          task_mode: string
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["resource_access"]
          archived_at?: string | null
          archived_by_user_id?: string | null
          builtin_field_labels?: Json
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          next_card_number?: number
          position?: number
          project_key: string
          slug: string
          task_mode?: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: string
        }
        Update: {
          access?: Database["public"]["Enums"]["resource_access"]
          archived_at?: string | null
          archived_by_user_id?: string | null
          builtin_field_labels?: Json
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          next_card_number?: number
          position?: number
          project_key?: string
          slug?: string
          task_mode?: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_page_comments: {
        Row: {
          body_text: string
          created_at: string
          created_by_user_id: string
          id: string
          page_id: string
        }
        Insert: {
          body_text: string
          created_at?: string
          created_by_user_id: string
          id?: string
          page_id: string
        }
        Update: {
          body_text?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_page_comments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_page_shares: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          page_id: string
          revoked_at: string | null
          share_token: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          page_id: string
          revoked_at?: string | null
          share_token?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          page_id?: string
          revoked_at?: string | null
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_page_shares_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_page_user_pins: {
        Row: {
          created_at: string
          page_id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          page_id: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          page_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_page_user_pins_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_page_versions: {
        Row: {
          content_json: Json
          content_md: string
          created_at: string
          created_by_user_id: string
          id: string
          page_id: string
          title: string
          version: number
        }
        Insert: {
          content_json: Json
          content_md?: string
          created_at?: string
          created_by_user_id: string
          id?: string
          page_id: string
          title: string
          version: number
        }
        Update: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          page_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wiki_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_pages: {
        Row: {
          content_json: Json
          content_md: string
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          deleted_batch_id: string | null
          icon: string | null
          id: string
          organization_id: string
          owner_user_id: string | null
          parent_page_id: string | null
          position: number
          project_id: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          updated_by_user_id: string | null
          verified_at: string | null
          verified_by_user_id: string | null
          version: number
        }
        Insert: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          deleted_batch_id?: string | null
          icon?: string | null
          id?: string
          organization_id: string
          owner_user_id?: string | null
          parent_page_id?: string | null
          position?: number
          project_id?: string | null
          slug: string
          status?: string
          title?: string
          updated_at?: string
          updated_by_user_id?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          version?: number
        }
        Update: {
          content_json?: Json
          content_md?: string
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          deleted_batch_id?: string | null
          icon?: string | null
          id?: string
          organization_id?: string
          owner_user_id?: string | null
          parent_page_id?: string | null
          position?: number
          project_id?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by_user_id?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wiki_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_initiatives: {
        Row: {
          archived_at: string | null
          archived_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          deleted_by_user_id: string | null
          description: string | null
          health: Database["public"]["Enums"]["initiative_health"]
          id: string
          lead_user_id: string | null
          name: string
          position: number
          status: Database["public"]["Enums"]["initiative_status"]
          target_date: string | null
          updated_at: string
          updated_by_user_id: string | null
          visibility: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["initiative_health"]
          id?: string
          lead_user_id?: string | null
          name: string
          position?: number
          status?: Database["public"]["Enums"]["initiative_status"]
          target_date?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
          visibility?: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["initiative_health"]
          id?: string
          lead_user_id?: string | null
          name?: string
          position?: number
          status?: Database["public"]["Enums"]["initiative_status"]
          target_date?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
          visibility?: Database["public"]["Enums"]["resource_access"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_initiatives_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["scope_access_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["scope_access_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["scope_access_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_plans: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          position: number
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_project_user_orders: {
        Row: {
          created_at: string
          position: number
          project_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          position: number
          project_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          position?: number
          project_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_project_user_orders_workspace_project_fkey"
            columns: ["workspace_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workspace_sidebar_item_orders: {
        Row: {
          created_at: string
          item_id: string
          item_type: string
          position: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          item_type: string
          position: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          item_type?: string
          position?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sidebar_item_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          access: Database["public"]["Enums"]["resource_access"]
          color_token: string | null
          created_at: string
          created_by_user_id: string
          icon: string
          id: string
          name: string
          organization_id: string
          slug: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["resource_access"]
          color_token?: string | null
          created_at?: string
          created_by_user_id: string
          icon?: string
          id?: string
          name: string
          organization_id: string
          slug: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          access?: Database["public"]["Enums"]["resource_access"]
          color_token?: string | null
          created_at?: string
          created_by_user_id?: string
          icon?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_award_invite: {
        Args: { p_target_org_id?: string; p_token: string }
        Returns: {
          error_message: string
          success: boolean
          target_org_id: string
        }[]
      }
      accept_invite: {
        Args: { target_accept_token: string }
        Returns: {
          organization_name: string
          resource_type: string
          route: Json
          workspace_count: number
        }[]
      }
      accept_project_invite: {
        Args: { target_accept_token: string }
        Returns: Json
      }
      add_card_comment: {
        Args: { target_body_text: string; target_card_id: string }
        Returns: {
          author_name: string
          body_text: string
          created_at: string
          id: string
        }[]
      }
      add_document_comment: {
        Args: {
          target_body_text: string
          target_document_id: string
          target_parent_comment_id?: string
        }
        Returns: {
          author_name: string
          author_user_id: string
          body_text: string
          created_at: string
          id: string
          parent_comment_id: string
          reactions: Json
        }[]
      }
      add_field_option: {
        Args: { target_field_definition_id: string; target_label: string }
        Returns: {
          field_definition_id: string
          id: string
          label: string
        }[]
      }
      add_project_member: {
        Args: {
          target_project_id: string
          target_role?: Database["public"]["Enums"]["scope_access_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      add_project_priority_option: {
        Args: {
          target_color?: string
          target_label: string
          target_project_id: string
        }
        Returns: {
          option_color: string
          option_id: string
          option_is_default: boolean
          option_key: string
          option_label: string
          option_sort_order: number
        }[]
      }
      add_project_status_option: {
        Args: {
          target_category: string
          target_label: string
          target_project_id: string
        }
        Returns: {
          option_category: string
          option_id: string
          option_is_default: boolean
          option_key: string
          option_label: string
          option_position: number
        }[]
      }
      add_wiki_page_comment: {
        Args: { target_body_text: string; target_page_id: string }
        Returns: {
          author_name: string
          author_user_id: string
          body_text: string
          created_at: string
          id: string
          page_id: string
        }[]
      }
      add_workspace_member: {
        Args: {
          target_role?: Database["public"]["Enums"]["scope_access_role"]
          target_user_id: string
          target_workspace_id: string
        }
        Returns: undefined
      }
      archive_cards: { Args: { target_card_ids: string[] }; Returns: undefined }
      archive_field_definition: {
        Args: { target_field_definition_id: string }
        Returns: undefined
      }
      archive_initiative: {
        Args: { target_initiative_id: string }
        Returns: undefined
      }
      archive_project: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      assert_internal_admin: { Args: never; Returns: undefined }
      auto_link_pr_to_cards: {
        Args: {
          target_body: string
          target_head_ref: string
          target_pr_id: string
          target_project_id: string
        }
        Returns: string[]
      }
      automation_add_card_comment: {
        Args: {
          target_actor_user_id: string
          target_body_text: string
          target_card_id: string
        }
        Returns: undefined
      }
      automation_build_card_snapshot: {
        Args: { target_card: Database["public"]["Tables"]["cards"]["Row"] }
        Returns: Json
      }
      automation_clear_execution_context: { Args: never; Returns: undefined }
      automation_condition_matches: {
        Args: {
          target_card_snapshot: Json
          target_condition: Json
          target_project_id: string
        }
        Returns: boolean
      }
      automation_conditions_match: {
        Args: {
          target_card_snapshot: Json
          target_conditions: Json
          target_project_id: string
        }
        Returns: boolean
      }
      automation_custom_field_value: {
        Args: { target_card_snapshot: Json; target_field_definition_id: string }
        Returns: Json
      }
      automation_group_label: {
        Args: { target_group_id: string }
        Returns: string
      }
      automation_interpolate_text: {
        Args: {
          target_card_snapshot: Json
          target_event_snapshot: Json
          target_template: string
        }
        Returns: string
      }
      automation_move_card_group: {
        Args: {
          target_actor_user_id: string
          target_card_id: string
          target_group_id: string
        }
        Returns: undefined
      }
      automation_move_card_status: {
        Args: {
          target_actor_user_id: string
          target_card_id: string
          target_status_option_id: string
        }
        Returns: undefined
      }
      automation_priority_label: {
        Args: { target_priority_option_id: string }
        Returns: string
      }
      automation_set_card_assignee: {
        Args: {
          target_actor_user_id: string
          target_assignee_user_id: string
          target_card_id: string
        }
        Returns: undefined
      }
      automation_set_card_priority: {
        Args: {
          target_actor_user_id: string
          target_card_id: string
          target_priority_option_id: string
        }
        Returns: undefined
      }
      automation_set_execution_context: {
        Args: { target_automation_id: string; target_run_id: string }
        Returns: undefined
      }
      automation_status_label: {
        Args: { target_status_option_id: string }
        Returns: string
      }
      automation_trigger_matches: {
        Args: {
          target_event_snapshot: Json
          target_trigger_config: Json
          target_trigger_type: string
        }
        Returns: boolean
      }
      automation_validate_definition: {
        Args: {
          target_actions: Json
          target_condition_clauses: Json
          target_project_id: string
          target_trigger_config: Json
          target_trigger_type: string
        }
        Returns: undefined
      }
      bootstrap_workspace: {
        Args: {
          target_color_token?: string
          target_icon?: string
          target_project_name?: string
          target_timezone?: string
          target_workspace_access?: Database["public"]["Enums"]["resource_access"]
          target_workspace_name: string
        }
        Returns: {
          route: Json
        }[]
      }
      can_access_organization: {
        Args: { target_org_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_access_plan: { Args: { target_plan_id: string }; Returns: boolean }
      can_access_plan_view: {
        Args: { target_plan_view_id: string }
        Returns: boolean
      }
      can_access_project: {
        Args: { target_project_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_access_workspace: {
        Args: { target_user_id?: string; target_workspace_id: string }
        Returns: boolean
      }
      can_edit_organization: {
        Args: { target_org_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_edit_project: {
        Args: { target_project_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_edit_workspace: {
        Args: { target_user_id?: string; target_workspace_id: string }
        Returns: boolean
      }
      can_manage_organization: {
        Args: { target_org_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_manage_plan: { Args: { target_plan_id: string }; Returns: boolean }
      can_manage_plan_view: {
        Args: { target_plan_view_id: string }
        Returns: boolean
      }
      can_manage_project: {
        Args: { target_project_id: string; target_user_id?: string }
        Returns: boolean
      }
      can_manage_workspace: {
        Args: { target_user_id?: string; target_workspace_id: string }
        Returns: boolean
      }
      card_search_text: {
        Args: {
          target_body_text: string
          target_tags: string[]
          target_title: string
        }
        Returns: string
      }
      check_org_limit: {
        Args: { p_limit_key: string; p_org_id: string }
        Returns: boolean
      }
      clear_project_github_source: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      coalesce_rich_text_document: {
        Args: { fallback_text?: string; source_content: Json }
        Returns: Json
      }
      complete_sprint: {
        Args: {
          target_action: string
          target_next_sprint_id?: string
          target_next_sprint_end_date?: string
          target_next_sprint_goal?: string
          target_next_sprint_name?: string
          target_next_sprint_start_date?: string
          target_sprint_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          end_date: string | null
          goal: string | null
          id: string
          name: string
          position: number
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }[]
      }
      create_attachment: {
        Args: {
          target_content_type?: string
          target_document_id: string
          target_file_name: string
          target_project_id: string
          target_size_bytes?: number
          target_storage_path: string
        }
        Returns: {
          content_type: string
          created_at: string
          file_name: string
          id: string
          size_bytes: number
          storage_path: string
          uploaded_by_name: string
        }[]
      }
      create_canvas_element: {
        Args: {
          target_content?: string
          target_element_type: string
          target_height?: number
          target_is_resolved?: boolean
          target_path_data?: string
          target_project_view_id: string
          target_style?: Json
          target_url?: string
          target_width?: number
          target_x?: number
          target_y?: number
          target_z_index?: number
        }
        Returns: {
          content: string | null
          created_at: string
          created_by: string | null
          element_type: string
          height: number
          id: string
          is_resolved: boolean
          path_data: string | null
          project_view_id: string
          style: Json
          updated_at: string
          url: string | null
          width: number
          x: number
          y: number
          z_index: number
        }
        SetofOptions: {
          from: "*"
          to: "canvas_elements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_card: {
        Args: {
          target_body_json?: Json
          target_body_md?: string
          target_due_at?: string
          target_effort?: number
          target_group_id?: string
          target_initiative_id?: string
          target_priority_option_id?: string
          target_project_id: string
          target_sprint_id?: string
          target_start_at?: string
          target_status_option_id?: string
          target_tags?: string[]
          target_title: string
        }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          card_ref: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          project_card_number: number
          project_key: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      create_card_attachment: {
        Args: {
          target_card_id: string
          target_content_type?: string
          target_file_name: string
          target_project_id: string
          target_size_bytes?: number
          target_storage_path: string
        }
        Returns: {
          card_id: string
          content_type: string
          created_at: string
          file_name: string
          id: string
          size_bytes: number
          storage_path: string
          uploaded_by_name: string
          uploaded_by_user_id: string
        }[]
      }
      create_default_project_views: {
        Args: {
          target_default_starter_view_type?: Database["public"]["Enums"]["project_view_type"]
          target_project_id: string
          target_starter_view_types?: Database["public"]["Enums"]["project_view_type"][]
          target_user_id?: string
        }
        Returns: undefined
      }
      create_field_definition: {
        Args: {
          target_field_type: Database["public"]["Enums"]["custom_field_type"]
          target_name: string
          target_options?: string[]
          target_project_id: string
        }
        Returns: {
          created_at: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          key: string
          name: string
          options: Json
          position: number
        }[]
      }
      create_initiative: {
        Args: {
          target_description?: string
          target_lead_user_id?: string
          target_name: string
          target_target_date?: string
          target_visibility?: Database["public"]["Enums"]["resource_access"]
          target_workspace_id: string
        }
        Returns: {
          created_at: string
          description: string
          health: Database["public"]["Enums"]["initiative_health"]
          id: string
          lead_name: string
          lead_user_id: string
          name: string
          position: number
          status: Database["public"]["Enums"]["initiative_status"]
          target_date: string
          updated_at: string
          visibility: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
        }[]
      }
      create_organization_invite: {
        Args: {
          target_email: string
          target_message?: string
          target_org_id: string
          target_role?: Database["public"]["Enums"]["organization_role"]
        }
        Returns: {
          accept_token: string
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["organization_role"]
        }[]
      }
      create_project: {
        Args: {
          target_access?: Database["public"]["Enums"]["resource_access"]
          target_default_starter_view_type?: Database["public"]["Enums"]["project_view_type"]
          target_icon?: string
          target_name: string
          target_starter_view_types?: Database["public"]["Enums"]["project_view_type"][]
          target_workspace_id: string
        }
        Returns: {
          route: Json
        }[]
      }
      create_project_automation: {
        Args: {
          target_actions?: Json
          target_condition_clauses?: Json
          target_project_id: string
          target_status?: string
          target_trigger_config?: Json
          target_trigger_type: string
        }
        Returns: {
          actions: Json
          broken_reason: string
          condition_clauses: Json
          created_at: string
          created_by_user_id: string
          id: string
          is_broken: boolean
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string
        }[]
      }
      create_project_group: {
        Args: { target_label?: string; target_project_id: string }
        Returns: {
          created_at: string
          group_id: string
          group_position: number
          label: string
          project_id: string
          updated_at: string
        }[]
      }
      create_project_invite: {
        Args: {
          target_email: string
          target_project_id: string
          target_role?: Database["public"]["Enums"]["scope_access_role"]
        }
        Returns: {
          accept_token: string
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["scope_access_role"]
        }[]
      }
      create_project_sprint: {
        Args: {
          target_end_date?: string
          target_goal?: string
          target_name: string
          target_project_id: string
          target_start_date?: string
        }
        Returns: {
          completed_at: string
          created_at: string
          end_date: string
          goal: string
          id: string
          name: string
          position: number
          project_id: string
          start_date: string
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }[]
      }
      create_project_view: {
        Args: {
          target_name?: string
          target_project_id: string
          target_view_type: Database["public"]["Enums"]["project_view_type"]
        }
        Returns: {
          id: string
          is_default: boolean
          is_hidden: boolean
          name: string
          position: number
          view_type: string
        }[]
      }
      create_project_with_defaults: {
        Args: {
          target_access?: Database["public"]["Enums"]["resource_access"]
          target_default_starter_view_type?: Database["public"]["Enums"]["project_view_type"]
          target_icon?: string
          target_name: string
          target_starter_view_types?: Database["public"]["Enums"]["project_view_type"][]
          target_user_id?: string
          target_workspace_id: string
        }
        Returns: string
      }
      create_release: {
        Args: {
          target_build_number?: string
          target_name: string
          target_plan_view_id: string
          target_planned_date?: string
          target_status?: Database["public"]["Enums"]["release_status"]
        }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      create_release_share_link: {
        Args: { target_plan_view_id: string }
        Returns: {
          created_at: string
          revoked_at: string
          share_token: string
        }[]
      }
      create_roadmap_item: {
        Args: {
          target_color?: string
          target_end_period: string
          target_initiative_id?: string
          target_item_type?: Database["public"]["Enums"]["roadmap_item_type"]
          target_label: string
          target_lane_id: string
          target_start_period: string
        }
        Returns: {
          id: string
          label: string
          position: number
        }[]
      }
      create_roadmap_lane: {
        Args: {
          target_color?: string
          target_group?: string
          target_group_type?: string
          target_plan_view_id: string
          target_title: string
        }
        Returns: {
          id: string
          position: number
          title: string
        }[]
      }
      create_roadmap_milestone: {
        Args: {
          target_color?: string
          target_date: string
          target_label: string
          target_lane_id?: string
          target_plan_view_id: string
          target_type?: Database["public"]["Enums"]["roadmap_milestone_type"]
        }
        Returns: {
          id: string
          label: string
        }[]
      }
      create_scorecard_item: {
        Args: { target_plan_view_id: string; target_title?: string }
        Returns: {
          composite_score: number
          created_at: string
          description: string
          id: string
          linked_release_id: string
          linked_release_name: string
          linked_roadmap_item_id: string
          linked_roadmap_item_label: string
          plan_view_id: string
          position: number
          scores: Json
          title: string
          tracked: boolean
          updated_at: string
        }[]
      }
      create_wiki_page: {
        Args: {
          target_org_id: string
          target_parent_page_id?: string
          target_project_id?: string
          target_title?: string
        }
        Returns: {
          created_at: string
          created_by_user_id: string
          icon: string
          id: string
          organization_id: string
          owner_user_id: string
          parent_page_id: string
          position: number
          project_id: string
          slug: string
          status: string
          title: string
          updated_at: string
          version: number
        }[]
      }
      create_wiki_share_link: {
        Args: { target_page_id: string }
        Returns: {
          created_at: string
          revoked_at: string
          share_token: string
        }[]
      }
      create_workspace: {
        Args: {
          target_color_token?: string
          target_icon?: string
          target_org_id?: string
          target_project_name?: string
          target_timezone?: string
          target_workspace_access?: Database["public"]["Enums"]["resource_access"]
          target_workspace_name: string
        }
        Returns: {
          route: Json
        }[]
      }
      create_workspace_invite: {
        Args: {
          target_email: string
          target_message?: string
          target_role?: Database["public"]["Enums"]["scope_access_role"]
          target_workspace_id: string
        }
        Returns: {
          accept_token: string
          created_at: string
          email: string
          id: string
          role: string
        }[]
      }
      create_workspace_plan: {
        Args: {
          target_description?: string
          target_name: string
          target_view_types?: Database["public"]["Enums"]["plan_view_type"][]
          target_workspace_id: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          name: string
          position: number
          views: Json
          workspace_id: string
        }[]
      }
      current_automation_metadata: { Args: never; Returns: Json }
      decline_award_invite: { Args: { p_token: string }; Returns: boolean }
      default_project_icon: { Args: never; Returns: string }
      default_scope_role_for_org_role: {
        Args: {
          target_org_role: Database["public"]["Enums"]["organization_role"]
        }
        Returns: Database["public"]["Enums"]["scope_access_role"]
      }
      default_table_shared_config: { Args: never; Returns: Json }
      default_table_visible_field_keys: { Args: never; Returns: string[] }
      default_workspace_icon: { Args: { target_name: string }; Returns: string }
      delete_canvas_element: {
        Args: { target_element_id: string }
        Returns: undefined
      }
      delete_card: { Args: { target_card_id: string }; Returns: undefined }
      delete_cards: { Args: { target_card_ids: string[] }; Returns: undefined }
      delete_document_version: {
        Args: { target_document_id: string; target_version_id: string }
        Returns: undefined
      }
      delete_field_option: {
        Args: { target_option_id: string }
        Returns: undefined
      }
      delete_initiative: {
        Args: { target_initiative_id: string }
        Returns: undefined
      }
      delete_organization: {
        Args: { target_org_id: string }
        Returns: undefined
      }
      delete_plan: { Args: { target_plan_id: string }; Returns: undefined }
      delete_project: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      delete_project_automation: {
        Args: { target_automation_id: string }
        Returns: undefined
      }
      delete_project_group: {
        Args: { target_delete_cards?: boolean; target_group_id: string }
        Returns: undefined
      }
      delete_project_priority_option: {
        Args: { target_option_id: string }
        Returns: {
          reassigned_count: number
        }[]
      }
      delete_project_status_option: {
        Args: { target_option_id: string }
        Returns: {
          reassigned_count: number
          reassigned_to: string
        }[]
      }
      delete_release: {
        Args: { target_release_id: string }
        Returns: undefined
      }
      delete_roadmap_item: {
        Args: { target_item_id: string }
        Returns: undefined
      }
      delete_roadmap_lane: {
        Args: { target_lane_id: string }
        Returns: undefined
      }
      delete_roadmap_milestone: {
        Args: { target_milestone_id: string }
        Returns: undefined
      }
      delete_scorecard_item: {
        Args: { target_item_id: string }
        Returns: undefined
      }
      delete_sprint: { Args: { target_sprint_id: string }; Returns: undefined }
      delete_wiki_page: { Args: { target_page_id: string }; Returns: undefined }
      delete_workspace: {
        Args: { target_workspace_id: string }
        Returns: undefined
      }
      delete_workspace_plan: {
        Args: { target_plan_id: string }
        Returns: undefined
      }
      duplicate_cards: {
        Args: { target_card_ids: string[]; target_project_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          card_ref: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          project_card_number: number
          project_key: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      empty_rich_text_document: { Args: never; Returns: Json }
      enforce_project_automation_limit: {
        Args: {
          target_excluded_automation_id?: string
          target_project_id: string
        }
        Returns: undefined
      }
      ensure_project_table_view: {
        Args: { target_project_id: string; target_user_id: string }
        Returns: string
      }
      format_card_ref: {
        Args: { target_project_card_number: number; target_project_key: string }
        Returns: string
      }
      generate_field_key: {
        Args: { target_name: string; target_project_id: string }
        Returns: string
      }
      generate_wiki_slug: {
        Args: {
          target_org_id: string
          target_parent_id: string
          target_project_id: string
          target_title: string
        }
        Returns: string
      }
      get_award_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          award_type: string
          credit_months: number
          custom_message: string
          expires_at: string
          id: string
          plan: string
          reason: string
          recipient_email: string
          status: string
        }[]
      }
      get_card_activity: {
        Args: { target_card_id: string }
        Returns: {
          actor_id: string
          actor_name: string
          card_id: string
          created_at: string
          event_action: string
          event_type: string
          id: string
          metadata: Json
          title: string
        }[]
      }
      get_card_custom_field_values: {
        Args: { target_card_id: string }
        Returns: Json
      }
      get_card_detail: {
        Args: { target_card_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          attachments: Json
          body_json: Json
          body_md: string
          card_ref: string
          comments: Json
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          id: string
          initiative_id: string
          priority_option_id: string
          project_card_number: number
          project_id: string
          project_key: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      get_card_rpc_rows: {
        Args: { target_card_id: string; target_project_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      get_current_profile_settings: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          github_login: string
          week_starts_on: string
        }[]
      }
      get_current_profile_summary: {
        Args: never
        Returns: {
          email: string
          full_name: string
          github_login: string
        }[]
      }
      get_document_presence: {
        Args: { target_document_id: string }
        Returns: {
          last_seen_at: string
          name: string
          state: string
          user_id: string
        }[]
      }
      get_document_version_content: {
        Args: { target_document_id: string; target_version_id: string }
        Returns: {
          author_name: string
          content_json: Json
          content_md: string
          created_at: string
          id: string
          title: string
          version: number
        }[]
      }
      get_effective_plan: { Args: { target_org_id: string }; Returns: string }
      get_gantt_shared_config_by_view_id: {
        Args: { target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      get_github_shared_config_by_view_id: {
        Args: { target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      get_initiative_cards: {
        Args: { target_initiative_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          card_id: string
          completed_at: string
          created_at: string
          due_at: string
          effort: number
          priority_option_id: string
          project_id: string
          project_name: string
          start_at: string
          status_category: string
          status_label: string
          status_option_id: string
          title: string
        }[]
      }
      get_initiative_updates: {
        Args: { target_initiative_id: string }
        Returns: {
          author_name: string
          body_text: string
          created_at: string
          created_by_user_id: string
          health_snapshot: Database["public"]["Enums"]["initiative_health"]
          id: string
          initiative_id: string
        }[]
      }
      get_invite_snapshot: {
        Args: { target_accept_token: string }
        Returns: {
          email: string
          inviter_name: string
          organization: Json
          project: Json
          resource_type: string
          role: string
          route: Json
          status: string
          workspace: Json
        }[]
      }
      get_my_notes_startup_snapshot: {
        Args: { target_note_id?: string }
        Returns: Json
      }
      get_org_billing_admin_snapshot: {
        Args: { p_org_id: string }
        Returns: {
          has_billing_customer: boolean
        }[]
      }
      get_org_billing_summary: {
        Args: { p_org_id: string }
        Returns: {
          admin_grant_ends_at: string
          admin_grant_plan: string
          billing_period: string
          limits: Json
          plan: string
          plan_status: string
          storage_used_bytes: number
        }[]
      }
      get_org_usage: {
        Args: { p_org_id: string }
        Returns: {
          effective_plan: string
          limits: Json
          member_count: number
          project_count: number
          storage_used_bytes: number
          workspace_count: number
        }[]
      }
      get_org_wiki_startup_snapshot: {
        Args: { target_org_slug: string; target_page_path?: string }
        Returns: Json
      }
      get_organization_github_identity_candidates: {
        Args: { target_org_id: string }
        Returns: {
          github_login: string
          last_seen_at: string
          pr_count: number
          review_count: number
        }[]
      }
      get_organization_members: {
        Args: { target_org_id: string }
        Returns: {
          can_manage: boolean
          invitations: Json
          members: Json
          organization: Json
        }[]
      }
      get_overview_shared_config_by_view_id: {
        Args: { target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      get_project_access_route_context: {
        Args: {
          target_org_slug: string
          target_project_slug: string
          target_workspace_slug: string
        }
        Returns: {
          can_access_project: boolean
          can_manage_project: boolean
          organization_id: string
          organization_name: string
          organization_slug: string
          project_access: Database["public"]["Enums"]["resource_access"]
          project_id: string
          project_name: string
          project_slug: string
          workspace_access: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_project_access_snapshot: {
        Args: { target_project_id: string }
        Returns: {
          can_edit_project: boolean
          can_manage_project: boolean
          collaborators: Json
          current_org_role: Database["public"]["Enums"]["organization_role"]
          direct_access: Json
          pending_invites: Json
          project_access: Database["public"]["Enums"]["resource_access"]
          workspace_access: Database["public"]["Enums"]["resource_access"]
        }[]
      }
      get_project_card_rows: {
        Args: { target_project_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          card_id: string
          card_ref: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          project_card_number: number
          project_key: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      get_project_custom_fields: {
        Args: { target_project_id: string }
        Returns: {
          created_at: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          key: string
          name: string
          options: Json
          position: number
        }[]
      }
      get_project_document_snapshot: {
        Args: { target_project_view_id: string }
        Returns: {
          attachments: Json
          comments: Json
          content_json: Json
          content_md: string
          id: string
          project_id: string
          project_key: string
          project_name: string
          project_slug: string
          project_view_id: string
          title: string
          updated_at: string
          updated_by_name: string
          version: number
          versions: Json
        }[]
      }
      get_project_github_analytics_pull_requests: {
        Args: {
          target_from?: string
          target_project_id: string
          target_to?: string
        }
        Returns: {
          approval_count: number
          author_login: string
          changes_requested_count: number
          closed_at: string
          created_at: string
          draft: boolean
          first_review_submitted_at: string
          github_pr_id: number
          html_url: string
          id: string
          last_review_submitted_at: string
          merged_at: string
          number: number
          repo_id: string
          review_count: number
          review_state: string
          state: string
          title: string
          updated_at: string
        }[]
      }
      get_project_github_cards: {
        Args: { target_project_id: string }
        Returns: {
          id: string
          project_card_number: number
          title: string
        }[]
      }
      get_project_github_pull_requests: {
        Args: { target_project_id: string }
        Returns: {
          additions: number
          approval_count: number
          author_avatar_url: string
          author_login: string
          base_ref: string
          body: string
          changes_requested_count: number
          checks_status: string
          closed_at: string
          created_at: string
          deletions: number
          draft: boolean
          first_review_submitted_at: string
          github_pr_id: number
          head_ref: string
          html_url: string
          id: string
          last_review_submitted_at: string
          linked_cards: Json
          merged_at: string
          number: number
          repo_id: string
          review_count: number
          review_state: string
          reviewers: Json
          state: string
          synced_at: string
          title: string
          updated_at: string
        }[]
      }
      get_project_github_review_events: {
        Args: {
          target_from?: string
          target_project_id: string
          target_to?: string
        }
        Returns: {
          actor_avatar_url: string
          actor_login: string
          github_created_at: string
          id: string
          payload: Json
          pull_request_id: string
          repo_id: string
        }[]
      }
      get_project_github_summary: {
        Args: { target_project_id: string }
        Returns: {
          avg_review_hours: number
          merged_this_week: number
          needs_review_count: number
          open_count: number
          stale_count: number
        }[]
      }
      get_project_groups: {
        Args: { target_project_id: string }
        Returns: {
          created_at: string
          group_id: string
          group_position: number
          label: string
          project_id: string
          updated_at: string
        }[]
      }
      get_project_invite_snapshot: {
        Args: { target_accept_token: string }
        Returns: Json
      }
      get_project_priority_options: {
        Args: { target_project_id: string }
        Returns: {
          color: string
          id: string
          is_default: boolean
          key: string
          label: string
          sort_order: number
        }[]
      }
      get_project_sprints: {
        Args: { target_project_id: string }
        Returns: {
          completed_at: string
          created_at: string
          end_date: string
          goal: string
          id: string
          name: string
          position: number
          project_id: string
          start_date: string
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }[]
      }
      get_project_status_options: {
        Args: { target_project_id: string }
        Returns: {
          category: string
          color: string
          id: string
          is_default: boolean
          key: string
          label: string
          position: number
        }[]
      }
      get_project_table_view_state: {
        Args: { target_project_id: string }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      get_project_table_view_state_by_view_id: {
        Args: { target_project_view_id: string }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      get_project_table_view_states: {
        Args: { target_project_id: string }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      get_project_task_mode: {
        Args: { target_project_id: string }
        Returns: {
          task_mode: string
        }[]
      }
      get_public_release_share: {
        Args: { target_share_token: string }
        Returns: {
          plan_id: string
          plan_name: string
          plan_view_id: string
          releases: Json
          shared_at: string
          view_name: string
          workspace_name: string
        }[]
      }
      get_public_wiki_page: {
        Args: { target_share_token: string }
        Returns: {
          content_json: Json
          content_md: string
          icon: string
          title: string
          updated_at: string
        }[]
      }
      get_release_linked_cards: {
        Args: { target_release_id: string }
        Returns: {
          assignee_name: string
          card_id: string
          project_id: string
          project_name: string
          status_category: string
          status_label: string
          title: string
        }[]
      }
      get_release_linked_sprints: {
        Args: { target_release_id: string }
        Returns: {
          end_date: string
          name: string
          project_id: string
          project_name: string
          sprint_id: string
          start_date: string
          status: string
        }[]
      }
      get_release_share_snapshot: {
        Args: { target_plan_view_id: string }
        Returns: {
          created_at: string
          revoked_at: string
          share_token: string
        }[]
      }
      get_releases_data: {
        Args: { target_plan_view_id: string }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      get_roadmap_data: {
        Args: { target_plan_view_id: string }
        Returns: {
          cells: Json
          items: Json
          lanes: Json
          milestones: Json
        }[]
      }
      get_scorecard_data: {
        Args: { target_plan_view_id: string }
        Returns: {
          composite_score: number
          created_at: string
          description: string
          id: string
          linked_release_id: string
          linked_release_name: string
          linked_roadmap_item_id: string
          linked_roadmap_item_label: string
          plan_view_id: string
          position: number
          scores: Json
          title: string
          tracked: boolean
          updated_at: string
        }[]
      }
      get_shell_summary_rows_v2: {
        Args: never
        Returns: {
          default_project_view_id: string
          member_count: number
          project_access: Database["public"]["Enums"]["resource_access"]
          project_builtin_field_labels: Json
          project_created_at: string
          project_icon: string
          project_id: string
          project_key: string
          project_name: string
          project_position: number
          project_slug: string
          project_updated_at: string
          project_views: Json
          task_count: number
          workspace_can_manage: boolean
          workspace_color_token: string
          workspace_icon: string
          workspace_id: string
          workspace_name: string
          workspace_organization_id: string
          workspace_organization_name: string
          workspace_organization_slug: string
          workspace_slug: string
          workspace_timezone: string
        }[]
      }
      get_wiki_share_snapshot: {
        Args: { target_page_id: string }
        Returns: {
          created_at: string
          revoked_at: string
          share_token: string
        }[]
      }
      get_workspace_access_route_context: {
        Args: { target_org_slug: string; target_workspace_slug: string }
        Returns: {
          can_access_workspace: boolean
          can_manage_workspace: boolean
          organization_id: string
          organization_name: string
          organization_slug: string
          workspace_access: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_workspace_access_snapshot: {
        Args: { target_workspace_id: string }
        Returns: {
          can_edit_workspace: boolean
          can_manage_workspace: boolean
          collaborators: Json
          current_org_role: Database["public"]["Enums"]["organization_role"]
          direct_access: Json
          pending_invites: Json
          workspace_access: Database["public"]["Enums"]["resource_access"]
        }[]
      }
      get_workspace_archive: {
        Args: { target_workspace_id: string }
        Returns: {
          archived_at: string
          archived_by_name: string
          entity_id: string
          entity_type: string
          project_name: string
          title: string
        }[]
      }
      get_workspace_initiative_picker_cards: {
        Args: { target_initiative_id: string; target_workspace_id: string }
        Returns: {
          assignee_name: string
          card_id: string
          initiative_id: string
          project_id: string
          project_name: string
          status_category: string
          status_label: string
          title: string
        }[]
      }
      get_workspace_initiative_sparklines: {
        Args: { target_workspace_id: string }
        Returns: {
          cards_completed_cumulative: number
          day: string
          initiative_id: string
          total_scope: number
        }[]
      }
      get_workspace_initiative_summaries: {
        Args: { target_workspace_id: string }
        Returns: {
          cards_completed: number
          cards_completed_this_week: number
          cards_not_started: number
          cards_started: number
          initiative_id: string
          project_count: number
          total_cards: number
        }[]
      }
      get_workspace_initiatives: {
        Args: { target_workspace_id: string }
        Returns: {
          created_at: string
          description: string
          health: Database["public"]["Enums"]["initiative_health"]
          id: string
          latest_update_at: string
          latest_update_text: string
          lead_name: string
          lead_user_id: string
          name: string
          position: number
          status: Database["public"]["Enums"]["initiative_status"]
          target_date: string
          updated_at: string
          visibility: Database["public"]["Enums"]["resource_access"]
          workspace_id: string
        }[]
      }
      get_workspace_organization: {
        Args: { target_workspace_id: string }
        Returns: Json
      }
      get_workspace_plans: {
        Args: { target_workspace_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          name: string
          position: number
          views: Json
        }[]
      }
      get_workspace_release_picker_cards: {
        Args: { target_release_id: string; target_workspace_id: string }
        Returns: {
          assignee_name: string
          card_id: string
          linked: boolean
          project_id: string
          project_name: string
          status_category: string
          status_label: string
          title: string
        }[]
      }
      get_workspace_release_picker_sprints: {
        Args: { target_release_id: string; target_workspace_id: string }
        Returns: {
          end_date: string
          linked: boolean
          name: string
          project_id: string
          project_name: string
          sprint_id: string
          start_date: string
          status: string
        }[]
      }
      get_workspace_sidebar_item_orders: {
        Args: { target_workspace_id: string }
        Returns: {
          out_item_id: string
          out_item_type: string
          out_position: number
        }[]
      }
      get_workspace_trash: {
        Args: { target_workspace_id: string }
        Returns: {
          deleted_at: string
          deleted_by_name: string
          entity_id: string
          entity_type: string
          project_name: string
          title: string
        }[]
      }
      initialize_user_notes: {
        Args: { p_user_id: string }
        Returns: {
          created: boolean
          folder_id: string
          note_id: string
        }[]
      }
      is_current_user_internal_admin: { Args: never; Returns: boolean }
      jsonb_text_array: { Args: { target_value: Json }; Returns: string[] }
      link_card_to_pr: {
        Args: { target_card_id: string; target_pr_id: string }
        Returns: string
      }
      link_cards_to_release: {
        Args: { target_card_ids: string[]; target_release_id: string }
        Returns: undefined
      }
      link_sprints_to_release: {
        Args: { target_release_id: string; target_sprint_ids: string[] }
        Returns: undefined
      }
      list_pinned_pages_with_metadata: {
        Args: { target_user_id: string }
        Returns: {
          full_path: string
          icon: string
          page_id: string
          pin_position: number
          slug: string
          title: string
        }[]
      }
      list_project_automation_runs: {
        Args: {
          target_cursor?: string
          target_limit?: number
          target_project_id: string
        }
        Returns: {
          actions_executed: Json
          automation_id: string
          card_id: string
          card_title: string
          created_at: string
          id: string
          metadata: Json
          outcome: string
          project_id: string
          reason_code: string
          trigger_type: string
        }[]
      }
      list_project_automations: {
        Args: { target_project_id: string }
        Returns: {
          actions: Json
          broken_reason: string
          condition_clauses: Json
          created_at: string
          created_by_user_id: string
          id: string
          is_broken: boolean
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string
        }[]
      }
      list_wiki_page_comments: {
        Args: { target_page_id: string }
        Returns: {
          author_avatar_url: string
          author_name: string
          author_user_id: string
          body_text: string
          created_at: string
          id: string
          page_id: string
        }[]
      }
      list_workspace_access_projects: {
        Args: { target_workspace_id: string }
        Returns: {
          can_access_project: boolean
          can_manage_project: boolean
          project_access: Database["public"]["Enums"]["resource_access"]
          project_id: string
          project_name: string
          project_slug: string
        }[]
      }
      list_workspace_members: {
        Args: { target_workspace_id: string }
        Returns: {
          email: string
          name: string
          role: Database["public"]["Enums"]["scope_access_role"]
          user_id: string
        }[]
      }
      mark_invitation_email_sent: {
        Args: { target_accept_token: string; target_sent_at?: string }
        Returns: string
      }
      mark_project_invite_email_sent: {
        Args: { target_accept_token: string; target_sent_at?: string }
        Returns: string
      }
      move_card: {
        Args: {
          target_card_id: string
          target_position?: number
          target_status_option_id: string
        }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      move_card_to_group: {
        Args: {
          target_card_id: string
          target_group_id?: string
          target_position?: number
        }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      next_organization_slug: { Args: { target_name: string }; Returns: string }
      next_project_key: { Args: { target_name: string }; Returns: string }
      next_project_slug: {
        Args: { target_name: string; target_workspace_id: string }
        Returns: string
      }
      next_workspace_slug: {
        Args: { target_name: string; target_workspace_scope: string }
        Returns: string
      }
      normalize_project_gantt_shared_config: {
        Args: { target_config: Json; target_project_id: string }
        Returns: Json
      }
      normalize_project_github_shared_config: {
        Args: { target_config: Json; target_project_id: string }
        Returns: Json
      }
      normalize_project_table_shared_config: {
        Args: {
          target_filters: Json
          target_group_by: string
          target_person_filter_user_id?: string
          target_project_id: string
          target_sort: Json
          target_visible_field_keys: string[]
        }
        Returns: Json
      }
      normalize_project_table_sort: {
        Args: { target_project_id: string; target_sort: Json }
        Returns: Json
      }
      normalize_table_column_widths: {
        Args: { target_column_widths: Json; target_project_id: string }
        Returns: Json
      }
      normalize_table_filters: { Args: { target_filters: Json }; Returns: Json }
      normalize_table_sort: { Args: { target_sort: Json }; Returns: Json }
      normalize_table_visible_field_keys: {
        Args: { target_project_id: string; target_visible_field_keys: string[] }
        Returns: string[]
      }
      normalize_timezone: { Args: { target_timezone: string }; Returns: string }
      normalize_week_starts_on: {
        Args: { target_week_starts_on: string }
        Returns: string
      }
      normalize_workspace_color_token: {
        Args: { target_color_token: string }
        Returns: string
      }
      note_display_title: {
        Args: { target_content_md: string; target_title: string }
        Returns: string
      }
      note_search_text: {
        Args: { target_content_md: string; target_title: string }
        Returns: string
      }
      optional_table_field_keys: { Args: never; Returns: string[] }
      pause_project_automation: {
        Args: { target_automation_id: string }
        Returns: {
          actions: Json
          broken_reason: string
          condition_clauses: Json
          created_at: string
          created_by_user_id: string
          id: string
          is_broken: boolean
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string
        }[]
      }
      permanent_delete_cards: {
        Args: { target_card_ids: string[] }
        Returns: undefined
      }
      pin_wiki_page: { Args: { target_page_id: string }; Returns: undefined }
      plan_release_payload: {
        Args: { target_release_id: string }
        Returns: Json
      }
      plan_scorecard_item_payload: {
        Args: { target_item_id: string }
        Returns: Json
      }
      post_initiative_update: {
        Args: {
          target_body_text: string
          target_health: Database["public"]["Enums"]["initiative_health"]
          target_initiative_id: string
        }
        Returns: {
          author_name: string
          body_text: string
          created_at: string
          created_by_user_id: string
          health_snapshot: Database["public"]["Enums"]["initiative_health"]
          id: string
          initiative_id: string
        }[]
      }
      profile_display_name: {
        Args: { target_user_id: string }
        Returns: string
      }
      project_automation_broken_reason: {
        Args: {
          target_actions: Json
          target_condition_clauses: Json
          target_project_id: string
          target_trigger_config: Json
          target_trigger_type: string
        }
        Returns: string
      }
      project_automation_payload: {
        Args: {
          target_automation: Database["public"]["Tables"]["project_automations"]["Row"]
        }
        Returns: Json
      }
      project_is_active: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      project_ref_key_seed: { Args: { target_name: string }; Returns: string }
      project_route_payload: {
        Args: { target_project_id: string }
        Returns: Json
      }
      project_view_payload: {
        Args: { target_project_view_id: string }
        Returns: {
          id: string
          is_default: boolean
          is_hidden: boolean
          name: string
          position: number
          view_type: string
        }[]
      }
      remove_organization_member: {
        Args: { target_org_id: string; target_user_id: string }
        Returns: undefined
      }
      remove_project_member: {
        Args: { target_project_id: string; target_user_id: string }
        Returns: undefined
      }
      remove_workspace_member: {
        Args: { target_user_id: string; target_workspace_id: string }
        Returns: undefined
      }
      rename_field_definition: {
        Args: { target_field_definition_id: string; target_name: string }
        Returns: undefined
      }
      rename_field_option: {
        Args: { target_label: string; target_option_id: string }
        Returns: undefined
      }
      rename_initiative: {
        Args: { target_initiative_id: string; target_name: string }
        Returns: undefined
      }
      rename_plan: {
        Args: { target_name: string; target_plan_id: string }
        Returns: undefined
      }
      rename_project: {
        Args: { target_name: string; target_project_id: string }
        Returns: undefined
      }
      rename_project_group: {
        Args: { target_group_id: string; target_label: string }
        Returns: {
          created_at: string
          group_id: string
          group_position: number
          label: string
          project_id: string
          updated_at: string
        }[]
      }
      rename_project_priority_option: {
        Args: { target_new_label: string; target_option_id: string }
        Returns: undefined
      }
      rename_project_status_option: {
        Args: { target_new_label: string; target_option_id: string }
        Returns: undefined
      }
      rename_project_view: {
        Args: { target_name: string; target_project_view_id: string }
        Returns: undefined
      }
      rename_workspace: {
        Args: { target_name: string; target_workspace_id: string }
        Returns: undefined
      }
      reorder_field_options: {
        Args: { target_option_ids: string[] }
        Returns: undefined
      }
      reorder_initiative: {
        Args: { target_initiative_id: string; target_new_position: number }
        Returns: undefined
      }
      reorder_note_folders: { Args: { updates: Json }; Returns: undefined }
      reorder_notes: { Args: { updates: Json }; Returns: undefined }
      reorder_project_automations: {
        Args: { target_automation_ids: string[]; target_project_id: string }
        Returns: undefined
      }
      reorder_project_groups: {
        Args: { target_group_ids: string[] }
        Returns: undefined
      }
      reorder_project_views: {
        Args: { target_project_id: string; target_view_ids: string[] }
        Returns: undefined
      }
      reorder_release: {
        Args: { target_new_position: number; target_release_id: string }
        Returns: undefined
      }
      reorder_scorecard_item: {
        Args: { target_item_id: string; target_new_position: number }
        Returns: undefined
      }
      reorder_wiki_pages: { Args: { updates: Json }; Returns: undefined }
      reorder_workspace_sidebar_items: {
        Args: { ordered_items: Json; target_workspace_id: string }
        Returns: undefined
      }
      reorder_workspace_sidebar_projects: {
        Args: { ordered_project_ids: string[]; target_workspace_id: string }
        Returns: undefined
      }
      resolve_organization_slug: {
        Args: { target_org_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      restore_cards: { Args: { target_card_ids: string[] }; Returns: undefined }
      restore_document_version: {
        Args: {
          expected_version: number
          target_document_id: string
          target_version_id: string
        }
        Returns: {
          document_content_json: Json
          document_content_md: string
          document_id: string
          document_project_id: string
          document_title: string
          document_updated_at: string
          document_updated_by_name: string
          document_version: number
          version_entry_author_name: string
          version_entry_created_at: string
          version_entry_id: string
          version_entry_title: string
          version_entry_version: number
        }[]
      }
      restore_project: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      restore_wiki_page: {
        Args: { target_page_id: string }
        Returns: undefined
      }
      resume_project_automation: {
        Args: { target_automation_id: string }
        Returns: {
          actions: Json
          broken_reason: string
          condition_clauses: Json
          created_at: string
          created_by_user_id: string
          id: string
          is_broken: boolean
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string
        }[]
      }
      revoke_invitation: {
        Args: { target_invite_id: string }
        Returns: undefined
      }
      revoke_project_invite: {
        Args: { target_invite_id: string }
        Returns: undefined
      }
      revoke_release_share_link: {
        Args: { target_plan_view_id: string }
        Returns: undefined
      }
      revoke_wiki_share_link: {
        Args: { target_page_id: string }
        Returns: undefined
      }
      rich_text_document_from_plain_text: {
        Args: { source_text: string }
        Returns: Json
      }
      save_document: {
        Args: {
          expected_version: number
          target_content_json?: Json
          target_content_md: string
          target_create_version?: boolean
          target_document_id: string
          target_title: string
        }
        Returns: {
          document_content_json: Json
          document_content_md: string
          document_id: string
          document_project_id: string
          document_title: string
          document_updated_at: string
          document_updated_by_name: string
          document_version: number
          version_entry_author_name: string
          version_entry_created_at: string
          version_entry_id: string
          version_entry_title: string
          version_entry_version: number
        }[]
      }
      search_accessible_content: {
        Args: { target_query: string }
        Returns: {
          cards: Json
          documents: Json
        }[]
      }
      search_my_notes: {
        Args: { target_query: string }
        Returns: {
          notes: Json
        }[]
      }
      search_project_content: {
        Args: { target_project_id: string; target_query: string }
        Returns: {
          cards: Json
          documents: Json
        }[]
      }
      search_wiki_pages: {
        Args: {
          max_results?: number
          query_text: string
          target_org_id: string
        }
        Returns: {
          content_snippet: string
          full_path: string
          id: string
          parent_page_id: string
          project_id: string
          rank: number
          slug: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      search_workspace_content: {
        Args: { target_query: string; target_workspace_id: string }
        Returns: Json
      }
      search_workspace_members: {
        Args: {
          target_exclude_project_id?: string
          target_query?: string
          target_workspace_id: string
        }
        Returns: {
          email: string
          name: string
          org_role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }[]
      }
      seed_default_ai_personas: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      set_card_assignee: {
        Args: { target_assignee_user_id?: string; target_card_id: string }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      set_card_field_value: {
        Args: {
          target_card_id: string
          target_date_value?: string
          target_field_definition_id: string
          target_field_option_id?: string
          target_number_value?: number
          target_text_value?: string
        }
        Returns: {
          card_id: string
          field_key: string
          project_id: string
          value: Json
        }[]
      }
      set_card_initiative: {
        Args: { target_card_id: string; target_initiative_id: string }
        Returns: undefined
      }
      set_card_schedule: {
        Args: {
          target_card_id: string
          target_due_at?: string
          target_start_at?: string
        }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      set_card_sprint: {
        Args: { target_card_id: string; target_sprint_id: string }
        Returns: undefined
      }
      set_current_week_start: {
        Args: { target_week_starts_on: string }
        Returns: undefined
      }
      set_field_option_color: {
        Args: { target_color: string; target_option_id: string }
        Returns: undefined
      }
      set_gantt_shared_config_by_view_id: {
        Args: { target_config: Json; target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      set_github_shared_config_by_view_id: {
        Args: { target_config: Json; target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      set_organization_allowed_domains: {
        Args: { target_domains: string[]; target_org_id: string }
        Returns: undefined
      }
      set_organization_member_role: {
        Args: {
          target_org_id: string
          target_role: Database["public"]["Enums"]["organization_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      set_organization_timezone: {
        Args: { target_org_id: string; target_timezone: string }
        Returns: undefined
      }
      set_overview_shared_config_by_view_id: {
        Args: { target_config: Json; target_project_view_id: string }
        Returns: {
          shared_config: Json
        }[]
      }
      set_profile_github_login: {
        Args: {
          target_github_login?: string
          target_org_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_project_access: {
        Args: {
          target_access: Database["public"]["Enums"]["resource_access"]
          target_project_id: string
        }
        Returns: undefined
      }
      set_project_builtin_field_label: {
        Args: {
          target_field_key: string
          target_label?: string
          target_project_id: string
        }
        Returns: Json
      }
      set_project_builtin_option_label: {
        Args: {
          target_field_key: string
          target_label?: string
          target_option_key: string
          target_project_id: string
        }
        Returns: Json
      }
      set_project_github_source: {
        Args: { target_connection_source_id: string; target_project_id: string }
        Returns: string
      }
      set_project_member_role: {
        Args: {
          target_project_id: string
          target_role: Database["public"]["Enums"]["scope_access_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      set_project_priority_option_color: {
        Args: { target_color: string; target_option_id: string }
        Returns: undefined
      }
      set_project_status_option_color: {
        Args: { target_color: string; target_option_id: string }
        Returns: undefined
      }
      set_project_table_group_by: {
        Args: { target_group_by: string; target_project_id: string }
        Returns: string
      }
      set_project_table_personal_layout: {
        Args: {
          target_collapsed_groups: string[]
          target_column_widths?: Json
          target_project_id: string
        }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      set_project_table_personal_layout_by_view_id: {
        Args: {
          target_collapsed_groups: string[]
          target_column_widths?: Json
          target_project_view_id: string
        }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      set_project_table_shared_config: {
        Args: {
          target_filters?: Json
          target_group_by: string
          target_person_filter_user_id?: string
          target_project_id: string
          target_sort?: Json
          target_visible_field_keys?: string[]
        }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      set_project_table_shared_config_by_view_id: {
        Args: {
          target_filters?: Json
          target_group_by: string
          target_person_filter_user_id?: string
          target_project_view_id: string
          target_sort?: Json
          target_visible_field_keys?: string[]
        }
        Returns: {
          base_shared_version: number
          personal_collapsed_groups: string[]
          personal_column_widths: Json
          project_view_id: string
          shared_filters: Json
          shared_group_by: string
          shared_person_filter_user_id: string
          shared_sort: Json
          shared_version: number
          shared_visible_field_keys: string[]
        }[]
      }
      set_project_task_mode: {
        Args: { target_project_id: string; target_task_mode: string }
        Returns: {
          task_mode: string
        }[]
      }
      set_project_view_default: {
        Args: { target_project_view_id: string }
        Returns: undefined
      }
      set_project_view_hidden: {
        Args: { target_hidden: boolean; target_project_view_id: string }
        Returns: undefined
      }
      set_workspace_access: {
        Args: {
          target_access: Database["public"]["Enums"]["resource_access"]
          target_workspace_id: string
        }
        Returns: undefined
      }
      set_workspace_member_role: {
        Args: {
          target_role: Database["public"]["Enums"]["scope_access_role"]
          target_user_id: string
          target_workspace_id: string
        }
        Returns: undefined
      }
      set_workspace_timezone: {
        Args: { target_timezone: string; target_workspace_id: string }
        Returns: undefined
      }
      slugify_identifier: { Args: { input: string }; Returns: string }
      start_sprint: { Args: { target_sprint_id: string }; Returns: undefined }
      super_admin_create_award_invite: {
        Args: {
          p_award_type: string
          p_credit_months?: number
          p_custom_message?: string
          p_plan: string
          p_reason?: string
          p_recipient_email: string
        }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      super_admin_delete_organization: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      super_admin_get_activity: {
        Args: { p_event_type?: string; p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          event_type: string
          id: string
        }[]
      }
      super_admin_get_award_invites: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          award_type: string
          created_at: string
          created_by_user_id: string
          credit_months: number
          custom_message: string
          expires_at: string
          id: string
          plan: string
          reason: string
          recipient_email: string
          status: string
        }[]
      }
      super_admin_get_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_plan?: string
          p_search?: string
        }
        Returns: {
          avatar_url: string
          created_at: string
          days_inactive: number
          email: string
          full_name: string
          org_count: number
          plan: string
          primary_org_id: string
          primary_org_name: string
          subscription_status: string
          user_id: string
        }[]
      }
      super_admin_get_feature_flags: {
        Args: never
        Returns: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string
        }[]
      }
      super_admin_get_organizations: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          admin_grant_ends_at: string
          admin_grant_plan: string
          created_at: string
          effective_plan: string
          member_count: number
          org_id: string
          org_name: string
          org_slug: string
          plan: string
          plan_status: string
          workspace_count: number
        }[]
      }
      super_admin_grant_org_award: {
        Args: { p_months: number; p_org_id: string }
        Returns: boolean
      }
      super_admin_grant_org_vip: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      super_admin_revoke_award_invite: {
        Args: { p_invite_id: string }
        Returns: boolean
      }
      super_admin_revoke_org_grant: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      super_admin_set_feature_flag: {
        Args: { p_enabled: boolean; p_key: string }
        Returns: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "app_feature_flags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      table_sort_field_keys: { Args: never; Returns: string[] }
      toggle_comment_reaction: {
        Args: { target_comment_id: string; target_emoji: string }
        Returns: {
          reactions: Json
        }[]
      }
      touch_project: {
        Args: { target_project_id: string; target_user_id?: string }
        Returns: undefined
      }
      trash_cards: { Args: { target_card_ids: string[] }; Returns: undefined }
      trash_project: { Args: { target_project_id: string }; Returns: undefined }
      unarchive_cards: {
        Args: { target_card_ids: string[] }
        Returns: undefined
      }
      unarchive_project: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      unlink_card_from_pr: {
        Args: { target_card_id: string; target_pr_id: string }
        Returns: undefined
      }
      unlink_card_from_release: {
        Args: { target_card_id: string; target_release_id: string }
        Returns: undefined
      }
      unlink_sprint_from_release: {
        Args: { target_release_id: string; target_sprint_id: string }
        Returns: undefined
      }
      unpin_wiki_page: { Args: { target_page_id: string }; Returns: undefined }
      update_canvas_element: {
        Args: {
          target_content?: string
          target_element_id: string
          target_height?: number
          target_is_resolved?: boolean
          target_path_data?: string
          target_style?: Json
          target_url?: string
          target_width?: number
          target_x?: number
          target_y?: number
          target_z_index?: number
        }
        Returns: {
          content: string | null
          created_at: string
          created_by: string | null
          element_type: string
          height: number
          id: string
          is_resolved: boolean
          path_data: string | null
          project_view_id: string
          style: Json
          updated_at: string
          url: string | null
          width: number
          x: number
          y: number
          z_index: number
        }
        SetofOptions: {
          from: "*"
          to: "canvas_elements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_card: {
        Args: {
          target_body_json?: Json
          target_body_md?: string
          target_card_id: string
          target_completed_at?: string
          target_due_at?: string
          target_effort?: number
          target_initiative_changed?: boolean
          target_initiative_id?: string
          target_priority_option_id?: string
          target_start_at?: string
          target_status_option_id?: string
          target_tags?: string[]
          target_title: string
        }
        Returns: {
          assignee_name: string
          assignee_user_id: string
          body_json: Json
          body_md: string
          card_id: string
          completed_at: string
          created_at: string
          custom_field_values: Json
          due_at: string
          effort: number
          group_id: string
          group_position: number
          initiative_id: string
          priority_option_id: string
          sprint_id: string
          start_at: string
          status_option_id: string
          status_position: number
          tags: string[]
          title: string
        }[]
      }
      update_initiative: {
        Args: {
          target_description?: string
          target_health?: Database["public"]["Enums"]["initiative_health"]
          target_initiative_id: string
          target_lead_user_id?: string
          target_name?: string
          target_status?: Database["public"]["Enums"]["initiative_status"]
          target_target_date?: string
          target_visibility?: Database["public"]["Enums"]["resource_access"]
        }
        Returns: undefined
      }
      update_organization: {
        Args: { target_name: string; target_org_id: string }
        Returns: undefined
      }
      update_plan_view_config: {
        Args: { target_config_json: Json; target_view_id: string }
        Returns: undefined
      }
      update_project_automation: {
        Args: {
          target_actions?: Json
          target_automation_id: string
          target_condition_clauses?: Json
          target_status?: string
          target_trigger_config?: Json
          target_trigger_type?: string
        }
        Returns: {
          actions: Json
          broken_reason: string
          condition_clauses: Json
          created_at: string
          created_by_user_id: string
          id: string
          is_broken: boolean
          position: number
          project_id: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by_user_id: string
        }[]
      }
      update_project_sprint: {
        Args: {
          target_end_date?: string
          target_goal?: string
          target_name?: string
          target_sprint_id: string
          target_start_date?: string
        }
        Returns: undefined
      }
      update_release: {
        Args: {
          target_ab_variations?: string
          target_actual_date?: string
          target_build_number?: string
          target_clear_ab_variations?: boolean
          target_clear_actual_date?: boolean
          target_clear_build_number?: boolean
          target_clear_planned_date?: boolean
          target_clear_release_notes?: boolean
          target_clear_retro_notes?: boolean
          target_clear_retro_url?: boolean
          target_force_upgrade?: boolean
          target_name?: string
          target_planned_date?: string
          target_release_id: string
          target_release_notes?: string
          target_retro_notes?: string
          target_retro_url?: string
        }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      update_release_checklist: {
        Args: { target_checklist_json: Json; target_release_id: string }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      update_release_health: {
        Args: {
          target_new_health: Database["public"]["Enums"]["release_health"]
          target_release_id: string
        }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      update_release_notes: {
        Args: { target_notes_json: Json; target_release_id: string }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      update_release_status: {
        Args: {
          target_new_status: Database["public"]["Enums"]["release_status"]
          target_release_id: string
        }
        Returns: {
          ab_variations: string
          actual_date: string
          archived_at: string
          build_number: string
          checklist_completed_count: number
          checklist_items: Json
          checklist_total_count: number
          created_at: string
          created_by_user_id: string
          drift: number
          force_upgrade: boolean
          health: Database["public"]["Enums"]["release_health"]
          id: string
          linked_card_count: number
          linked_sprint_count: number
          name: string
          note_sections: Json
          plan_view_id: string
          planned_date: string
          position: number
          release_notes: string
          retro_notes: string
          retro_url: string
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
        }[]
      }
      update_roadmap_item: {
        Args: {
          target_color?: string
          target_end_period?: string
          target_initiative_id?: string
          target_item_id: string
          target_label?: string
          target_lane_id?: string
          target_start_period?: string
        }
        Returns: undefined
      }
      update_roadmap_lane: {
        Args: {
          target_color?: string
          target_group?: string
          target_lane_id: string
          target_title?: string
        }
        Returns: undefined
      }
      update_roadmap_milestone: {
        Args: {
          target_color?: string
          target_date?: string
          target_label?: string
          target_lane_id?: string
          target_milestone_id: string
          target_type?: Database["public"]["Enums"]["roadmap_milestone_type"]
        }
        Returns: undefined
      }
      update_scorecard_item: {
        Args: {
          target_clear_description?: boolean
          target_clear_linked_release_id?: boolean
          target_clear_linked_roadmap_item_id?: boolean
          target_composite_score?: number
          target_description?: string
          target_item_id: string
          target_linked_release_id?: string
          target_linked_roadmap_item_id?: string
          target_scores_json?: Json
          target_title?: string
          target_tracked?: boolean
        }
        Returns: {
          composite_score: number
          created_at: string
          description: string
          id: string
          linked_release_id: string
          linked_release_name: string
          linked_roadmap_item_id: string
          linked_roadmap_item_label: string
          plan_view_id: string
          position: number
          scores: Json
          title: string
          tracked: boolean
          updated_at: string
        }[]
      }
      update_wiki_page: {
        Args: {
          expected_version?: number
          target_content_json?: Json
          target_content_md?: string
          target_icon?: string
          target_page_id: string
          target_parent_page_id?: string
          target_position?: number
          target_status?: string
          target_title?: string
        }
        Returns: {
          page_id: string
          page_slug: string
          page_status: string
          page_title: string
          page_updated_at: string
          page_version: number
          version_entry_created_at: string
          version_entry_id: string
          version_entry_version: number
        }[]
      }
      upsert_commit_daily_rollup: {
        Args: {
          target_activity_date: string
          target_commit_count: number
          target_repo_id: string
        }
        Returns: undefined
      }
      upsert_current_profile: {
        Args: {
          target_avatar_url?: string
          target_full_name?: string
          target_github_login?: string
        }
        Returns: undefined
      }
      upsert_document_presence: {
        Args: { target_document_id: string; target_state?: string }
        Returns: {
          document_id: string
          last_seen_at: string
          state: string
          user_id: string
        }[]
      }
      upsert_roadmap_matrix_cell: {
        Args: {
          target_content_text: string
          target_lane_id: string
          target_period_key: string
          target_plan_view_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      custom_field_type: "text" | "number" | "date" | "single_select"
      initiative_health: "on_track" | "at_risk" | "off_track"
      initiative_status:
        | "planned"
        | "active"
        | "completed"
        | "paused"
        | "cancelled"
      organization_role: "admin" | "member" | "guest"
      plan_view_type: "roadmap" | "releases" | "scorecard"
      project_view_type:
        | "overview"
        | "table"
        | "kanban"
        | "gantt"
        | "document"
        | "github"
        | "canvas"
      release_health: "on_track" | "at_risk" | "blocked"
      release_status:
        | "draft"
        | "planned"
        | "in_progress"
        | "released"
        | "archived"
      resource_access: "open" | "private"
      roadmap_item_type: "bar" | "phase"
      roadmap_milestone_type: "diamond" | "circle" | "flag"
      scope_access_role: "admin" | "member" | "guest"
      sprint_status: "planned" | "active" | "completed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      custom_field_type: ["text", "number", "date", "single_select"],
      initiative_health: ["on_track", "at_risk", "off_track"],
      initiative_status: [
        "planned",
        "active",
        "completed",
        "paused",
        "cancelled",
      ],
      organization_role: ["admin", "member", "guest"],
      plan_view_type: ["roadmap", "releases", "scorecard"],
      project_view_type: [
        "overview",
        "table",
        "kanban",
        "gantt",
        "document",
        "github",
        "canvas",
      ],
      release_health: ["on_track", "at_risk", "blocked"],
      release_status: [
        "draft",
        "planned",
        "in_progress",
        "released",
        "archived",
      ],
      resource_access: ["open", "private"],
      roadmap_item_type: ["bar", "phase"],
      roadmap_milestone_type: ["diamond", "circle", "flag"],
      scope_access_role: ["admin", "member", "guest"],
      sprint_status: ["planned", "active", "completed"],
    },
  },
} as const
