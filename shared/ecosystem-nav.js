/**
 * GFD Ecosystem Navigation Component JavaScript
 * Handles dropdown toggle, accessibility, and keyboard navigation
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEcosystemNav);
    } else {
        initEcosystemNav();
    }

    function initEcosystemNav() {
        const nav = document.querySelector('.gfd-ecosystem-nav');
        if (!nav) return;

        const toggleButton = nav.querySelector('.ecosystem-toggle');
        const dropdown = nav.querySelector('.ecosystem-dropdown');
        let backdrop = document.querySelector('.ecosystem-backdrop');

        // Create backdrop if it doesn't exist
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'ecosystem-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            document.body.appendChild(backdrop);
        }

        if (!toggleButton || !dropdown) return;

        let isOpen = false;

        // Toggle dropdown
        function toggleDropdown(open) {
            isOpen = typeof open === 'boolean' ? open : !isOpen;

            dropdown.classList.toggle('active', isOpen);
            backdrop.classList.toggle('active', isOpen);
            nav.classList.toggle('menu-open', isOpen);
            toggleButton.setAttribute('aria-expanded', isOpen);
            dropdown.setAttribute('aria-hidden', !isOpen);
            dropdown.inert = !isOpen;

            if (isOpen) {
                // Focus first link when opening
                const firstLink = dropdown.querySelector('.nav-link');
                if (firstLink) {
                    setTimeout(() => firstLink.focus(), 100);
                }
            }
        }

        // Toggle button click
        toggleButton.addEventListener('click', () => {
            toggleDropdown();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) {
                toggleDropdown(false);
                toggleButton.focus();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (isOpen && !nav.contains(e.target)) {
                toggleDropdown(false);
            }
        });

        // Close when clicking backdrop
        backdrop.addEventListener('click', () => {
            if (isOpen) {
                toggleDropdown(false);
                toggleButton.focus();
            }
        });

        // Keyboard navigation within dropdown
        const navLinks = dropdown.querySelectorAll('.nav-link, .nav-cta-link');

        dropdown.addEventListener('keydown', (e) => {
            if (!isOpen) return;

            const focusedIndex = Array.from(navLinks).indexOf(document.activeElement);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = (focusedIndex + 1) % navLinks.length;
                navLinks[nextIndex].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = (focusedIndex - 1 + navLinks.length) % navLinks.length;
                navLinks[prevIndex].focus();
            } else if (e.key === 'Home') {
                e.preventDefault();
                navLinks[0].focus();
            } else if (e.key === 'End') {
                e.preventDefault();
                navLinks[navLinks.length - 1].focus();
            }
        });

        // Highlight current site
        const currentHostname = window.location.hostname;
        navLinks.forEach(link => {
            try {
                const linkHostname = new URL(link.href).hostname;
                if (linkHostname === currentHostname) {
                    link.classList.add('current-site');
                    link.setAttribute('aria-current', 'page');

                    // Add visual indicator
                    link.style.background = 'rgba(139, 92, 246, 0.12)';
                    link.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        // Track engagement for analytics
        toggleButton.addEventListener('click', () => {
            if (window.gtag) {
                window.gtag('event', 'ecosystem_nav_toggle', {
                    'event_category': 'Navigation',
                    'event_label': isOpen ? 'Open' : 'Close'
                });
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.gtag) {
                    const destination = link.querySelector('.nav-link-title')?.textContent || 'Unknown';
                    window.gtag('event', 'ecosystem_nav_click', {
                        'event_category': 'Navigation',
                        'event_label': destination,
                        'transport_type': 'beacon'
                    });
                }
            });
        });
    }
})();
