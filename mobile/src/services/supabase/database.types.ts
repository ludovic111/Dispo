export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collaborations: {
        Row: {
          a_id: string;
          b_id: string;
          created_at: string;
        };
        Insert: {
          a_id: string;
          b_id: string;
          created_at?: string;
        };
        Update: {
          a_id?: string;
          b_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collaborations_a_id_fkey';
            columns: ['a_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collaborations_b_id_fkey';
            columns: ['b_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          participant_a: string;
          participant_b: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          participant_a: string;
          participant_b: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          participant_a?: string;
          participant_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_participant_a_fkey';
            columns: ['participant_a'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_participant_b_fkey';
            columns: ['participant_b'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      event_attendance: {
        Row: {
          event_id: string;
          profile_id: string;
          responded_at: string;
          status: string;
        };
        Insert: {
          event_id: string;
          profile_id: string;
          responded_at?: string;
          status: string;
        };
        Update: {
          event_id?: string;
          profile_id?: string;
          responded_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_attendance_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'group_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_attendance_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      gig_applications: {
        Row: {
          created_at: string;
          gig_id: string;
          id: string;
          instrument: string | null;
          message: string;
          musician_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          gig_id: string;
          id?: string;
          instrument?: string | null;
          message?: string;
          musician_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          gig_id?: string;
          id?: string;
          instrument?: string | null;
          message?: string;
          musician_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'gig_applications_gig_id_fkey';
            columns: ['gig_id'];
            isOneToOne: false;
            referencedRelation: 'gig_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_applications_gig_id_fkey';
            columns: ['gig_id'];
            isOneToOne: false;
            referencedRelation: 'gig_requests_feed';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_applications_musician_id_fkey';
            columns: ['musician_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      gig_requests: {
        Row: {
          auto_sos_absent_profile_id: string | null;
          created_at: string;
          date: string;
          description: string;
          event_id: string | null;
          fee: number | null;
          filled_instruments: string[];
          genre: string;
          group_id: string | null;
          host_id: string;
          id: string;
          neighborhood: string;
          payment_method: string | null;
          place: string;
          posted_at: string;
          public_location_label: string;
          target_id: string | null;
          target_status: string | null;
          title: string;
          wanted_instruments: string[];
          wanted_levels: string[] | null;
        };
        Insert: {
          auto_sos_absent_profile_id?: string | null;
          created_at?: string;
          date: string;
          description?: string;
          event_id?: string | null;
          fee?: number | null;
          filled_instruments?: string[];
          genre: string;
          group_id?: string | null;
          host_id: string;
          id?: string;
          neighborhood?: string;
          payment_method?: string | null;
          place?: string;
          posted_at?: string;
          public_location_label?: string;
          target_id?: string | null;
          target_status?: string | null;
          title: string;
          wanted_instruments?: string[];
          wanted_levels?: string[] | null;
        };
        Update: {
          auto_sos_absent_profile_id?: string | null;
          created_at?: string;
          date?: string;
          description?: string;
          event_id?: string | null;
          fee?: number | null;
          filled_instruments?: string[];
          genre?: string;
          group_id?: string | null;
          host_id?: string;
          id?: string;
          neighborhood?: string;
          payment_method?: string | null;
          place?: string;
          posted_at?: string;
          public_location_label?: string;
          target_id?: string | null;
          target_status?: string | null;
          title?: string;
          wanted_instruments?: string[];
          wanted_levels?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'gig_requests_auto_sos_absent_profile_id_fkey';
            columns: ['auto_sos_absent_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'group_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_docs: {
        Row: {
          added_by: string | null;
          created_at: string;
          ext: string;
          group_id: string;
          id: string;
          instrument: string | null;
          path: string;
          song_id: string | null;
          title: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          ext?: string;
          group_id: string;
          id?: string;
          instrument?: string | null;
          path: string;
          song_id?: string | null;
          title: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          ext?: string;
          group_id?: string;
          id?: string;
          instrument?: string | null;
          path?: string;
          song_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_docs_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_docs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      group_events: {
        Row: {
          created_at: string;
          date: string;
          group_id: string;
          id: string;
          kind: string;
          public_location_label: string;
          recurrence: string | null;
          reminder_lead_days: number | null;
          series_id: string | null;
          setlist: Json;
          title: string;
          venue: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          group_id: string;
          id?: string;
          kind: string;
          public_location_label?: string;
          recurrence?: string | null;
          reminder_lead_days?: number | null;
          series_id?: string | null;
          setlist?: Json;
          title: string;
          venue?: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          group_id?: string;
          id?: string;
          kind?: string;
          public_location_label?: string;
          recurrence?: string | null;
          reminder_lead_days?: number | null;
          series_id?: string | null;
          setlist?: Json;
          title?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_events_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      group_invitations: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          invited_by: string | null;
          kind: string;
          profile_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          invited_by?: string | null;
          kind?: string;
          profile_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          invited_by?: string | null;
          kind?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_invitations_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_invitations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          kind: string;
          profile_id: string;
          role: string | null;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          kind?: string;
          profile_id: string;
          role?: string | null;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          kind?: string;
          profile_id?: string;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          message_id: string;
          profile_id: string;
          removed_at: string | null;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          message_id: string;
          profile_id: string;
          removed_at?: string | null;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          message_id?: string;
          profile_id?: string;
          removed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'group_message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'group_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_message_reactions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_messages: {
        Row: {
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          group_id: string;
          id: string;
          sender_id: string;
          text: string;
        };
        Insert: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id: string;
          id?: string;
          sender_id: string;
          text: string;
        };
        Update: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id?: string;
          id?: string;
          sender_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_messages_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_file_cleanup: {
        Row: {
          created_at: string;
          owner_id: string;
          path: string;
        };
        Insert: {
          created_at?: string;
          owner_id: string;
          path: string;
        };
        Update: {
          created_at?: string;
          owner_id?: string;
          path?: string;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          message_id: string;
          profile_id: string;
          removed_at: string | null;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          message_id: string;
          profile_id: string;
          removed_at?: string | null;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          message_id?: string;
          profile_id?: string;
          removed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          delivered_at: string | null;
          edited_at: string | null;
          id: string;
          read_at: string | null;
          sender_id: string;
          text: string;
        };
        Insert: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          delivered_at?: string | null;
          edited_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender_id: string;
          text: string;
        };
        Update: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          delivered_at?: string | null;
          edited_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      music_groups: {
        Row: {
          auto_sos_enabled: boolean;
          auto_sos_min_level: string | null;
          created_at: string;
          emoji: string;
          id: string;
          is_public: boolean;
          leader_id: string;
          name: string;
          photo_url: string | null;
          repertoire: Json;
          updated_at: string;
        };
        Insert: {
          auto_sos_enabled?: boolean;
          auto_sos_min_level?: string | null;
          created_at?: string;
          emoji?: string;
          id?: string;
          is_public?: boolean;
          leader_id: string;
          name: string;
          photo_url?: string | null;
          repertoire?: Json;
          updated_at?: string;
        };
        Update: {
          auto_sos_enabled?: boolean;
          auto_sos_min_level?: string | null;
          created_at?: string;
          emoji?: string;
          id?: string;
          is_public?: boolean;
          leader_id?: string;
          name?: string;
          photo_url?: string | null;
          repertoire?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'music_groups_leader_id_fkey';
            columns: ['leader_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      music_school_memberships: {
        Row: {
          id: string;
          is_primary: boolean;
          joined_at: string;
          left_at: string | null;
          profile_id: string;
          role: string;
          role_label: string | null;
          school_id: string;
          status: string;
          updated_at: string;
          verification_level: string;
          visibility: string;
        };
        Insert: {
          id?: string;
          is_primary?: boolean;
          joined_at?: string;
          left_at?: string | null;
          profile_id: string;
          role?: string;
          role_label?: string | null;
          school_id: string;
          status?: string;
          updated_at?: string;
          verification_level?: string;
          visibility?: string;
        };
        Update: {
          id?: string;
          is_primary?: boolean;
          joined_at?: string;
          left_at?: string | null;
          profile_id?: string;
          role?: string;
          role_label?: string | null;
          school_id?: string;
          status?: string;
          updated_at?: string;
          verification_level?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'music_school_memberships_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'music_school_memberships_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'music_schools';
            referencedColumns: ['id'];
          },
        ];
      };
      music_schools: {
        Row: {
          city: string;
          country_code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_verified: boolean;
          logo_url: string | null;
          name: string;
          short_name: string | null;
          slug: string;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          city: string;
          country_code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_verified?: boolean;
          logo_url?: string | null;
          name: string;
          short_name?: string | null;
          slug: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          city?: string;
          country_code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_verified?: boolean;
          logo_url?: string | null;
          name?: string;
          short_name?: string | null;
          slug?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      profile_locations: {
        Row: {
          latitude: number;
          longitude: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          latitude: number;
          longitude: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          latitude?: number;
          longitude?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_locations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          age: number | null;
          availability_places: Json;
          available_dates: string[];
          bio: string;
          city: string | null;
          country: string | null;
          created_at: string;
          demo_videos: Json;
          genres: string[];
          id: string;
          instrument_levels: Json;
          instruments: string[];
          is_admin: boolean;
          is_demo: boolean;
          is_premium: boolean;
          is_showcase: boolean;
          latitude: number | null;
          level: string;
          location_precision: string;
          longitude: number | null;
          name: string;
          neighborhood: string;
          photo_url: string | null;
          postal_code: string | null;
          rating_avg: number | null;
          rating_count: number;
          repertoire: string[];
          socials: Json;
          updated_at: string;
        };
        Insert: {
          age?: number | null;
          availability_places?: Json;
          available_dates?: string[];
          bio?: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          demo_videos?: Json;
          genres?: string[];
          id: string;
          instrument_levels?: Json;
          instruments?: string[];
          is_admin?: boolean;
          is_demo?: boolean;
          is_premium?: boolean;
          is_showcase?: boolean;
          latitude?: number | null;
          level?: string;
          location_precision?: string;
          longitude?: number | null;
          name?: string;
          neighborhood?: string;
          photo_url?: string | null;
          postal_code?: string | null;
          rating_avg?: number | null;
          rating_count?: number;
          repertoire?: string[];
          socials?: Json;
          updated_at?: string;
        };
        Update: {
          age?: number | null;
          availability_places?: Json;
          available_dates?: string[];
          bio?: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          demo_videos?: Json;
          genres?: string[];
          id?: string;
          instrument_levels?: Json;
          instruments?: string[];
          is_admin?: boolean;
          is_demo?: boolean;
          is_premium?: boolean;
          is_showcase?: boolean;
          latitude?: number | null;
          level?: string;
          location_precision?: string;
          longitude?: number | null;
          name?: string;
          neighborhood?: string;
          photo_url?: string | null;
          postal_code?: string | null;
          rating_avg?: number | null;
          rating_count?: number;
          repertoire?: string[];
          socials?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_devices: {
        Row: {
          app_version: string;
          created_at: string;
          environment: string;
          groups_enabled: boolean;
          id: string;
          last_seen_at: string;
          locale: string;
          messages_enabled: boolean;
          notifications_enabled: boolean;
          platform: string;
          sos_enabled: boolean;
          token: string;
          user_id: string;
        };
        Insert: {
          app_version?: string;
          created_at?: string;
          environment: string;
          groups_enabled?: boolean;
          id?: string;
          last_seen_at?: string;
          locale?: string;
          messages_enabled?: boolean;
          notifications_enabled?: boolean;
          platform?: string;
          sos_enabled?: boolean;
          token: string;
          user_id: string;
        };
        Update: {
          app_version?: string;
          created_at?: string;
          environment?: string;
          groups_enabled?: boolean;
          id?: string;
          last_seen_at?: string;
          locale?: string;
          messages_enabled?: boolean;
          notifications_enabled?: boolean;
          platform?: string;
          sos_enabled?: boolean;
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_notifications: {
        Row: {
          actor_id: string | null;
          attempts: number;
          body: string;
          category: string;
          created_at: string;
          data: Json;
          delivery_claim_id: string | null;
          delivery_claimed_at: string | null;
          failed_at: string | null;
          id: string;
          last_error: string | null;
          read_at: string | null;
          sent_at: string | null;
          source_id: string;
          source_table: string;
          title: string;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          attempts?: number;
          body: string;
          category: string;
          created_at?: string;
          data?: Json;
          delivery_claim_id?: string | null;
          delivery_claimed_at?: string | null;
          failed_at?: string | null;
          id?: string;
          last_error?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          source_id: string;
          source_table: string;
          title: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          attempts?: number;
          body?: string;
          category?: string;
          created_at?: string;
          data?: Json;
          delivery_claim_id?: string | null;
          delivery_claimed_at?: string | null;
          failed_at?: string | null;
          id?: string;
          last_error?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          source_id?: string;
          source_table?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ratings: {
        Row: {
          created_at: string;
          rated_id: string;
          rater_id: string;
          stars: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          rated_id: string;
          rater_id: string;
          stars: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          rated_id?: string;
          rater_id?: string;
          stars?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ratings_rated_id_fkey';
            columns: ['rated_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ratings_rater_id_fkey';
            columns: ['rater_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          message_id: string | null;
          message_snapshot: Json | null;
          reason: string;
          reported_id: string;
          reporter_id: string;
          school_message_id: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id?: string | null;
          message_snapshot?: Json | null;
          reason: string;
          reported_id: string;
          reporter_id: string;
          school_message_id?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string | null;
          message_snapshot?: Json | null;
          reason?: string;
          reported_id?: string;
          reporter_id?: string;
          school_message_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reported_id_fkey';
            columns: ['reported_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_school_message_id_fkey';
            columns: ['school_message_id'];
            isOneToOne: false;
            referencedRelation: 'school_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      school_channels: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'school_channels_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: true;
            referencedRelation: 'music_schools';
            referencedColumns: ['id'];
          },
        ];
      };
      school_messages: {
        Row: {
          channel_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          sender_id: string;
          text: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          sender_id: string;
          text: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          sender_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'school_messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'school_channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'school_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      song_comments: {
        Row: {
          author_id: string | null;
          created_at: string;
          group_id: string;
          id: string;
          song_id: string;
          text: string;
        };
        Insert: {
          author_id?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          song_id: string;
          text: string;
        };
        Update: {
          author_id?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          song_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'song_comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'song_comments_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      gig_requests_feed: {
        Row: {
          date: string | null;
          description: string | null;
          event_id: string | null;
          fee: number | null;
          filled_instruments: string[] | null;
          genre: string | null;
          group_id: string | null;
          host_id: string | null;
          id: string | null;
          is_locked: boolean | null;
          neighborhood: string | null;
          payment_method: string | null;
          place: string | null;
          posted_at: string | null;
          public_location_label: string | null;
          target_id: string | null;
          target_status: string | null;
          title: string | null;
          wanted_instruments: string[] | null;
          wanted_levels: string[] | null;
        };
        Insert: {
          date?: string | null;
          description?: never;
          event_id?: string | null;
          fee?: never;
          filled_instruments?: string[] | null;
          genre?: string | null;
          group_id?: string | null;
          host_id?: string | null;
          id?: string | null;
          is_locked?: never;
          neighborhood?: never;
          payment_method?: never;
          place?: never;
          posted_at?: string | null;
          public_location_label?: never;
          target_id?: string | null;
          target_status?: string | null;
          title?: never;
          wanted_instruments?: string[] | null;
          wanted_levels?: string[] | null;
        };
        Update: {
          date?: string | null;
          description?: never;
          event_id?: string | null;
          fee?: never;
          filled_instruments?: string[] | null;
          genre?: string | null;
          group_id?: string | null;
          host_id?: string | null;
          id?: string | null;
          is_locked?: never;
          neighborhood?: never;
          payment_method?: never;
          place?: never;
          posted_at?: string | null;
          public_location_label?: never;
          target_id?: string | null;
          target_status?: string | null;
          title?: never;
          wanted_instruments?: string[] | null;
          wanted_levels?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'gig_requests_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'group_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'music_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gig_requests_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      accept_gig_application: {
        Args: { application_id: string };
        Returns: undefined;
      };
      accept_group_invitation: {
        Args: { invitation_id: string };
        Returns: undefined;
      };
      apply_approved_song_order: {
        Args: { p_items: Json; p_song_ids: string[] };
        Returns: Json;
      };
      apply_revenuecat_premium_state: {
        Args: {
          p_checked_at: string;
          p_is_premium: boolean;
          p_profile_id: string;
        };
        Returns: boolean;
      };
      begin_push_notification_attempt: {
        Args: { p_claim_id: string; p_notification_id: string };
        Returns: number;
      };
      can_create_music_group: { Args: never; Returns: boolean };
      can_see_full_gig: {
        Args: { gig: Database['public']['Tables']['gig_requests']['Row'] };
        Returns: boolean;
      };
      cancel_group_events: { Args: { p_event_ids: string[] }; Returns: number };
      claim_pending_push_notifications: {
        Args: {
          p_actor_id: string;
          p_claim_id: string;
          p_created_since: string;
          p_limit?: number;
        };
        Returns: {
          attempts: number;
          body: string;
          category: string;
          created_at: string;
          data: Json;
          delivery_claim_id: string;
          id: string;
          title: string;
          user_id: string;
        }[];
      };
      cockpit_stats: { Args: never; Returns: Json };
      complete_message_file_cleanup: {
        Args: { p_path: string };
        Returns: undefined;
      };
      create_auto_sos: {
        Args: {
          p_absent_profile_id: string;
          p_description: string;
          p_event_id: string;
          p_instrument: string;
          p_title: string;
        };
        Returns: {
          created: boolean;
          gig_id: string;
        }[];
      };
      decline_gig_application: {
        Args: { application_id: string };
        Returns: undefined;
      };
      delete_group_message: { Args: { p_message: string }; Returns: string };
      delete_message: { Args: { p_message: string }; Returns: string };
      delete_my_account: { Args: never; Returns: undefined };
      delete_school_message: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      edit_group_message: {
        Args: { p_message: string; p_text: string };
        Returns: undefined;
      };
      edit_message: {
        Args: { p_message: string; p_text: string };
        Returns: undefined;
      };
      edit_school_message: {
        Args: { p_message_id: string; p_text: string };
        Returns: undefined;
      };
      get_gig_request_location: {
        Args: { p_gig_id: string };
        Returns: {
          city: string;
          country_code: string;
          exact_address: string;
          gig_id: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          public_location_label: string;
        }[];
      };
      get_group_event_location: {
        Args: { p_event_id: string };
        Returns: {
          city: string;
          country_code: string;
          event_id: string;
          exact_address: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          public_location_label: string;
        }[];
      };
      is_conversation_member: { Args: { conv_id: string }; Returns: boolean };
      is_group_leader: { Args: { p_group_id: string }; Returns: boolean };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      join_music_school: {
        Args: {
          p_role?: string;
          p_role_label?: string;
          p_school_id: string;
          p_visibility?: string;
        };
        Returns: {
          id: string;
          is_primary: boolean;
          joined_at: string;
          left_at: string | null;
          profile_id: string;
          role: string;
          role_label: string | null;
          school_id: string;
          status: string;
          updated_at: string;
          verification_level: string;
          visibility: string;
        };
        SetofOptions: {
          from: '*';
          to: 'music_school_memberships';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      leave_music_school: { Args: { p_school_id: string }; Returns: boolean };
      mark_conversation_read: { Args: { conv_id: string }; Returns: undefined };
      mark_messages_delivered: { Args: never; Returns: undefined };
      merge_event_setlist_snapshot: {
        Args: {
          p_desired_songs: Json;
          p_event_id: string;
          p_original_songs: Json;
        };
        Returns: Json;
      };
      merge_group_repertoire_snapshot: {
        Args: {
          p_desired_songs: Json;
          p_group_id: string;
          p_original_songs: Json;
        };
        Returns: Json;
      };
      merge_song_array_snapshot: {
        Args: { p_current: Json; p_desired_songs: Json; p_original_songs: Json };
        Returns: Json;
      };
      music_school_members: {
        Args: { p_school_id: string };
        Returns: {
          instruments: string[];
          is_primary: boolean;
          joined_at: string;
          level: string;
          name: string;
          photo_url: string;
          profile_id: string;
          role: string;
          role_label: string;
          verification_level: string;
        }[];
      };
      my_event_guests: {
        Args: never;
        Returns: {
          event_id: string;
          gig_id: string;
          group_id: string;
          instrument: string;
          musician_id: string;
          name: string;
          photo_url: string;
        }[];
      };
      my_group_invitations: {
        Args: never;
        Returns: {
          created_at: string;
          group_emoji: string;
          group_id: string;
          group_name: string;
          group_photo_url: string;
          id: string;
          invited_by_name: string;
          kind: string;
        }[];
      };
      my_music_schools: {
        Args: never;
        Returns: {
          channel_id: string;
          city: string;
          country_code: string;
          is_primary: boolean;
          is_verified: boolean;
          joined_at: string;
          logo_url: string;
          member_count: number;
          membership_id: string;
          name: string;
          role: string;
          role_label: string;
          school_id: string;
          short_name: string;
          slug: string;
          verification_level: string;
          visibility: string;
        }[];
      };
      normalize_song_array_uuid_casing: {
        Args: { p_items: Json };
        Returns: Json;
      };
      notify_group_event_moved: {
        Args: { p_dates?: number; p_event_id: string };
        Returns: undefined;
      };
      prepare_my_message_file_cleanup: { Args: never; Returns: undefined };
      profile_music_schools: {
        Args: { p_profile_id: string };
        Returns: {
          city: string;
          is_primary: boolean;
          is_verified: boolean;
          joined_at: string;
          logo_url: string;
          membership_id: string;
          name: string;
          profile_id: string;
          role: string;
          role_label: string;
          school_id: string;
          short_name: string;
          slug: string;
          verification_level: string;
          visibility: string;
        }[];
      };
      profile_public_groups: {
        Args: { target: string };
        Returns: {
          emoji: string;
          id: string;
          is_leader: boolean;
          member_count: number;
          name: string;
          photo_url: string;
        }[];
      };
      queue_message_file_cleanup: {
        Args: { p_path: string };
        Returns: undefined;
      };
      recent_group_messages: {
        Args: { p_limit?: number };
        Returns: {
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          group_id: string;
          id: string;
          sender_id: string;
          text: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'group_messages';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      recent_messages: {
        Args: { p_limit?: number };
        Returns: {
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          delivered_at: string | null;
          edited_at: string | null;
          id: string;
          read_at: string | null;
          sender_id: string;
          text: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      recent_school_messages: {
        Args: { p_limit?: number };
        Returns: {
          channel_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          sender_id: string;
          text: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'school_messages';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      refresh_gig_filled_instruments: {
        Args: { p_gig: string };
        Returns: undefined;
      };
      release_push_notification_claim: {
        Args: { p_claim_id: string };
        Returns: number;
      };
      reopen_gig_application: {
        Args: { application_id: string };
        Returns: undefined;
      };
      reorder_event_setlist: {
        Args: { p_event_id: string; p_song_ids: string[] };
        Returns: Json;
      };
      reorder_group_repertoire: {
        Args: { p_group_id: string; p_song_ids: string[] };
        Returns: Json;
      };
      respond_to_direct_gig: {
        Args: { p_accept: boolean; p_gig: string };
        Returns: undefined;
      };
      save_group_events_with_locations: {
        Args: { p_events: Json; p_group_id: string; p_mode?: string };
        Returns: undefined;
      };
      send_school_message: {
        Args: { p_channel_id: string; p_text: string };
        Returns: {
          channel_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          sender_id: string;
          text: string;
        };
        SetofOptions: {
          from: '*';
          to: 'school_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_gig_request_location: {
        Args: {
          p_city?: string;
          p_clear_exact_address?: boolean;
          p_country_code?: string;
          p_exact_address?: string;
          p_gig_id: string;
          p_latitude?: number;
          p_longitude?: number;
          p_postal_code?: string;
          p_public_location_label: string;
        };
        Returns: undefined;
      };
      set_group_event_location: {
        Args: {
          p_city?: string;
          p_clear_exact_address?: boolean;
          p_country_code?: string;
          p_event_id: string;
          p_exact_address?: string;
          p_latitude?: number;
          p_longitude?: number;
          p_postal_code?: string;
          p_public_location_label: string;
        };
        Returns: undefined;
      };
      set_group_message_reaction: {
        Args: { p_emoji: string; p_message: string };
        Returns: undefined;
      };
      set_group_song_solos: {
        Args: { p_group_id: string; p_profile_ids: string[]; p_song_id: string };
        Returns: undefined;
      };
      set_message_reaction: {
        Args: { p_emoji: string; p_message: string };
        Returns: undefined;
      };
      transfer_group_leadership: {
        Args: { p_group_id: string; p_new_leader_id: string };
        Returns: undefined;
      };
      try_uuid: { Args: { value: string }; Returns: string };
      verify_push_worker_token: { Args: { p_token: string }; Returns: boolean };
      viewer_is_pro: { Args: never; Returns: boolean };
      visible_gig_request_locations: {
        Args: never;
        Returns: {
          city: string;
          country_code: string;
          exact_address: string;
          gig_id: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          public_location_label: string;
        }[];
      };
      visible_group_event_locations: {
        Args: never;
        Returns: {
          city: string;
          country_code: string;
          event_id: string;
          exact_address: string;
          latitude: number;
          longitude: number;
          postal_code: string;
          public_location_label: string;
        }[];
      };
      visible_profile_music_schools: {
        Args: never;
        Returns: {
          city: string;
          is_primary: boolean;
          is_verified: boolean;
          joined_at: string;
          logo_url: string;
          membership_id: string;
          name: string;
          profile_id: string;
          role: string;
          role_label: string;
          school_id: string;
          short_name: string;
          slug: string;
          verification_level: string;
          visibility: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
