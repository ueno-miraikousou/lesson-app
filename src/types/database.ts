/**
 * Supabase 繝・・繝悶Ν縺ｮ蝙句ｮ夂ｾｩ (DDL 縺九ｉ謇区嶌縺・縲・ *
 * 蟆・擂逧・↓縺ｯ `supabase gen types typescript` 縺ｧ閾ｪ蜍慕函謌舌↓蛻・ｊ譖ｿ縺医ｋ縲・ * 迴ｾ譎らせ縺ｧ縺ｯ DDL 繝輔ぃ繧､繝ｫ `supabase/migrations/0001_initial_schema.sql` 繧呈ｭ｣譛ｬ縺ｨ縺励※
 * 謇区嶌縺阪〒蜷梧悄縺吶ｋ縲・DL 繧貞､画峩縺励◆繧峨％縺ｮ繝輔ぃ繧､繝ｫ繧よ峩譁ｰ縺吶ｋ縺薙→縲・ *
 * Supabase TypeScript 隕冗ｴ・
 *   - Row: SELECT 邨先棡縺ｮ蝙・ *   - Insert: INSERT 譎ゅ・蝙・(DEFAULT 蛟､縺後≠繧九き繝ｩ繝縺ｯ Optional)
 *   - Update: UPDATE 譎ゅ・蝙・(蜈ｨ繧ｫ繝ｩ繝 Optional)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRole = 'child' | 'parent' | 'other';
export type MemberGender = 'female' | 'male' | 'unspecified';
export type RoleInHousehold = 'owner' | 'member';
export type PaymentStatus = 'pending' | 'paid' | 'skipped';

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          auth_user_id: string;
          role_in_household: RoleInHousehold;
          joined_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          auth_user_id: string;
          role_in_household: RoleInHousehold;
          joined_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          auth_user_id?: string;
          role_in_household?: RoleInHousehold;
          joined_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          birth_date: string | null;
          gender: MemberGender | null;
          role: MemberRole;
          color_hex: string;
          notifications_muted: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          birth_date?: string | null;
          gender?: MemberGender | null;
          role: MemberRole;
          color_hex?: string;
          notifications_muted?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          birth_date?: string | null;
          gender?: MemberGender | null;
          role?: MemberRole;
          color_hex?: string;
          notifications_muted?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          member_id: string;
          name: string;
          classroom_name: string | null;
          location: string | null;
          monthly_fee: number | null;
          notifications_muted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          name: string;
          classroom_name?: string | null;
          location?: string | null;
          monthly_fee?: number | null;
          notifications_muted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          name?: string;
          classroom_name?: string | null;
          location?: string | null;
          monthly_fee?: number | null;
          notifications_muted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedules: {
        Row: {
          id: string;
          lesson_id: string;
          start_at: string;
          end_at: string;
          recurrence_rule: string | null;
          recurrence_until: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          start_at: string;
          end_at: string;
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          start_at?: string;
          end_at?: string;
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          lesson_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedule_item_checks: {
        Row: {
          id: string;
          schedule_id: string;
          item_id: string;
          occurrence_date: string;
          checked: boolean;
          checked_at: string | null;
          checked_by_member: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          item_id: string;
          occurrence_date: string;
          checked?: boolean;
          checked_at?: string | null;
          checked_by_member?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string;
          item_id?: string;
          occurrence_date?: string;
          checked?: boolean;
          checked_at?: string | null;
          checked_by_member?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      household_invitations: {
        Row: {
          id: string;
          household_id: string;
          code_short: string;
          code_long: string;
          expires_at: string;
          used_at: string | null;
          used_by_auth_user_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          code_short: string;
          code_long: string;
          expires_at: string;
          used_at?: string | null;
          used_by_auth_user_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          code_short?: string;
          code_long?: string;
          expires_at?: string;
          used_at?: string | null;
          used_by_auth_user_id?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          lesson_id: string;
          year_month: string;
          amount: number | null;
          paid_at: string | null;
          status: PaymentStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          year_month: string;
          amount?: number | null;
          paid_at?: string | null;
          status?: PaymentStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          year_month?: string;
          amount?: number | null;
          paid_at?: string | null;
          status?: PaymentStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          id: string;
          auth_user_id: string;
          reminder_day_before_enabled: boolean;
          reminder_day_before_time: string;
          reminder_same_day_enabled: boolean;
          reminder_same_day_minutes: number;
          include_items_in_notification: boolean;
          skip_when_all_items_checked: boolean;
          lock_screen_privacy_mode: boolean;
          sound_enabled: boolean;
          celebration_sound_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          reminder_day_before_enabled?: boolean;
          reminder_day_before_time?: string;
          reminder_same_day_enabled?: boolean;
          reminder_same_day_minutes?: number;
          include_items_in_notification?: boolean;
          skip_when_all_items_checked?: boolean;
          lock_screen_privacy_mode?: boolean;
          sound_enabled?: boolean;
          celebration_sound_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          reminder_day_before_enabled?: boolean;
          reminder_day_before_time?: string;
          reminder_same_day_enabled?: boolean;
          reminder_same_day_minutes?: number;
          include_items_in_notification?: boolean;
          skip_when_all_items_checked?: boolean;
          lock_screen_privacy_mode?: boolean;
          sound_enabled?: boolean;
          celebration_sound_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

/** 繧医￥菴ｿ縺・す繝ｧ繝ｼ繝医き繝・ヨ */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Household = Tables<'households'>;
export type HouseholdMember = Tables<'household_members'>;
export type Member = Tables<'members'>;
export type Lesson = Tables<'lessons'>;
export type Schedule = Tables<'schedules'>;
export type Item = Tables<'items'>;
export type ScheduleItemCheck = Tables<'schedule_item_checks'>;
export type HouseholdInvitation = Tables<'household_invitations'>;
export type Payment = Tables<'payments'>;
export type NotificationPreferences = Tables<'notification_preferences'>;
