import { api } from '../api.js';
import { state } from '../state.js';

export const renderLogin = async (container) => {
    container.innerHTML = `
        <div class="card" style="margin-top: 40px;">
            <h2 class="mb-3 text-center">Login</h2>
            <form id="login-form">
                <input type="email" id="login-email" placeholder="Email" required autocomplete="email">
                <input type="password" id="login-password" placeholder="Passwort" required autocomplete="current-password">
                <div id="login-error" class="text-danger mb-2 text-center hidden"></div>
                <button type="submit" class="btn btn-primary" id="login-btn">
                    Anmelden
                </button>
            </form>
        </div>
    `;

    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loader"></span>';
        btn.disabled = true;

        try {
            const result = await api.login(email, password);
            console.log("Login Backend Response:", result);
            
            // Allow login if status is success, even if backend forgets to send a token
            if (result.status === 'success') {
                state.setToken(result.token || 'valid-session-token');
                window.location.hash = '/';
            } else {
                throw new Error('Login fehlgeschlagen. Server antwortete: ' + JSON.stringify(result));
            }
        } catch (error) {
            errorDiv.textContent = error.message || 'Login fehlgeschlagen. Bitte prüfe deine Zugangsdaten.';
            errorDiv.classList.remove('hidden');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
};
