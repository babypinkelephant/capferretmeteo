const API_URL = 'https://script.google.com/macros/s/AKfycbzDLcjAifuAuJh73XBqLJBSPpgg0VonHuetLaQL05Um5zCfWJD-XtVWD0Ucmec9VHwnCQ/exec';

export const api = {
    async post(action, payload = {}) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                // text/plain avoids CORS preflight OPTIONS requests that GAS doesn't handle well
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...payload })
            });
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
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
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
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

    // Start polling every 60 seconds
    startPolling() {
        if (this._pollingInterval) return;
        this.fetchOrders(); // initial fetch
        this._pollingInterval = setInterval(() => {
            this.fetchOrders();
        }, 60000); // every minute
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
        // Fallback for direct getOrders call
        return this.get('getOrders', { status });
    },
    addOrder(bestellId, tischNr, name, menge, preis, status) {
        return this.post('addOrder', { bestellId, tischNr, name, menge, preis, status });
    },
    updateOrderStatus(bestellId, neuerStatus) {
        return this.post('updateOrderStatus', { bestellId, neuerStatus });
    },
    updateOrderMenge(bestellId, neueMenge) {
        return this.post('updateOrderMenge', { bestellId, neueMenge });
    },
    splitOrder(bestellId, mengeZumBezahlen) {
        return this.post('splitOrder', { bestellId, mengeZumBezahlen });
    },
    checkout(tischNr, trinkgeld) {
        // Will be deprecated in frontend by splitOrder, but keeping it just in case
        return this.post('checkoutTable', { tischNr, trinkgeld });
    }
};
