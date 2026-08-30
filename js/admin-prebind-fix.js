/* NAF — proteção do arranque do Admin
   Cria apenas os elementos técnicos que uma versão antiga do admin.js
   espera encontrar. Não cria novas funcionalidades. */
(() => {
  'use strict';
  const ids = [
    ['btn-refresh','button'],['btn-refresh-list','button'],['member-search','input'],
    ['member-status','select'],['btn-select-all','button'],['btn-clear-selection','button'],
    ['members-body','tbody'],['btn-send-overdue-selected','button'],
    ['btn-send-document','button'],['btn-parse-pdf','button'],['btn-import-pdf','button'],
    ['btn-funlearn-pdf','button'],['btn-funlearn-add','button'],['btn-funlearn-remove','button'],
    ['admin-result','div'],['admin-login-warning','section'],['admin-app','section'],
    ['admin-permissions-list','div'],['admin-photo-input','input']
  ];
  function ensure(){
    for(const [id,tag] of ids){
      if(document.getElementById(id)) continue;
      const el=document.createElement(tag);
      el.id=id;
      if(tag==='input') el.type='file';
      el.hidden=true;
      el.setAttribute('data-naf-compat','1');
      document.body.appendChild(el);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensure,{once:true});
  else ensure();
})();
