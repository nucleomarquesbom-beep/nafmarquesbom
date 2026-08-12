/*
 * NÚCLEO MARQUES BOM — carregador seguro do Drº Árbitro
 *
 * Não altera o dr-arbitro.js existente.
 * Aguarda que admin.js termine a autenticação e só depois
 * carrega o módulo Drº Árbitro. Isto elimina a condição de corrida
 * que existia entre os dois scripts.
 */
(() => {
  'use strict';

  if (window.__NAF_DR_ARBITRO_LOADER_STARTED) return;
  window.__NAF_DR_ARBITRO_LOADER_STARTED = true;

  const SCRIPT_ID = 'naf-dr-arbitro-module';

  function loadModule() {
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'js/dr-arbitro.js';
    script.async = false;
    script.onload = () => {
      console.info('[Drº Árbitro] módulo carregado depois da inicialização do administrador.');
    };
    script.onerror = () => {
      console.error('[Drº Árbitro] não foi possível carregar js/dr-arbitro.js');
    };

    document.body.appendChild(script);
  }

  function ready() {
    const app = document.getElementById('admin-app');

    /*
     * admin.js só torna #admin-app visível depois de autenticar
     * e validar o administrador. Portanto, este é o ponto seguro
     * para carregar o módulo.
     */
    if (app && !app.hidden) {
      loadModule();
      return true;
    }

    return false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (ready()) return;

      const timer = setInterval(() => {
        if (ready()) clearInterval(timer);
      }, 100);

      setTimeout(() => clearInterval(timer), 15000);
    }, { once: true });
  } else {
    if (ready()) return;

    const timer = setInterval(() => {
      if (ready()) clearInterval(timer);
    }, 100);

    setTimeout(() => clearInterval(timer), 15000);
  }
})();
