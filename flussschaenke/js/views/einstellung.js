import { state } from '../state.js';
import { router } from '../router.js';

export const renderEinstellung = async (container) => {
    const dates = ['4.11.2026', '5.11.2026', '6.11.2026', '7.11.2026', '11.11.2026', '12.11.2026', '13.11.2026', '14.11.2026', 'Test-Tag'];
    const selected = state.getSelectedDate();
    
    container.innerHTML = `
        <div class="card" style="margin-top: 20px;">
            <h3 class="mb-3">Konto & Einstellungen</h3>
            <p class="text-muted mb-4">Du bist angemeldet und berechtigt, das System zu nutzen.</p>
            
            <div class="mb-4">
                <label for="pos-date" class="form-label font-bold" style="display:block; margin-bottom: 8px;">POS Datum wählen:</label>
                <select id="pos-date" class="form-control" style="width: 100%; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1);">
                    ${dates.map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <small class="text-muted" style="display:block; margin-top: 4px;">Nur Daten von diesem Tag werden in den anderen Ansichten angezeigt.</small>
            </div>
            
            <button class="btn btn-danger" id="logout-btn" style="background-color: var(--color-danger); color: white; width: 100%;">Abmelden</button>
        </div>
    `;

    document.getElementById('pos-date').addEventListener('change', (e) => {
        state.setSelectedDate(e.target.value);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        state.clearToken();
        router.navigate('/login');
    });
};
