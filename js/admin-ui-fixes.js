/* NAF Marques Bom — integração final do Admin */
(() => {
  'use strict';
  const isAdminPage=()=>/(^|\/)admin\.html$/i.test(location.pathname)||/(^|\/)admin\/?$/i.test(location.pathname);
  function setupQuotaTab(){
    const tab=document.getElementById('tab-quotas'),panel=document.getElementById('panel-quotas');
    if(!tab||!panel)return;
    panel.classList.add('admin-tab-panel');panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-quotas');panel.hidden=!tab.classList.contains('active');
    if(tab.dataset.quotaUiBound!=='1'){
      tab.dataset.quotaUiBound='1';
      tab.addEventListener('click',()=>requestAnimationFrame(()=>{panel.hidden=!tab.classList.contains('active');}));
    }
    document.querySelectorAll('.admin-tab').forEach(other=>{
      if(other===tab||other.dataset.quotaOtherBound==='1')return;
      other.dataset.quotaOtherBound='1';other.addEventListener('click',()=>requestAnimationFrame(()=>{panel.hidden=!tab.classList.contains('active');}));
    });
  }
  function removeAdminDrDuplicate(){
    if(!isAdminPage())return;
    const official=document.getElementById('panel-dr-arbitro');if(!official)return;
    document.querySelectorAll('#dr-arbitro-admin-integrado').forEach(el=>el.remove());
  }
  function init(){
    if(!isAdminPage())return;setupQuotaTab();removeAdminDrDuplicate();
    const observer=new MutationObserver(()=>{setupQuotaTab();removeAdminDrDuplicate();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
