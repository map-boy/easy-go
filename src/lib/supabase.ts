import { createClient } from '@supabase/supabase-js';

// --- CHANGE THESE TWO LINES BELOW ---
const supabaseUrl = 'https://oqlrpjoentqxlfotmyat.supabase.co'; // <--- Put your real URL here
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xbHJwam9lbnRxeGxmb3RteWF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDY5NjYsImV4cCI6MjA4NzIyMjk2Nn0.VyhYzQXtw4XjkyCDGbLOXJLVOz-L3hVAfTprdgSKetQ';     // <--- Put your real Key here
// -------------------------------------
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

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
          role: 'sender' | 'receiver' | 'driver'; // Added role
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
      // Added missing table for your Notification Bell
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          read: boolean;
          created_at: string;
        };
      };
      // Added missing table for Motari Food/Shop orders
      food_orders: {
        Row: {
          id: string;
          customer_id: string;
          driver_id: string | null;
          items: any; // JSONB
          total_price: number;
          status: string;
          delivery_address: string;
          created_at: string;
        };
      };
    };
  };
};