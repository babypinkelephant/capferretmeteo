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

    // Specific endpoints
    login(email, password) {
        return this.post('login', { email, password });
    },
    getMenu() {
        return this.get('getMenu');
    },
    getOrders(status) {
        return this.get('getOrders', { status });
    },
    placeOrder(tisch, items) {
        return this.post('placeOrder', { tisch, items });
    },
    updateOrderStatus(orderId, status) {
        return this.post('updateOrderStatus', { orderId, status });
    },
    checkout(tisch, tip) {
        return this.post('checkout', { tisch, tip });
    }
};
