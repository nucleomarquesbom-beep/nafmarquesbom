// Cliente Supabase único partilhado pelos módulos da área de sócios.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const existing = window.__NAF_SUPABASE || window.supabaseClient;
export const supabase = existing || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.__NAF_SUPABASE = supabase;
window.supabaseClient = supabase;
