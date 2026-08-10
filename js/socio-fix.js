/*
 * NAF Marques Bom — correção de DOM da área de Quotas
 *
 * IMPORTANTE:
 * - Não altera CSS.
 * - Não altera o layout visual.
 * - Não substitui socio.js.
 * - Corrige versões do socio.html que ficaram com mais do que uma
 *   secção #quotas / #quotas-list.
 *
 * Carregar DEPOIS de js/socio.js.
 */

(() => {
    "use strict";

    function isQuotaSection(element) {
        return (
            element &&
            element.nodeType === 1 &&
            (
                element.matches("#quotas") ||
                element.querySelector?.("#quotas-list")
            )
        );
    }

    function score(section) {
        let value = 0;

        // Preferimos a versão mais completa, caso exista.
        if (section.querySelector("#quota-comprovativo")) value += 10;
        if (section.querySelector("#quota-upload-status")) value += 10;
        if (section.querySelector("#recibos-list")) value += 10;
        if (section.querySelector(".quota-upload-card")) value += 5;

        // A secção simples/antiga só tem a lista.
        if (section.querySelector("#quotas-list")) value += 1;

        return value;
    }

    function fixDuplicateQuotaSections() {
        const sections = [
            ...document.querySelectorAll(".socio-tab-content")
        ].filter(isQuotaSection);

        if (sections.length <= 1) {
            fixDuplicateQuotaLists();
            return;
        }

        // Mantém a secção funcional mais completa.
        sections.sort((a, b) => score(b) - score(a));
        const keep = sections[0];

        for (const section of sections.slice(1)) {
            section.remove();
        }

        // Garante que só existe um alvo para o tab "quotas".
        keep.id = "quotas";

        fixDuplicateQuotaLists();
    }

    function fixDuplicateQuotaLists() {
        const lists = [
            ...document.querySelectorAll("#quotas-list")
        ];

        if (lists.length <= 1) return;

        // Se houver mais de uma lista, mantém a que está dentro
        // da secção #quotas que ficou ativa.
        const quotaSection = document.querySelector(".socio-tab-content#quotas");

        let keep = quotaSection?.querySelector("#quotas-list") || lists[0];

        for (const list of lists) {
            if (list !== keep) list.remove();
        }
    }

    function clearStaleLoadingOnly() {
        /*
         * Não substituímos conteúdo de quotas por dados inventados.
         * Se a aplicação ainda estiver a mostrar "A carregar..." depois
         * de o perfil estar carregado, deixamos o socio.js tratar dos
         * dados. Esta função existe apenas para garantir que um segundo
         * elemento antigo não fica visível.
         */
        fixDuplicateQuotaSections();
    }

    function boot() {
        fixDuplicateQuotaSections();

        // Algumas versões do socio.js montam/mostram o dashboard
        // depois do carregamento inicial.
        const dashboard = document.querySelector("#dashboard");

        if (dashboard) {
            const observer = new MutationObserver(() => {
                fixDuplicateQuotaSections();
            });

            observer.observe(dashboard, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["hidden", "class"]
            });

            window.setTimeout(() => {
                observer.disconnect();
                clearStaleLoadingOnly();
            }, 5000);
        }

        // Corrige também alterações feitas pelo código da aplicação
        // imediatamente após o login.
        window.setTimeout(fixDuplicateQuotaSections, 50);
        window.setTimeout(fixDuplicateQuotaSections, 500);
        window.setTimeout(fixDuplicateQuotaSections, 1500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
