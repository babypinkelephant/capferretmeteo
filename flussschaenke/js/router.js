import { state } from './state.js';
import { bottomNav } from './components/bottomNav.js';

import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderTische } from './views/tische.js';
import { renderBestellungen } from './views/bestellungen.js';
import { renderKasse } from './views/kasse.js';
import { renderEinstellung } from './views/einstellung.js';

const routes = {
    '/login': { render: renderLogin, showNav: false, showHeader: false, title: 'Login' },
    '/': { render: renderHome, showNav: false, showHeader: true, title: 'Flussschänke' },
    '/tische': { render: renderTische, showNav: true, showHeader: true, title: 'Tische' },
    '/bestellungen': { render: renderBestellungen, showNav: true, showHeader: true, title: 'Bestellungen' },
    '/kasse': { render: renderKasse, showNav: true, showHeader: true, title: 'Kasse / Abrechnung' },
    '/einstellung': { render: renderEinstellung, showNav: true, showHeader: true, title: 'Einstellung' }
};

export const router = {
    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    navigate(path) {
        window.location.hash = path;
    },

    async handleRoute() {
        let path = window.location.hash.slice(1) || '/';
        
        // Auth Guard
        if (!state.isLoggedIn() && path !== '/login') {
            this.navigate('/login');
            return;
        }
        if (state.isLoggedIn() && path === '/login') {
            this.navigate('/');
            return;
        }

        const route = routes[path] || routes['/'];
        
        // UI Shell Update
        const header = document.getElementById('main-header');
        const headerTitle = header.querySelector('h1');
        const nav = document.getElementById('bottom-nav');
        
        if (route.showHeader) {
            header.classList.remove('hidden');
            headerTitle.textContent = route.title;
        } else {
            header.classList.add('hidden');
        }

        if (route.showNav) {
            nav.classList.remove('hidden');
            bottomNav.render(path);
        } else {
            nav.classList.add('hidden');
        }

        // Render View Container
        const appContent = document.getElementById('app-content');
        appContent.innerHTML = '';
        
        try {
            await route.render(appContent);
        } catch (e) {
            console.error('Error rendering route:', e);
            appContent.innerHTML = `<div class="card text-center"><p class="text-danger">Fehler beim Laden der Ansicht.</p></div>`;
        }
    }
};
