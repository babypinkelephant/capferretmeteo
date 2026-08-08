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
    },
    getSelectedDate() {
        return localStorage.getItem('flussschaenke_selected_date') || '4.11.2026';
    },
    setSelectedDate(dateStr) {
        localStorage.setItem('flussschaenke_selected_date', dateStr);
    },
    isOrderFromSelectedDate(orderTimestamp) {
        if (!orderTimestamp) return false;
        const selDate = this.getSelectedDate();
        const validDates = ['4.11.2026', '5.11.2026', '6.11.2026', '7.11.2026', '11.11.2026', '12.11.2026', '13.11.2026', '14.11.2026'];
        let orderDateObj = new Date(orderTimestamp);
        let orderDateStr = `${orderDateObj.getDate()}.${orderDateObj.getMonth()+1}.${orderDateObj.getFullYear()}`;
        
        if (selDate === 'Test-Tag') {
            return !validDates.includes(orderDateStr);
        } else {
            return orderDateStr === selDate;
        }
    }
};
