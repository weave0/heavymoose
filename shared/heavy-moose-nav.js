(function () {
    'use strict';

    var panels = Array.prototype.slice.call(document.querySelectorAll('.hm-menu-panel'));
    var toggles = Array.prototype.slice.call(document.querySelectorAll('.hm-menu-toggle[data-panel]'));

    if (!panels.length || !toggles.length) {
        return;
    }

    function getToggleForPanel(panelId) {
        return toggles.find(function (toggle) {
            return toggle.getAttribute('data-panel') === panelId;
        });
    }

    function closePanel(panel) {
        if (!panel) {
            return;
        }

        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');

        var toggle = getToggleForPanel(panel.id);
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
        }
    }

    function closeAllPanels(exceptId) {
        panels.forEach(function (panel) {
            if (!exceptId || panel.id !== exceptId) {
                closePanel(panel);
            }
        });

        var hasOpenPanel = panels.some(function (panel) {
            return panel.classList.contains('is-open');
        });

        document.body.classList.toggle('hm-menu-open', hasOpenPanel && window.innerWidth <= 560);
    }

    function openPanel(panel) {
        if (!panel) {
            return;
        }

        closeAllPanels(panel.id);
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');

        var toggle = getToggleForPanel(panel.id);
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
        }

        document.body.classList.toggle('hm-menu-open', window.innerWidth <= 560);
    }

    toggles.forEach(function (toggle) {
        toggle.addEventListener('click', function () {
            var panelId = toggle.getAttribute('data-panel');
            var panel = document.getElementById(panelId);
            if (!panel) {
                return;
            }

            var isOpen = panel.classList.contains('is-open');
            if (isOpen) {
                closeAllPanels();
            } else {
                openPanel(panel);
            }
        });
    });

    document.addEventListener('click', function (event) {
        var clickedInsidePanel = panels.some(function (panel) {
            return panel.contains(event.target);
        });

        var clickedToggle = toggles.some(function (toggle) {
            return toggle.contains(event.target);
        });

        if (!clickedInsidePanel && !clickedToggle) {
            closeAllPanels();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeAllPanels();
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 560) {
            document.body.classList.remove('hm-menu-open');
        }
        closeAllPanels();
    });
})();
