/* Consolidated runtime: intentionally small. No global MutationObserver, no DOM injection, no duplicate Drº Árbitro implementation. */
(() => {
  'use strict';
  const boot=()=>window.NAF_GET_SHARED_SUPABASE?.();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
