/* NAF Marques Bom — navegação hamburger em ecrãs pequenos.
   A navegação de desktop permanece igual; em mobile usa um painel acessível. */
(() => {
  'use strict';

  function setupMobileNavigation(header) {
    if (!header || header.dataset.mobileNavReady === '1') return;
    const nav = header.querySelector('nav');
    const logo = header.querySelector('.logo, a.logo');
    const container = nav?.parentElement;
    if (!nav || !container || !logo) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-nav-toggle';
    button.setAttribute('aria-label', 'Abrir menu de navegação');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'naf-main-navigation');
    button.innerHTML = '<span class="mobile-nav-toggle-lines" aria-hidden="true"><span></span><span></span><span></span></span><span class="mobile-nav-toggle-label">Menu</span>';

    if (!nav.id) nav.id = 'naf-main-navigation';
    nav.setAttribute('aria-label', 'Navegação principal');
    logo.insertAdjacentElement('afterend', button);

    const close = () => {
      nav.classList.remove('mobile-nav-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Abrir menu de navegação');
      button.classList.remove('is-open');
    };
    const open = () => {
      nav.classList.add('mobile-nav-open');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', 'Fechar menu de navegação');
      button.classList.add('is-open');
    };

    button.addEventListener('click', () => {
      nav.classList.contains('mobile-nav-open') ? close() : open();
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close();
        button.focus();
      }
    });
    document.addEventListener('click', event => {
      if (!header.contains(event.target)) close();
    });
    window.addEventListener('resize', () => {
      if (window.matchMedia('(min-width: 901px)').matches) close();
    });
    header.dataset.mobileNavReady = '1';
  }

  const init = () => document.querySelectorAll('header').forEach(setupMobileNavigation);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();