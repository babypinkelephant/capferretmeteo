/**
 * Fluss-Schänke Zürich - Reservation API Client
 */

// Die Google Apps Script Web-App URL (bereits mit dem Backend-Skript backend.gs verknüpft)
const API_URL = 'https://script.google.com/macros/s/AKfycbzKSQikJNqhx2Y0goObe4ARybjKeqLMPZAB8AD51VU21MkH4Z3crKwXpP4jtCRQTI6ThA/exec';

export const api = {
    /**
     * POST Request an das Apps Script senden (text/plain vermeidet CORS preflight Probleme)
     */
    async post(action, payload = {}) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...payload })
            });
            if (!response.ok) throw new Error('Netzwerkfehler beim Kommunizieren mit dem Server.');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API POST Error [${action}]:`, error);
            throw error;
        }
    },

    /**
     * GET Request an das Apps Script senden
     */
    async get(action, params = {}) {
        try {
            const url = new URL(API_URL);
            url.searchParams.append('action', action);
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null) {
                    url.searchParams.append(key, params[key]);
                }
            });

            const response = await fetch(url.toString(), { method: 'GET' });
            if (!response.ok) throw new Error('Netzwerkfehler beim Abrufen der Daten.');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API GET Error [${action}]:`, error);
            throw error;
        }
    },

    /**
     * Polling-Mechanismus: Alle 30 Sekunden Verfügbarkeiten abrufen.
     * Pausiert automatisch, wenn der Tab nicht sichtbar ist (document.hidden).
     */
    _pollingInterval: null,
    _lastAvailability: null,
    _visibilityListenerAttached: false,

    startPolling(callback) {
        // Sofort erste Abfrage durchführen (falls Tab aktiv)
        if (!document.hidden) {
            this.fetchAvailability(callback);
        }

        if (this._pollingInterval) clearInterval(this._pollingInterval);

        // 30-Sekunden Takt
        this._pollingInterval = setInterval(() => {
            if (!document.hidden) {
                this.fetchAvailability(callback);
            }
        }, 30000);

        // Event-Listener für Sichtbarkeitswechsel (Spart Server-Ressourcen & Rate Limits)
        if (!this._visibilityListenerAttached) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    console.log('Polling pausiert (Tab inaktiv)');
                } else {
                    console.log('Tab wieder aktiv: Sofortige Daten-Aktualisierung');
                    this.fetchAvailability(callback);
                }
            });
            this._visibilityListenerAttached = true;
        }
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
            if (res && res.status === 'success' && res.data) {
                this._lastAvailability = res.data;
                if (typeof callback === 'function') {
                    callback(res.data);
                }
            }
        } catch (err) {
            console.warn('Verfügbarkeits-Polling pausiert/Fehler:', err);
        }
    },

    /**
     * Neue Reservation erstellen
     */
    async createReservation(datum, hauptNachname, hauptEmail, gaeste) {
        return await this.post('createReservation', {
            datum,
            hauptNachname,
            hauptEmail,
            gaeste
        });
    },

    /**
     * Bestehende Reservation via E-Mail & Booking-ID suchen
     */
    async lookupBooking(email, bookingId) {
        return await this.get('lookupBooking', {
            email,
            bookingId
        });
    },

    /**
     * Bestehende Reservation aktualisieren
     */
    async updateReservation(bookingId, hauptEmail, gaeste) {
        return await this.post('updateReservation', {
            bookingId,
            hauptEmail,
            gaeste
        });
    }
};
