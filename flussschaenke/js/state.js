export const state = {
    getToken() {
        return localStorage.getItem('flussschaenke_token');
    },
    setToken(token) {
        localStorage.setItem('flussschaenke_token', token);
    },
    clearToken() {
        localStorage.removeItem('flussschaenke_token');
    },
    isLoggedIn() {
        return !!this.getToken();
    }
};
