import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone_number: string;
          district: string;
          location: string;
          profile_picture: string;
          user_category: 'sender' | 'receiver' | 'motari';
          is_active: boolean;
          last_activity: string;
          created_at: string;
          updated_at: string;
        };
      };
      drivers: {
        Row: {
          id: string;
          user_id: string;
          plate_number: string;
          is_available: boolean;
          current_location: string;
          total_earnings: number;
          rating: number;
          total_deliveries: number;
          created_at: string;
        };
      };
      orders: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string | null;
          driver_id: string | null;
          sender_name: string;
          sender_number: string;
          sender_location: string;
          sender_district: string;
          receiver_name: string;
          receiver_number: string;
          receiver_location: string;
          receiver_district: string;
          package_size: string;
          package_weight: string;
          package_image: string;
          predicted_price: number;
          final_price: number;
          payment_method: string;
          status: string;
          sender_paid: boolean;
          sender_confirmed: boolean;
          receiver_confirmed: boolean;
          driver_confirmed: boolean;
          backup_message: string;
          emergency_note: string;
          comment: string;
          is_night_delivery: boolean;
          weather_condition: string;
          road_condition: string;
          payer_name: string;
          payer_number: string;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
};
