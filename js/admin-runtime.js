/* Compatibilidade para versões antigas. O runtime oficial é naf-consolidated-runtime.js. */
(() => {
  'use strict';
  if (!window.NAF_GET_SHARED_SUPABASE) {
    window.NAF_GET_SHARED_SUPABASE = () => window.__NAF_SUPABASE || window.supabaseClient || null;
  }
})();
