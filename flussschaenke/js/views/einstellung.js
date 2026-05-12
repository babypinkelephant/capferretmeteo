import { state } from '../state.js';
import { router } from '../router.js';

export const renderEinstellung = async (container) => {
    container.innerHTML = `
        <div class="card" style="margin-top: 20px;">
            <h3 class="mb-3">Konto & Einstellungen</h3>
            <p class="text-muted mb-4">Du bist angemeldet und berechtigt, das System zu nutzen.</p>
            
            <button class="btn btn-danger" id="logout-btn" style="background-color: var(--color-danger); color: white;">Abmelden</button>
        </div>
    `;

    document.getElementById('logout-btn').addEventListener('click', () => {
        state.clearToken();
        router.navigate('/login');
    });
};
