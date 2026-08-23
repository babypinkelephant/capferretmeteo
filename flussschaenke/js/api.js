const API_URL = 'https://script.google.com/macros/s/AKfycbwah_srqE5m6G6d3yYHCHi6r07PqNDcoV2haR3sJ1ZmEofZwSgxvas_CgOCd3RpJW_RyQ/exec';

export const api = {
    // Background Queue Handling (Strictly Sequential Execution to prevent GAS Rate Limits)
    _queue: [],
    _isProcessingQueue: false,

    _enqueue(task) {
        this._queue.push(task);
        this._processQueue();
    },

    async _processQueue() {
        if (this._isProcessingQueue) return;
        this._isProcessingQueue = true;

        while (this._queue.length > 0) {
            const task = this._queue.shift();
            try {
                await task();
            } catch (err) {
                console.error('Queue task error:', err);
            }
        }

        this._isProcessingQueue = false;
    },

    async post(action, payload = {}) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...payload })
            });
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            
            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error(`API POST JSON Parse Error [${action}]:`, text);
                throw new Error('Ungültiges Antwortformat vom Server');
            }

            if (data.status === 'error') throw new Error(data.message || 'API Error');
            return data;
        } catch (error) {
            console.error(`API POST Error [${action}]:`, error);
            throw error;
        }
    },

    async get(action, params = {}) {
        try {
            const url = new URL(API_URL);
            url.searchParams.append('action', action);
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

            const response = await fetch(url.toString(), {
                method: 'GET'
            });
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error(`API GET JSON Parse Error [${action}]:`, text);
                throw new Error('Ungültiges Antwortformat vom Server');
            }

            if (data.status === 'error') throw new Error(data.message || 'API Error');
            return data;
        } catch (error) {
            console.error(`API GET Error [${action}]:`, error);
            throw error;
        }
    },

    // Polling state
    _orders: [],
    _subscribers: [],

    // Subscribe to order updates
    onOrdersUpdated(callback) {
        this._subscribers.push(callback);
    },

    // Notify all subscribers
    _notifySubscribers() {
        this._subscribers.forEach(cb => cb(this._orders));
    },

    // Start polling every 5 seconds
    startPolling() {
        if (this._pollingInterval) return;
        this.fetchOrders(); // initial fetch
        this._pollingInterval = setInterval(() => {
            this.fetchOrders();
        }, 5000);
    },

    async fetchOrders() {
        try {
            const res = await this.get('getOrders');
            this._orders = res.data || [];
            this._notifySubscribers();
        } catch (error) {
            console.error('Polling error:', error);
        }
    },

    // Specific endpoints
    login(email, password) {
        return this.post('login', { email, password });
    },
    getOrders(status) {
        return this.get('getOrders', { status });
    },
    addOrder(bestellId, tischNr, name, menge, preis, status, zahlungsart = '') {
        // Optimistic update
        this._orders.push({ Bestell_ID: bestellId, Tisch_Nr: tischNr, Name: name, Menge: menge, Preis: preis, Status: status, Zahlungsart: zahlungsart });
        this._notifySubscribers();
        
        // Enqueue task for sequential background POST
        this._enqueue(async () => {
            await this.post('addOrder', { bestellId, tischNr, name, menge, preis, status, zahlungsart });
            await this.fetchOrders();
        });
    },
    addMultipleOrders(ordersList) {
        // Optimistic update for all orders in batch
        ordersList.forEach(o => {
            this._orders.push({
                Bestell_ID: o.bestellId,
                Tisch_Nr: o.tischNr,
                Name: o.name,
                Menge: o.menge,
                Preis: o.preis,
                Status: o.status || 'Neu',
                Zahlungsart: o.zahlungsart || ''
            });
        });
        this._notifySubscribers();

        // Enqueue single BATCH request to backend
        this._enqueue(async () => {
            await this.post('addMultipleOrders', { orders: ordersList });
            await this.fetchOrders();
        });
    },
    updateOrderStatus(bestellId, neuerStatus, zahlungsart = '') {
        const order = this._orders.find(o => o.Bestell_ID === bestellId || o.id === bestellId);
        if (order) { 
            order.Status = neuerStatus; 
            if (zahlungsart) order.Zahlungsart = zahlungsart;
            this._notifySubscribers(); 
        }

        this._enqueue(async () => {
            await this.post('updateOrderStatus', { bestellId, neuerStatus, zahlungsart });
            await this.fetchOrders();
        });
    },
    updateMultipleOrderStatuses(updates, tipData = null) {
        // Optimistic local state update
        updates.forEach(u => {
            const order = this._orders.find(o => o.Bestell_ID === u.bestellId || o.id === u.bestellId);
            if (order) {
                if (u.splitMenge && parseInt(u.splitMenge) > 0) {
                    const oldMenge = parseInt(order.Menge) || 1;
                    const bezahlMenge = parseInt(u.splitMenge) || 1;
                    order.Menge = Math.max(0, oldMenge - bezahlMenge);
                    this._orders.push({
                        Bestell_ID: u.bestellId + '-S',
                        Tisch_Nr: order.Tisch_Nr,
                        Name: order.Name,
                        Menge: bezahlMenge,
                        Status: u.neuerStatus || 'Bezahlt',
                        Zahlungsart: u.zahlungsart || ''
                    });
                } else {
                    if (u.neuerStatus) order.Status = u.neuerStatus;
                    if (u.zahlungsart) order.Zahlungsart = u.zahlungsart;
                }
            }
        });

        if (tipData && tipData.preis > 0) {
            const timestampStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const r = Math.floor(Math.random() * 1000);
            this._orders.push({
                Bestell_ID: `ORD-${timestampStr}-${r}-TIP`,
                Tisch_Nr: tipData.tischNr,
                Name: 'Trinkgeld',
                Menge: 1,
                Preis: tipData.preis,
                Status: 'Bezahlt',
                Zahlungsart: tipData.zahlungsart || ''
            });
        }

        this._notifySubscribers();

        // Single batch API request enqueued
        this._enqueue(async () => {
            await this.post('updateMultipleOrderStatuses', { updates, tip: tipData });
            await this.fetchOrders();
        });
    },
    updateOrderMenge(bestellId, neueMenge) {
        const order = this._orders.find(o => o.Bestell_ID === bestellId || o.id === bestellId);
        if (order) {
            if (neueMenge === 0) { order.Menge = 0; order.Status = 'Storniert'; }
            else { order.Menge = neueMenge; }
            this._notifySubscribers();
        }

        this._enqueue(async () => {
            await this.post('updateOrderMenge', { bestellId, neueMenge });
            await this.fetchOrders();
        });
    },
    splitOrder(bestellId, mengeZumBezahlen, zahlungsart = '') {
        const order = this._orders.find(o => o.Bestell_ID === bestellId || o.id === bestellId);
        if (order) {
            const oldMenge = parseInt(order.Menge) || 1;
            const bezahlMenge = parseInt(mengeZumBezahlen) || 1;
            order.Menge = Math.max(0, oldMenge - bezahlMenge);
            this._orders.push({
                Bestell_ID: bestellId + '-S',
                Tisch_Nr: order.Tisch_Nr,
                Name: order.Name,
                Menge: bezahlMenge,
                Status: 'Bezahlt',
                Zahlungsart: zahlungsart
            });
            this._notifySubscribers();
        }

        this._enqueue(async () => {
            await this.post('splitOrder', { bestellId, mengeZumBezahlen, zahlungsart });
            await this.fetchOrders();
        });
    },
    checkout(tischNr, trinkgeld) {
        // Will be deprecated in frontend by splitOrder, but keeping it just in case
        return this.post('checkoutTable', { tischNr, trinkgeld });
    },

    _reservations: null,
    async getReservations() {
        if (this._reservations) return this._reservations;
        try {
            const res = await this.get('getReservations');
            this._reservations = res.data || {};
            return this._reservations;
        } catch (error) {
            console.error('Error fetching reservations:', error);
            return {};
        }
    }
};
