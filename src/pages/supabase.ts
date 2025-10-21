export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      deliveries: {
        Row: {
          address: string
          coordinates: Json | null
          created_at: string
          id: string
          is_urgent: boolean
          priority: number
          type: string
        }
        Insert: {
          address: string
          coordinates?: Json | null
          created_at?: string
          id?: string
          is_urgent?: boolean
          priority?: number
          type?: string
        }
        Update: {
          address?: string
          coordinates?: Json | null
          created_at?: string
          id?: string
          is_urgent?: boolean
          priority?: number
          type?: string
        }
        Relationships: []
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