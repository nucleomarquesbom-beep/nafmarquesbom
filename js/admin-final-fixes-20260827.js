/* NAF Marques Bom — correções administrativas 27/08/2026 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  function hidePhotoControls(){
    document.querySelectorAll('.member-photo-open,[data-member-photo],#admin-photo-input').forEach(el=>{
      if(el.id==='admin-photo-input') el.remove();
      else el.remove();
    });
  }

  function improveNumberButton(){
    document.querySelectorAll('.member-number-open').forEach(btn=>{
      if(btn.dataset.nafNumberFix==='1') return;
      btn.dataset.nafNumberFix='1';
      btn.title='Alterar número de sócio';
    });
  }

  function run(){
    hidePhotoControls();
    improveNumberButton();
  }

  // The member table is rendered dynamically by admin.js.
  const observer=new MutationObserver(run);
  observer.observe(document.body,{childList:true,subtree:true});
  run();
})();
