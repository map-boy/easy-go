import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { registerPush } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  full_name: string;
  phone_number: string;
  district: string;
  location: string;
  user_category: 'sender' | 'receiver' | 'motari';
  role: 'sender' | 'receiver' | 'driver';
  is_banned?: boolean;
  is_active?: boolean;
  avatar_url?: string;
}

interface AuthContextType {
  user: any;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phone: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata: any) => Promise<any>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true,
  signIn: async () => {},
  signInWithPhone: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
    setLoading(false);
    // Register push notifications
    if (data?.id) registerPush(data.id, supabase).catch(() => {});
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // Phone login — looks up email from profiles table, signs in behind the scenes
  // FREE — no SMS, no Twilio, no cost at all
  async function signInWithPhone(phone: string, password: string) {
    // Step 1: find profile by phone number
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone_number', phone)
      .maybeSingle();

    if (profErr || !prof) {
      throw new Error('No account found with this phone number. Please sign up first.');
    }

    // Step 2: get the email linked to this account using our SQL function
    const { data: email, error: fnErr } = await supabase
      .rpc('get_email_by_user_id', { uid: prof.id });

    if (fnErr || !email) {
      throw new Error('Could not retrieve account. Please use email login instead.');
    }

    // Step 3: sign in with email + password (no SMS needed)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email as string,
      password,
    });

    if (signInErr) {
      throw new Error('Wrong password. Please try again.');
    }
  }

  async function signUp(email: string, password: string, metadata: any) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;

    // data.user exists even before email confirmation
    // We upsert so it works whether confirmed or not
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id:            data.user.id,
        full_name:     metadata.full_name     || '',
        phone_number:  metadata.phone_number  || '',
        district:      metadata.district      || '',
        location:      metadata.location      || '',
        user_category: metadata.user_category || 'sender',
        role:          metadata.role          || (metadata.user_category === 'motari' ? 'driver' : metadata.user_category),
        is_active:     true,
      }, { onConflict: 'id' });

      if (profileError) throw profileError;
    }

    return data.user;
  }

  async function refreshProfile() {
    if (!user) return;
    await loadProfile(user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signInWithPhone, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);