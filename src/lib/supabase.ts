import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          puzzles_solved: number;
          current_streak: number;
          longest_streak: number;
          total_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          puzzles_solved?: number;
          current_streak?: number;
          longest_streak?: number;
          total_points?: number;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      puzzles: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          grid: any;
          robot_start: any;
          function_lengths: any;
          allowed_instructions: string[];
          category: string;
          difficulty: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['puzzles']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['puzzles']['Insert']>;
      };
      solutions: {
        Row: {
          id: string;
          user_id: string;
          puzzle_id: string;
          program: any;
          steps: number;
          instructions_used: number;
          completed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['solutions']['Row'], 'id' | 'completed_at'>;
        Update: Partial<Database['public']['Tables']['solutions']['Insert']>;
      };
      daily_challenges: {
        Row: {
          id: string;
          date: string;
          puzzle_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['daily_challenges']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['daily_challenges']['Insert']>;
      };
      daily_leaderboard: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          instructions_used: number;
          steps: number;
          points: number;
          completed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['daily_leaderboard']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['daily_leaderboard']['Insert']>;
      };
      user_progress: {
        Row: {
          user_id: string;
          tutorial_completed: number[];
          classic_solved: string[];
          daily_solved: string[];
          speed_preference: number | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_progress']['Row'], 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_progress']['Insert']>;
      };
      saved_simulation_configs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          saved_at: number;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          saved_at: number;
          config: Record<string, unknown>;
        };
        Update: Partial<Database['public']['Tables']['saved_simulation_configs']['Insert']>;
      };
    };
  };
}
