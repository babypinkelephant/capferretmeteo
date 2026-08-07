/**
 * Flussschänke Zürich - Reservation API Client
 *
 * GESCHWINDIGKEITS-STRATEGIE:
 * - Beim Seitenstart wird sofort der gecachte Stand abgerufen (< 200ms).
 * - Alle 30s wird der Cache erneut abgefragt (bleibt schnell, da Cache-Hit).
 * - Das Backend-Trigger aktualisiert den Cache unabhängig jede Minute.
 */

// Deine Google Apps Script Web-App URL (nach neuem Deployment hier eintragen)
const API_URL = 'https://script.google.com/macros/s/AKfycbzKSQikJNqhx2Y0goObe4ARybjKeqLMPZAB8AD51VU21MkH4Z3crKwXpP4jtCRQTI6ThA/exec';

export const api = {
    /**
     * POST Request (text/plain vermeidet CORS preflight)
     */
    async post(action, payload = {}) {
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...payload })
            });
            if (!res.ok) throw new Error(`Netzwerkfehler (${res.status})`);
            return await res.json();
        } catch (err) {
            console.error(`API POST [${action}]:`, err);
            throw err;
        }
    },

    /**
     * GET Request
     */
    async get(action, params = {}) {
        try {
            const url = new URL(API_URL);
            url.searchParams.append('action', action);
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) url.searchParams.append(k, v);
            });
            const res = await fetch(url.toString(), { method: 'GET' });
            if (!res.ok) throw new Error('Netzwerkfehler');
            return await res.json();
        } catch (err) {
            console.error(`API GET [${action}]:`, err);
            throw err;
        }
    },

    /**
     * Polling – liest alle 30s den (gecachten) Stand vom Backend.
     * Da das Backend einen CacheService nutzt, ist jede Antwort < 300ms.
     */
    _pollingInterval: null,

    startPolling(callback) {
        // Sofort beim Start
        this.fetchAvailability(callback);
        // Danach alle 30 Sekunden (Cache-Hit, schnell)
        if (this._pollingInterval) clearInterval(this._pollingInterval);
        this._pollingInterval = setInterval(() => {
            this.fetchAvailability(callback);
        }, 30000);
    },

    stopPolling() {
        if (this._pollingInterval) {
            clearInterval(this._pollingInterval);
            this._pollingInterval = null;
        }
    },

    async fetchAvailability(callback) {
        try {
            const res = await this.get('getAvailability');
            if (res?.status === 'success' && res?.data) {
                if (typeof callback === 'function') callback(res.data);
            }
        } catch (err) {
            console.warn('Verfügbarkeit konnte nicht geladen werden:', err);
        }
    },

    async createReservation(datum, hauptNachname, hauptEmail, gaeste) {
        return await this.post('createReservation', { datum, hauptNachname, hauptEmail, gaeste });
    },

    async lookupBooking(email, bookingId) {
        return await this.get('lookupBooking', { email, bookingId });
    },

    async updateReservation(bookingId, hauptEmail, gaeste) {
        return await this.post('updateReservation', { bookingId, hauptEmail, gaeste });
    }
};
