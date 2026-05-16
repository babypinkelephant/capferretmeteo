import { api } from '../api.js';

export const renderTische = async (container) => {
    container.innerHTML = `
        <div class="grid-2" id="tische-grid">
            <!-- Tische injected here -->
        </div>
        
        <!-- Bottom Sheet Overlay -->
        <div class="bottom-sheet-overlay" id="sheet-overlay"></div>
        
        <!-- Bottom Sheet -->
        <div class="bottom-sheet" id="order-sheet">
            <div class="bottom-sheet-header">
                <h3 id="sheet-title">Tisch X</h3>
                <button class="btn btn-primary" id="sheet-close" style="width: auto; padding: 8px 16px;">Schliessen</button>
            </div>
            <div class="bottom-sheet-content">
                <div id="sheet-loading" class="text-center mb-3 hidden"><span class="loader"></span></div>
                
                <div id="existing-orders" class="mb-4">
                    <h4 class="mb-2 text-muted">Bisherige Bestellungen</h4>
                    <div id="existing-orders-list">Keine offenen Bestellungen.</div>
                </div>
                
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px;">
                
                <div id="new-order" class="mb-4">
                    <h4 class="mb-2 text-muted">Neue Artikel hinzufügen</h4>
                    <div id="menu-list" class="mb-3">
                        <!-- Menu items injected here -->
                    </div>
                    <button class="btn btn-success" id="submit-order-btn">Bestellen</button>
                </div>
            </div>
        </div>
    `;

    const grid = document.getElementById('tische-grid');
    for (let i = 1; i <= 10; i++) {
        const card = document.createElement('div');
        card.className = 'card text-center';
        card.style.height = '100px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.justifyContent = 'center';
        card.style.alignItems = 'center';
        card.style.cursor = 'pointer';
        card.innerHTML = `<span class="large-amount">${i}</span><span class="text-muted">Tisch</span>`;
        card.addEventListener('click', () => openSheet(i));
        grid.appendChild(card);
    }

    const overlay = document.getElementById('sheet-overlay');
    const sheet = document.getElementById('order-sheet');
    const closeBtn = document.getElementById('sheet-close');
    
    let currentTisch = null;
    let menuData = null;
    let currentCart = {}; // item.id -> quantity

    const closeSheet = () => {
        overlay.classList.remove('active');
        sheet.classList.remove('active');
        currentTisch = null;
        currentCart = {};
    };

    overlay.addEventListener('click', closeSheet);
    closeBtn.addEventListener('click', closeSheet);

    let startY = 0;
    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
        if (e.changedTouches[0].clientY - startY > 50) closeSheet();
    });

    const openSheet = async (tischNummer) => {
        currentTisch = tischNummer;
        document.getElementById('sheet-title').textContent = `Tisch ${tischNummer}`;
        document.getElementById('sheet-loading').classList.remove('hidden');
        document.getElementById('existing-orders-list').innerHTML = '';
        document.getElementById('menu-list').innerHTML = '';
        currentCart = {};
        
        overlay.classList.add('active');
        sheet.classList.add('active');

        try {
            if (!menuData) {
                const response = await api.getMenu();
                menuData = response.data; 
            }

            // Fetch all orders and filter locally because the backend requires exact match
            const ordersResponse = await api.getOrders();
            const allOrders = ordersResponse.data || [];
            const tableOrders = allOrders.filter(o => 
                String(o.Tisch_Nr || o.tisch) === String(tischNummer) && 
                (o.Status === 'Neu' || o.Status === 'Bestätigt' || o.status === 'Neu' || o.status === 'Bestätigt')
            );

            renderExistingOrders(tableOrders);
            renderMenu();
        } catch (error) {
            console.error(error);
            document.getElementById('existing-orders-list').innerHTML = `<p class="text-danger">Fehler beim Laden.</p>`;
        } finally {
            document.getElementById('sheet-loading').classList.add('hidden');
        }
    };

    const renderExistingOrders = (orders) => {
        const container = document.getElementById('existing-orders-list');
        if (orders.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine offenen Bestellungen.</p>';
            return;
        }
        
        let html = '';
        orders.forEach(o => {
            const orderStatus = o.Status || o.status || 'Unbekannt';
            const orderMenge = o.Menge || o.menge || 1;
            const orderArtikelId = o.Artikel_ID || o.artikel;
            
            let orderName = orderArtikelId;
            if (menuData) {
                const menuItem = menuData.find(m => String(m.id || m.Artikel_ID || m.artikel_id) === String(orderArtikelId));
                if (menuItem) orderName = menuItem.name || menuItem.Name || orderArtikelId;
            }

            const statusColor = orderStatus === 'Bestätigt' ? 'var(--color-success)' : '#fff';
            const statusBg = orderStatus === 'Bestätigt' ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.1)';
            html += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                    <span>${orderMenge}x ${orderName}</span>
                    <span style="font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; background: ${statusBg}; color: ${statusColor};">${orderStatus}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    };

    const renderMenu = () => {
        const container = document.getElementById('menu-list');
        if (!menuData || menuData.length === 0) {
            container.innerHTML = '<p class="text-muted">Menü konnte nicht geladen werden.</p>';
            return;
        }

        container.innerHTML = menuData.map(item => {
            const itemId = item.id || item.Artikel_ID || item.artikel_id;
            const itemName = item.name || item.Name;
            const itemPreis = item.preis || item.Preis;
            
            return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px;">
                <div>
                    <div class="font-bold">${itemName}</div>
                    <div class="text-muted text-sm">CHF ${parseFloat(itemPreis).toFixed(2)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button class="btn qty-btn" data-id="${itemId}" data-action="minus" style="padding: 8px; width: 32px; height: 32px; border-radius: 8px;">-</button>
                    <span id="qty-${itemId}" style="width: 20px; text-align: center;">0</span>
                    <button class="btn qty-btn" data-id="${itemId}" data-action="plus" style="padding: 8px; width: 32px; height: 32px; border-radius: 8px;">+</button>
                </div>
            </div>
        `}).join('');

        container.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const action = e.currentTarget.dataset.action;
                currentCart[id] = currentCart[id] || 0;
                if (action === 'plus') currentCart[id]++;
                if (action === 'minus' && currentCart[id] > 0) currentCart[id]--;
                document.getElementById(`qty-${id}`).textContent = currentCart[id];
            });
        });
    };

    document.getElementById('submit-order-btn').addEventListener('click', async (e) => {
        const activeItems = Object.keys(currentCart).filter(id => currentCart[id] > 0);
        if (activeItems.length === 0) return;

        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loader" style="border-top-color:#000;"></span>';
        btn.disabled = true;

        try {
            // Backend addOrder function takes tischNr, artikelId, menge
            for (const artikelId of activeItems) {
                const menge = currentCart[artikelId];
                await api.addOrder(currentTisch, artikelId, menge);
            }
            
            closeSheet();
            alert('Bestellung erfolgreich gesendet!');
        } catch (error) {
            alert('Fehler beim Bestellen: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
};
