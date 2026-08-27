/* NAF Marques Bom — Drº Árbitro: evitar dupla renderização no Admin */
(() => {
  'use strict';
  function clean(){
    const admin=document.getElementById('panel-dr-arbitro');
    if(!admin) return;
    const integrated=admin.querySelector('#dr-arbitro-admin-integrado');
    if(integrated) integrated.remove();
  }
  function run(){
    clean();
    const panel=document.getElementById('panel-dr-arbitro');
    if(panel){
      const obs=new MutationObserver(clean);
      obs.observe(panel,{childList:true,subtree:true});
      setTimeout(clean,50); setTimeout(clean,300); setTimeout(clean,1000);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
