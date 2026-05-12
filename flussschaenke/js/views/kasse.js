import { api } from '../api.js';

export const renderKasse = async (container) => {
    container.innerHTML = `
        <div id="loading" class="text-center mt-4"><span class="loader"></span></div>
        <div id="kasse-content" class="hidden">
            <h3 class="mb-3 text-muted">Aktive Tische (Bestätigt)</h3>
            <div class="grid-2" id="kasse-tische-grid"></div>
        </div>
        
        <!-- Detail Sheet -->
        <div class="bottom-sheet-overlay" id="checkout-overlay"></div>
        <div class="bottom-sheet" id="checkout-sheet">
            <div class="bottom-sheet-header">
                <h3 id="checkout-title">Abrechnung Tisch</h3>
                <button class="btn btn-primary" id="checkout-close" style="width: auto; padding: 8px 16px;">Schliessen</button>
            </div>
            <div class="bottom-sheet-content">
                <div id="checkout-items" class="mb-4"></div>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <span style="font-size: 1.2rem;">Total</span>
                    <span id="checkout-total" class="large-amount" style="margin: 0;">0.00</span>
                </div>
                <div class="mb-4">
                    <label class="text-muted mb-1" style="display: block;">Trinkgeld (CHF)</label>
                    <input type="number" id="checkout-tip" step="0.5" placeholder="0.00">
                </div>
                <button class="btn btn-primary" id="checkout-btn">Abrechnung abschliessen</button>
            </div>
        </div>
    `;

    let allOrders = [];

    try {
        const response = await api.getOrders('Bestätigt');
        allOrders = response.data || [];
        
        const activeTables = [...new Set(allOrders.map(o => o.tisch))];
        
        const grid = document.getElementById('kasse-tische-grid');
        if (activeTables.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1;"><p class="text-center text-muted">Keine abzurechnenden Tische.</p></div>';
        } else {
            activeTables.forEach(tisch => {
                const card = document.createElement('div');
                card.className = 'card text-center';
                card.style.height = '100px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.justifyContent = 'center';
                card.style.alignItems = 'center';
                card.style.cursor = 'pointer';
                card.innerHTML = `<span class="large-amount">${tisch}</span><span class="text-muted">Tisch</span>`;
                card.addEventListener('click', () => openCheckoutSheet(tisch));
                grid.appendChild(card);
            });
        }
        
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('kasse-content').classList.remove('hidden');

    } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        container.innerHTML += `<p class="text-center text-danger">Fehler beim Laden.</p>`;
    }

    const overlay = document.getElementById('checkout-overlay');
    const sheet = document.getElementById('checkout-sheet');
    const closeBtn = document.getElementById('checkout-close');
    let currentTisch = null;

    const closeSheet = () => {
        overlay.classList.remove('active');
        sheet.classList.remove('active');
        currentTisch = null;
    };

    overlay.addEventListener('click', closeSheet);
    closeBtn.addEventListener('click', closeSheet);

    const openCheckoutSheet = (tisch) => {
        currentTisch = tisch;
        const tableOrders = allOrders.filter(o => String(o.tisch) === String(tisch));
        
        document.getElementById('checkout-title').textContent = `Abrechnung Tisch ${tisch}`;
        document.getElementById('checkout-tip').value = '';
        
        let total = 0;
        let itemsHtml = '';
        tableOrders.forEach(o => {
            // Provide defaults in case backend structure is slightly different
            const p = parseFloat(o.preis || 0);
            const m = parseFloat(o.menge || 0);
            const lineTotal = p * m;
            total += lineTotal;
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>${o.menge}x ${o.artikel || o.name}</span>
                    <span>${lineTotal.toFixed(2)}</span>
                </div>
            `;
        });
        
        document.getElementById('checkout-items').innerHTML = itemsHtml;
        document.getElementById('checkout-total').textContent = total.toFixed(2);
        
        overlay.classList.add('active');
        sheet.classList.add('active');
    };

    document.getElementById('checkout-btn').addEventListener('click', async (e) => {
        const tip = document.getElementById('checkout-tip').value || 0;
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loader"></span>';
        btn.disabled = true;

        try {
            await api.checkout(currentTisch, tip);
            closeSheet();
            // Re-render view completely
            renderKasse(container); 
        } catch (error) {
            alert('Fehler bei der Abrechnung: ' + error.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
};
