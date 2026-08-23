import { api } from '../api.js';
import { state } from '../state.js';

export const renderBestellungen = async (container) => {
    api.startPolling();
    container.innerHTML = `
        <div id="bestellungen-list"></div>
    `;

    const renderList = (allOrders) => {
        const orders = allOrders.filter(o => 
            (o.Status === 'Neu' || o.status === 'Neu') &&
            state.isOrderFromSelectedDate(o.Zeitstempel || o.zeitstempel)
        );
        const listContainer = document.getElementById('bestellungen-list');
        if (!listContainer) return;
        
        if (orders.length === 0) {
            listContainer.innerHTML = `<p class="text-center text-muted mt-4">Keine neuen Bestellungen.</p>`;
            return;
        }

        const html = orders.map(o => `
            <div class="card mb-3" id="order-${o.Bestell_ID || o.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <div class="font-bold" style="font-size: 1.2rem;">${o.Menge || o.menge}x ${o.Name || o.name || o.artikel}</div>
                        <div class="text-muted">Tisch ${o.Tisch_Nr || o.tisch}</div>
                    </div>
                    <div style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px;">Neu</div>
                </div>
                <button class="btn btn-success confirm-btn" data-id="${o.Bestell_ID || o.id}">Als Serviert markieren</button>
            </div>
        `).join('');

        listContainer.innerHTML = html;

        document.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                api.updateOrderStatus(id, 'Serviert');
            });
        });
    };

    // 1. Sofort mit Cache rendern (Zero Delay)
    renderList(api._orders || []);

    // 2. Bei jedem Update automatisch neu zeichnen
    api.onOrdersUpdated((newOrders) => {
        renderList(newOrders);
    });

    // 3. Optionaler Trigger für Background-Fetch (ohne await)
    api.fetchOrders().catch(() => {
        const listContainer = document.getElementById('bestellungen-list');
        if (listContainer) {
            listContainer.innerHTML = `<p class="text-center text-danger mt-4">Fehler beim Laden.</p>`;
        }
    });
};
