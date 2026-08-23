const API_URL = 'https://script.google.com/macros/s/AKfycbwah_srqE5m6G6d3yYHCHi6r07PqNDcoV2haR3sJ1ZmEofZwSgxvas_CgOCd3RpJW_RyQ/exec';

export const api = {
    async post(action, payload = {}) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                // text/plain avoids CORS preflight OPTIONS requests that GAS doesn't handle well
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
    async addOrder(bestellId, tischNr, name, menge, preis, status, zahlungsart = '') {
        // Optimistic update
        this._orders.push({ Bestell_ID: bestellId, Tisch_Nr: tischNr, Name: name, Menge: menge, Preis: preis, Status: status, Zahlungsart: zahlungsart });
        this._notifySubscribers();
        
        // Asynchronous background POST without blocking caller if desired
        this.post('addOrder', { bestellId, tischNr, name, menge, preis, status, zahlungsart })
            .then(() => this.fetchOrders())
            .catch(err => console.error('Error background addOrder:', err));
    },
    async updateOrderStatus(bestellId, neuerStatus, zahlungsart = '') {
        const order = this._orders.find(o => o.Bestell_ID === bestellId || o.id === bestellId);
        if (order) { 
            order.Status = neuerStatus; 
            if (zahlungsart) order.Zahlungsart = zahlungsart;
            this._notifySubscribers(); 
        }

        this.post('updateOrderStatus', { bestellId, neuerStatus, zahlungsart })
            .then(() => this.fetchOrders())
            .catch(err => console.error('Error background updateOrderStatus:', err));
    },
    async updateOrderMenge(bestellId, neueMenge) {
        const order = this._orders.find(o => o.Bestell_ID === bestellId || o.id === bestellId);
        if (order) {
            if (neueMenge === 0) { order.Menge = 0; order.Status = 'Storniert'; }
            else { order.Menge = neueMenge; }
            this._notifySubscribers();
        }

        this.post('updateOrderMenge', { bestellId, neueMenge })
            .then(() => this.fetchOrders())
            .catch(err => console.error('Error background updateOrderMenge:', err));
    },
    async splitOrder(bestellId, mengeZumBezahlen, zahlungsart = '') {
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

        this.post('splitOrder', { bestellId, mengeZumBezahlen, zahlungsart })
            .then(() => this.fetchOrders())
            .catch(err => console.error('Error background splitOrder:', err));
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
