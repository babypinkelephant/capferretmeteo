import { api } from '../api.js';
import { state } from '../state.js';
import { menuData } from '../data/menu.js';

export const renderKasse = async (container) => {
    api.startPolling();
    container.innerHTML = `
        <div id="loading" class="text-center mt-4"><span class="loader"></span></div>
        <div id="kasse-content" class="hidden">
            <h3 class="mb-3 text-muted">Aktive Tische (Offen/Serviert)</h3>
            <div class="grid-2" id="kasse-tische-grid"></div>
        </div>
        
        <!-- Detail Sheet -->
        <div class="bottom-sheet-overlay" id="checkout-overlay"></div>
        <div class="bottom-sheet" id="checkout-sheet">
            <div class="bottom-sheet-header">
                <h3 id="checkout-title">Abrechnung Tisch</h3>
                <button class="btn btn-primary" id="checkout-close" style="width: auto; padding: 8px 16px;">X</button>
            </div>
            <div class="bottom-sheet-content">
                <div id="checkout-items" class="mb-4"></div>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <span style="font-size: 1.2rem;">Total zu zahlen</span>
                    <span id="checkout-total" class="large-amount" style="margin: 0;">0.00</span>
                </div>
                <div class="mb-4">
                    <label class="text-muted mb-1" style="display: block;">Trinkgeld (CHF)</label>
                    <input type="number" id="checkout-tip" step="0.5" placeholder="0.00">
                </div>
                <button class="btn btn-success" id="checkout-btn" style="width: 100%;">Abrechnung abschliessen</button>
            </div>
        </div>

        <!-- Payment Selection Modal -->
        <div class="bottom-sheet-overlay" id="payment-modal-overlay"></div>
        <div class="bottom-sheet" id="payment-modal-sheet" style="height: auto; max-height: 85vh;">
            <div class="bottom-sheet-header">
                <h3>Zahlungsart wählen</h3>
                <button class="btn btn-primary" id="payment-modal-close" style="width: auto; padding: 8px 16px;">X</button>
            </div>
            <div class="bottom-sheet-content text-center">
                <div id="payment-options-view">
                    <p class="text-muted mb-3">Wie möchte der Gast bezahlen?</p>
                    <div style="display: flex; gap: 16px; margin-bottom: 16px;">
                        <button class="btn btn-primary" id="pay-twint-btn" style="flex: 1; padding: 20px; font-size: 1.1rem; background-color: #0082c3; color: white; border: none;">Twint</button>
                        <button class="btn btn-primary" id="pay-haus-btn" style="flex: 1; padding: 20px; font-size: 1.1rem; background-color: #5e5ce6; color: white; border: none;">Aufs Haus</button>
                    </div>
                </div>

                <div id="twint-qr-view" class="hidden">
                    <p class="text-muted mb-2">Twint QR-Code scannen:</p>
                    <div style="background: white; padding: 16px; border-radius: 16px; display: inline-block; margin-bottom: 20px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=TwintPaymentPlaceholder" alt="Twint QR Code" style="width: 200px; height: 200px; display: block;">
                    </div>
                    <button class="btn btn-success" id="pay-twint-confirm-btn" style="width: 100%; padding: 16px; font-size: 1.1rem;">Bezahlt</button>
                </div>
            </div>
        </div>
    `;

    let allOrders = [];
    let currentTisch = null;
    let currentTableOrders = [];

    const renderList = (newOrders) => {
        allOrders = newOrders || [];
        
        const activeOrders = allOrders.filter(o => 
            (o.Status === 'Neu' || o.Status === 'Serviert' || o.status === 'Neu' || o.status === 'Serviert') &&
            state.isOrderFromSelectedDate(o.Zeitstempel || o.zeitstempel)
        );
        const activeTables = [...new Set(activeOrders.map(o => o.Tisch_Nr || o.tisch))];
        
        const grid = document.getElementById('kasse-tische-grid');
        if (!grid) return;

        if (activeTables.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1;"><p class="text-center text-muted">Keine abzurechnenden Tische.</p></div>';
        } else {
            grid.innerHTML = '';
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

        if (currentTisch !== null && document.getElementById('checkout-overlay').classList.contains('active')) {
            renderSheetItems();
        }
    };

    renderList(api._orders || []);

    api.onOrdersUpdated((newOrders) => {
        renderList(newOrders);
    });

    api.fetchOrders().catch(e => console.error('Error fetching orders:', e));

    const overlay = document.getElementById('checkout-overlay');
    const sheet = document.getElementById('checkout-sheet');
    const closeBtn = document.getElementById('checkout-close');

    const paymentOverlay = document.getElementById('payment-modal-overlay');
    const paymentSheet = document.getElementById('payment-modal-sheet');
    const paymentCloseBtn = document.getElementById('payment-modal-close');
    const paymentOptionsView = document.getElementById('payment-options-view');
    const twintQrView = document.getElementById('twint-qr-view');

    const closeSheet = () => {
        overlay.classList.remove('active');
        sheet.classList.remove('active');
        currentTisch = null;
    };

    const closePaymentModal = () => {
        paymentOverlay.classList.remove('active');
        paymentSheet.classList.remove('active');
        twintQrView.classList.add('hidden');
        paymentOptionsView.classList.remove('hidden');
    };

    closeBtn.addEventListener('click', closeSheet);
    paymentCloseBtn.addEventListener('click', closePaymentModal);

    const calcTotal = () => {
        let total = 0;
        document.querySelectorAll('.pay-qty').forEach(input => {
            const qty = parseInt(input.value) || 0;
            const price = parseFloat(input.dataset.price) || 0;
            total += qty * price;
        });
        const tip = parseFloat(document.getElementById('checkout-tip').value) || 0;
        document.getElementById('checkout-total').textContent = (total + tip).toFixed(2);
    };

    const renderSheetItems = () => {
        let itemsHtml = '';
        currentTableOrders.forEach(o => {
            const menge = parseInt(o.Menge || o.menge || 0);
            const name = o.Name || o.name || o.artikel;
            const id = o.Bestell_ID || o.id || o.bestellId;
            
            // Find price from menu
            const menuItem = menuData.find(m => String(m.Name) === String(name) || String(m.Artikel_ID) === String(name));
            const preis = menuItem ? parseFloat(menuItem.Preis) : 0;
            
            itemsHtml += `
                <div class="card mb-2" style="padding: 12px; background: rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: bold;">${menge}x ${name}</div>
                        <div>CHF ${(menge * preis).toFixed(2)}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                        <!-- Korrektur -->
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span class="text-muted" style="margin-right: 4px;">Korrektur:</span>
                            <button class="btn btn-sm adjust-btn" data-id="${id}" data-action="minus" style="padding: 2px 8px;">-</button>
                            <button class="btn btn-sm adjust-btn" data-id="${id}" data-action="plus" style="padding: 2px 8px;">+</button>
                        </div>
                        
                        <!-- Zahlung -->
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="text-success">Zu zahlen:</span>
                            <input type="number" class="pay-qty" data-id="${id}" data-price="${preis}" data-menge="${menge}" value="${menge}" min="0" max="${menge}" style="width: 50px; text-align: center; padding: 4px;">
                        </div>
                    </div>
                </div>
            `;
        });
        
        document.getElementById('checkout-items').innerHTML = itemsHtml;
        
        // Listeners for adjustments (Optimistic UI)
        document.querySelectorAll('.adjust-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const action = e.currentTarget.dataset.action;
                const order = currentTableOrders.find(o => (o.Bestell_ID || o.id || o.bestellId) === id);
                if (!order) return;

                let newMenge = parseInt(order.Menge || order.menge);
                
                if (action === 'plus') newMenge++;
                if (action === 'minus') newMenge--;
                
                if (newMenge < 0) newMenge = 0;
                
                // Optimistic UI Update
                if (newMenge === 0) {
                    currentTableOrders = currentTableOrders.filter(o => (o.Bestell_ID || o.id || o.bestellId) !== id);
                } else {
                    order.Menge = newMenge;
                    order.menge = newMenge;
                }
                renderSheetItems();

                // Background API call
                api.updateOrderMenge(id, newMenge);
            });
        });

        // Listeners for partial payment input
        document.querySelectorAll('.pay-qty').forEach(input => {
            input.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                const max = parseInt(e.target.max);
                if (val < 0) e.target.value = 0;
                if (val > max) e.target.value = max;
                calcTotal();
            });
        });

        document.getElementById('checkout-tip').addEventListener('input', calcTotal);
        calcTotal();
    };

    const openCheckoutSheet = (tisch) => {
        currentTisch = tisch;
        currentTableOrders = allOrders.filter(o => String(o.Tisch_Nr || o.tisch) === String(tisch) && (o.Status === 'Neu' || o.Status === 'Serviert' || o.status === 'Neu' || o.status === 'Serviert'));
        
        document.getElementById('checkout-title').textContent = `Abrechnung Tisch ${tisch}`;
        document.getElementById('checkout-tip').value = '';
        
        renderSheetItems();
        
        overlay.classList.add('active');
        sheet.classList.add('active');
    };

    // Abrechnung abschliessen -> Öffnet Zahlungsart Modal
    document.getElementById('checkout-btn').addEventListener('click', () => {
        paymentOptionsView.classList.remove('hidden');
        twintQrView.classList.add('hidden');
        paymentOverlay.classList.add('active');
        paymentSheet.classList.add('active');
    });

    // Hilfsfunktion zur Durchführung des Checkouts (Optimistic UI)
    const executeCheckout = (zahlungsart) => {
        const payInputs = document.querySelectorAll('.pay-qty');
        
        for (const input of payInputs) {
            const id = input.dataset.id;
            const payMenge = parseInt(input.value);
            const totalMenge = parseInt(input.dataset.menge);
            
            if (payMenge === 0) continue;
            
            if (payMenge === totalMenge) {
                api.updateOrderStatus(id, 'Bezahlt', zahlungsart);
            } else if (payMenge > 0 && payMenge < totalMenge) {
                api.splitOrder(id, payMenge, zahlungsart);
            }
        }

        const tip = parseFloat(document.getElementById('checkout-tip').value) || 0;
        if (tip > 0) {
            const timestampStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const r = Math.floor(Math.random() * 1000);
            const tipId = `ORD-${timestampStr}-${r}-TIP`;
            api.addOrder(tipId, currentTisch, 'Trinkgeld', 1, tip, 'Bezahlt', zahlungsart);
        }

        // Instantes Feedback & Modale schließen
        closePaymentModal();
        closeSheet();
    };

    // Klick auf "Aufs Haus"
    document.getElementById('pay-haus-btn').addEventListener('click', () => {
        executeCheckout('Haus');
    });

    // Klick auf "Twint" -> Zeige QR Code
    document.getElementById('pay-twint-btn').addEventListener('click', () => {
        paymentOptionsView.classList.add('hidden');
        twintQrView.classList.remove('hidden');
    });

    // Klick auf "Bezahlt" unter Twint QR Code
    document.getElementById('pay-twint-confirm-btn').addEventListener('click', () => {
        executeCheckout('Twint');
    });
};

