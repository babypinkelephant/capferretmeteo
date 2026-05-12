import { api } from '../api.js';

export const renderBestellungen = async (container) => {
    container.innerHTML = `
        <div id="loading" class="text-center mt-4"><span class="loader"></span></div>
        <div id="bestellungen-list"></div>
    `;

    try {
        const response = await api.getOrders('Neu');
        const orders = response.data || [];
        
        if (orders.length === 0) {
            document.getElementById('bestellungen-list').innerHTML = `<p class="text-center text-muted mt-4">Keine neuen Bestellungen.</p>`;
            document.getElementById('loading').classList.add('hidden');
            return;
        }

        const html = orders.map(o => `
            <div class="card mb-3" id="order-${o.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <div class="font-bold" style="font-size: 1.2rem;">${o.menge}x ${o.artikel}</div>
                        <div class="text-muted">Tisch ${o.tisch}</div>
                    </div>
                    <div style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px;">Neu</div>
                </div>
                <button class="btn btn-success confirm-btn" data-id="${o.id}">Als Bestätigt markieren</button>
            </div>
        `).join('');

        document.getElementById('bestellungen-list').innerHTML = html;
        document.getElementById('loading').classList.add('hidden');

        document.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const button = e.currentTarget;
                const originalText = button.innerHTML;
                button.innerHTML = '<span class="loader" style="border-top-color:#000; width: 16px; height: 16px;"></span>';
                button.disabled = true;

                try {
                    await api.updateOrderStatus(id, 'Bestätigt');
                    const orderCard = document.getElementById(`order-${id}`);
                    if(orderCard) {
                        orderCard.remove();
                    }
                    // Check if empty
                    if (document.getElementById('bestellungen-list').children.length === 0) {
                        document.getElementById('bestellungen-list').innerHTML = `<p class="text-center text-muted mt-4">Keine neuen Bestellungen.</p>`;
                    }
                } catch (error) {
                    alert('Fehler: ' + error.message);
                    button.innerHTML = originalText;
                    button.disabled = false;
                }
            });
        });

    } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('bestellungen-list').innerHTML = `<p class="text-center text-danger mt-4">Fehler beim Laden.</p>`;
    }
};
