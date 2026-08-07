import { api } from './api.js';

// Konfiguration der 8 Veranstaltungstage im November 2026
const EVENT_DATES = [
    { iso: '2026-11-04', dayName: 'Mittwoch', dateFormatted: '04. November 2026' },
    { iso: '2026-11-05', dayName: 'Donnerstag', dateFormatted: '05. November 2026' },
    { iso: '2026-11-06', dayName: 'Freitag', dateFormatted: '06. November 2026' },
    { iso: '2026-11-07', dayName: 'Samstag', dateFormatted: '07. November 2026' },
    { iso: '2026-11-11', dayName: 'Mittwoch', dateFormatted: '11. November 2026' },
    { iso: '2026-11-12', dayName: 'Donnerstag', dateFormatted: '12. November 2026' },
    { iso: '2026-11-13', dayName: 'Freitag', dateFormatted: '13. November 2026' },
    { iso: '2026-11-14', dayName: 'Samstag', dateFormatted: '14. November 2026' }
];

const PREFERENCE_OPTIONS = [
    { value: 'Keine Einschränkungen', label: 'Keine Einschränkungen' },
    { value: 'Vegetarisch', label: 'Vegetarisch' },
    { value: 'Vegan', label: 'Vegan' },
    { value: 'Laktoseintoleranz', label: 'Laktoseintoleranz' },
    { value: 'Glutenfrei', label: 'Glutenfrei' },
    { value: 'Nussallergie', label: 'Nussallergie' },
    { value: 'Fisch / Schalentiere', label: 'Kein Fisch / keine Schalentiere' },
    { value: 'Sonstiges', label: 'Sonstige Allergie (Freitext angeben)' }
];

// App-State
let selectedDate = null;
let guestCount = 2;
let availabilityData = {};
let currentManageBooking = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    renderDateCards();
    setupEventListeners();
    updateGuestFormCards();
    
    // Start 5-Sekunden Polling
    api.startPolling((newAvailability) => {
        availabilityData = newAvailability;
        updateDateCardsAvailability();
    });
}

/**
 * Render 8 Date Cards
 */
function renderDateCards() {
    const container = document.getElementById('dates-container');
    if (!container) return;

    container.innerHTML = EVENT_DATES.map(d => `
        <div class="date-card disabled" id="date-card-${d.iso}" data-date="${d.iso}">
            <div>
                <div class="date-day">${d.dayName}</div>
                <div class="date-number">${d.iso.split('-')[2]}.${d.iso.split('-')[1]}.</div>
            </div>
            <div class="badge-availability badge-warning" id="badge-${d.iso}">Lade Plätze...</div>
        </div>
    `).join('');

    // Click Event Listener für Datums-Karten
    EVENT_DATES.forEach(d => {
        const card = document.getElementById(`date-card-${d.iso}`);
        if (card) {
            card.addEventListener('click', () => selectDate(d.iso));
        }
    });
}

/**
 * Polling Update für Verfügbarkeiten auf den Karten
 */
function updateDateCardsAvailability() {
    EVENT_DATES.forEach(d => {
        const card = document.getElementById(`date-card-${d.iso}`);
        const badge = document.getElementById(`badge-${d.iso}`);
        if (!card || !badge) return;

        const info = availabilityData[d.iso] || { available: 30, booked: 0 };
        const avail = info.available;

        if (avail <= 0) {
            card.classList.add('disabled');
            badge.className = 'badge-availability badge-full';
            badge.textContent = 'Ausgebucht';
            if (selectedDate === d.iso) {
                selectedDate = null;
                card.classList.remove('selected');
                document.getElementById('booking-step-2').classList.add('hidden');
                document.getElementById('booking-step-3').classList.add('hidden');
            }
        } else if (avail <= 5) {
            card.classList.remove('disabled');
            badge.className = 'badge-availability badge-warning';
            badge.textContent = `Nur ${avail} Plätze frei!`;
        } else {
            card.classList.remove('disabled');
            badge.className = 'badge-availability badge-available';
            badge.textContent = `${avail} Plätze frei`;
        }
    });
}

/**
 * Datum auswählen
 */
function selectDate(isoDate) {
    const info = availabilityData[isoDate] || { available: 30 };
    if (info.available <= 0) return;

    selectedDate = isoDate;

    EVENT_DATES.forEach(d => {
        const card = document.getElementById(`date-card-${d.iso}`);
        if (card) {
            if (d.iso === isoDate) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });

    // Max verfügbare Plätze für diese Nacht
    const maxSeats = Math.min(10, info.available);
    if (guestCount > maxSeats) {
        guestCount = Math.max(1, maxSeats);
    }

    document.getElementById('counter-val').textContent = guestCount;
    document.getElementById('selected-date-display').textContent = formatDateCH(isoDate);

    // Schritt 2 & 3 einblenden
    document.getElementById('booking-step-2').classList.remove('hidden');
    document.getElementById('booking-step-3').classList.remove('hidden');

    updateGuestFormCards();
    updateSummary();

    // Sanftes Scrollen zu Schritt 2
    document.getElementById('booking-step-2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Event Listener initialisieren
 */
function setupEventListeners() {
    // Gästecounter Plus / Minus
    document.getElementById('btn-minus').addEventListener('click', () => {
        if (guestCount > 1) {
            guestCount--;
            document.getElementById('counter-val').textContent = guestCount;
            updateGuestFormCards();
            updateSummary();
        }
    });

    document.getElementById('btn-plus').addEventListener('click', () => {
        const info = selectedDate ? (availabilityData[selectedDate] || { available: 30 }) : { available: 30 };
        const maxSeats = Math.min(10, info.available);
        if (guestCount < maxSeats) {
            guestCount++;
            document.getElementById('counter-val').textContent = guestCount;
            updateGuestFormCards();
            updateSummary();
        }
    });

    // Synchronisation Hauptkontakt -> Gast 1
    const hauptVorname = document.getElementById('haupt-vorname');
    const hauptNachname = document.getElementById('haupt-nachname');
    const hauptEmail = document.getElementById('haupt-email');

    hauptVorname.addEventListener('input', (e) => {
        const g1Vorname = document.getElementById('gast-vorname-0');
        if (g1Vorname) g1Vorname.value = e.target.value;
        updateSummary();
    });

    hauptNachname.addEventListener('input', (e) => {
        const g1Nachname = document.getElementById('gast-nachname-0');
        if (g1Nachname) g1Nachname.value = e.target.value;
        updateSummary();
    });

    hauptEmail.addEventListener('input', (e) => {
        const g1Email = document.getElementById('gast-email-0');
        if (g1Email) g1Email.value = e.target.value;
        updateSummary();
    });

    // Formular Absenden
    document.getElementById('reservation-form').addEventListener('submit', handleReservationSubmit);

    // Modals & Navigation
    document.getElementById('btn-open-manage').addEventListener('click', () => {
        document.getElementById('modal-manage').classList.add('active');
    });

    document.getElementById('btn-close-manage').addEventListener('click', () => {
        document.getElementById('modal-manage').classList.remove('active');
    });

    document.getElementById('form-lookup').addEventListener('submit', handleLookupSubmit);
    document.getElementById('form-manage-update').addEventListener('submit', handleManageUpdateSubmit);
}

/**
 * Dynamische Gästekarten rendern
 */
function updateGuestFormCards() {
    const container = document.getElementById('guests-container');
    if (!container) return;

    const currentVornamen = [];
    const currentNachnamen = [];
    const currentEmails = [];
    const currentAllergien = [];
    const currentDetails = [];

    // Vorherige Werte sichern
    for (let i = 0; i < 10; i++) {
        const v = document.getElementById(`gast-vorname-${i}`);
        const n = document.getElementById(`gast-nachname-${i}`);
        const e = document.getElementById(`gast-email-${i}`);
        const a = document.getElementById(`gast-allergie-${i}`);
        const d = document.getElementById(`gast-detail-${i}`);
        if (v) currentVornamen[i] = v.value;
        if (n) currentNachnamen[i] = n.value;
        if (e) currentEmails[i] = e.value;
        if (a) currentAllergien[i] = a.value;
        if (d) currentDetails[i] = d.value;
    }

    const hauptV = document.getElementById('haupt-vorname').value;
    const hauptN = document.getElementById('haupt-nachname').value;
    const hauptE = document.getElementById('haupt-email').value;

    let html = '';
    for (let i = 0; i < guestCount; i++) {
        const isHaupt = (i === 0);
        const defaultV = currentVornamen[i] !== undefined ? currentVornamen[i] : (isHaupt ? hauptV : '');
        const defaultN = currentNachnamen[i] !== undefined ? currentNachnamen[i] : (isHaupt ? hauptN : '');
        const defaultE = currentEmails[i] !== undefined ? currentEmails[i] : (isHaupt ? hauptE : '');
        const defaultA = currentAllergien[i] || 'Keine Einschränkungen';
        const defaultD = currentDetails[i] || '';

        html += `
            <div class="guest-card">
                <div class="guest-card-header">
                    <div class="guest-card-title">
                        <span>👤 Gast ${i + 1}</span>
                        ${isHaupt ? '<span style="font-size: 0.75rem; background: var(--accent-gold-light); color: var(--primary-dark); padding: 2px 8px; border-radius: 12px;">Hauptbucher</span>' : ''}
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="gast-vorname-${i}">Vorname *</label>
                        <input type="text" id="gast-vorname-${i}" value="${escapeHtml(defaultV)}" placeholder="z. B. Laura" required>
                    </div>
                    <div class="form-group">
                        <label for="gast-nachname-${i}">Nachname *</label>
                        <input type="text" id="gast-nachname-${i}" value="${escapeHtml(defaultN)}" placeholder="z. B. Keller" required>
                    </div>
                    <div class="form-group">
                        <label for="gast-email-${i}">E-Mail ${isHaupt ? '*' : '(optional)'}</label>
                        <input type="email" id="gast-email-${i}" value="${escapeHtml(defaultE)}" placeholder="laura@beispiel.ch" ${isHaupt ? 'required' : ''}>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="gast-allergie-${i}">Allergie / Ernährungsform *</label>
                        <select id="gast-allergie-${i}" required>
                            ${PREFERENCE_OPTIONS.map(opt => `
                                <option value="${opt.value}" ${defaultA === opt.value ? 'selected' : ''}>${opt.label}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="gast-detail-${i}">Zusätzliche Hinweise / Details (optional)</label>
                        <input type="text" id="gast-detail-${i}" value="${escapeHtml(defaultD)}" placeholder="z. B. Schwer allergisch gegen Erdnüsse">
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Change Handler für Zusammenfassungs-Update
    for (let i = 0; i < guestCount; i++) {
        const v = document.getElementById(`gast-vorname-${i}`);
        const n = document.getElementById(`gast-nachname-${i}`);
        const a = document.getElementById(`gast-allergie-${i}`);
        if (v) v.addEventListener('input', updateSummary);
        if (n) n.addEventListener('input', updateSummary);
        if (a) a.addEventListener('change', updateSummary);
    }
}

/**
 * Zusammenfassung aktualisieren
 */
function updateSummary() {
    if (!selectedDate) return;
    const dateFormatted = formatDateCH(selectedDate);
    document.getElementById('sum-date').textContent = dateFormatted;
    document.getElementById('sum-seats').textContent = `${guestCount} ${guestCount === 1 ? 'Platz' : 'Plätze'}`;
}

/**
 * Absenden der Buchung
 */
async function handleReservationSubmit(e) {
    e.preventDefault();

    if (!selectedDate) {
        alert('Bitte wähle zuerst ein Veranstaltungsdatum aus.');
        return;
    }

    const errorAlert = document.getElementById('booking-error-alert');
    errorAlert.classList.add('hidden');

    const hauptVorname = document.getElementById('haupt-vorname').value.trim();
    const hauptNachname = document.getElementById('haupt-nachname').value.trim();
    const hauptEmail = document.getElementById('haupt-email').value.trim();

    if (!hauptVorname || !hauptNachname || !hauptEmail) {
        alert('Bitte fülle alle Pflichtfelder des Hauptkontakts aus.');
        return;
    }

    const gaeste = [];
    for (let i = 0; i < guestCount; i++) {
        const vorname = document.getElementById(`gast-vorname-${i}`)?.value.trim();
        const nachname = document.getElementById(`gast-nachname-${i}`)?.value.trim();
        const email = document.getElementById(`gast-email-${i}`)?.value.trim() || '';
        const allergieOpt = document.getElementById(`gast-allergie-${i}`)?.value;
        const detail = document.getElementById(`gast-detail-${i}`)?.value.trim();

        if (!vorname || !nachname) {
            alert(`Bitte gib den Vor- und Nachnamen für Gast ${i + 1} an.`);
            return;
        }

        let allergieText = allergieOpt;
        if (detail) {
            allergieText += ` (${detail})`;
        }

        gaeste.push({
            vorname,
            nachname,
            email,
            allergien: allergieText
        });
    }

    // Submit-Button in Loading State versetzen
    const btnSubmit = document.getElementById('btn-submit-booking');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="spinner"></span> Reservation wird verarbeitet...`;

    try {
        const res = await api.createReservation(selectedDate, hauptEmail, gaeste);

        if (res.status === 'success') {
            showSuccessView(res.bookingId, selectedDate, hauptEmail, gaeste);
        } else {
            // Spezifische Overbooking-Meldung anzeigen
            if (res.code === 'FULL' || (res.message && res.message.includes('nicht genug Platz'))) {
                errorAlert.textContent = 'Leider haben wir nicht genug Platz an deinem gewünschten Abend. Suche dir einen anderen Abend oder wende dich per Email an uns. reservation.flussschaenke@gmail.com';
            } else {
                errorAlert.textContent = res.message || 'Fehler beim Erstellen der Reservation.';
            }
            errorAlert.classList.remove('hidden');
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
        }
    } catch (err) {
        errorAlert.textContent = 'Ein Verbindungsfehler ist aufgetreten. Bitte versuche es erneut.';
        errorAlert.classList.remove('hidden');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
    }
}

/**
 * Erfolgs-Ansicht anzeigen
 */
function showSuccessView(bookingId, isoDate, email, gaeste) {
    document.getElementById('booking-form-wrapper').classList.add('hidden');
    const successView = document.getElementById('booking-success-view');
    successView.classList.remove('hidden');

    document.getElementById('success-booking-id').textContent = bookingId;
    document.getElementById('success-date').textContent = formatDateCH(isoDate);
    document.getElementById('success-seats').textContent = `${gaeste.length} ${gaeste.length === 1 ? 'Platz' : 'Plätze'}`;
    document.getElementById('success-email').textContent = email;

    const guestListContainer = document.getElementById('success-guest-list');
    guestListContainer.innerHTML = gaeste.map((g, idx) => `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
            <div><strong>Gast ${idx + 1}:</strong> ${escapeHtml(g.vorname)} ${escapeHtml(g.nachname)}</div>
            <div class="text-muted"><em>${escapeHtml(g.allergien)}</em></div>
        </div>
    `).join('');

    // Copy Button Event Listener
    document.getElementById('btn-copy-id').onclick = () => {
        navigator.clipboard.writeText(bookingId).then(() => {
            alert('Booking-ID in die Zwischenablage kopiert!');
        });
    };

    // Scroll nach oben
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Reservation Suchen (Modal)
 */
async function handleLookupSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('lookup-email').value.trim();
    const bookingId = document.getElementById('lookup-id').value.trim();
    const alertBox = document.getElementById('lookup-alert');
    alertBox.classList.add('hidden');

    const btn = document.getElementById('btn-submit-lookup');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Suche läuft...`;

    try {
        const res = await api.lookupBooking(email, bookingId);
        btn.disabled = false;
        btn.innerHTML = orig;

        if (res.status === 'success') {
            currentManageBooking = res;
            renderManageView(res);
        } else {
            alertBox.textContent = res.message || 'Keine Reservation gefunden.';
            alertBox.classList.remove('hidden');
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = orig;
        alertBox.textContent = 'Fehler beim Abrufen der Daten.';
        alertBox.classList.remove('hidden');
    }
}

/**
 * Verwaltungssicht rendern
 */
function renderManageView(res) {
    document.getElementById('lookup-step').classList.add('hidden');
    const manageStep = document.getElementById('manage-edit-step');
    manageStep.classList.remove('hidden');

    document.getElementById('manage-booking-id').textContent = res.bookingId;
    document.getElementById('manage-date').textContent = formatDateCH(res.datum);

    const container = document.getElementById('manage-guests-container');
    container.innerHTML = res.gaeste.map((g, idx) => `
        <div class="guest-card mb-2">
            <h4 class="mb-2" style="color: var(--primary-dark);">Gast ${idx + 1}</h4>
            <div class="form-row">
                <div class="form-group">
                    <label>Vorname</label>
                    <input type="text" class="m-vorname" value="${escapeHtml(g.vorname)}" required>
                </div>
                <div class="form-group">
                    <label>Nachname</label>
                    <input type="text" class="m-nachname" value="${escapeHtml(g.nachname)}" required>
                </div>
                <div class="form-group">
                    <label>E-Mail</label>
                    <input type="email" class="m-email" value="${escapeHtml(g.email)}">
                </div>
            </div>
            <div class="form-group">
                <label>Allergie / Präferenzen</label>
                <input type="text" class="m-allergie" value="${escapeHtml(g.allergien)}" required>
            </div>
        </div>
    `).join('');
}

/**
 * Aktualisierung im Modal absenden
 */
async function handleManageUpdateSubmit(e) {
    e.preventDefault();
    if (!currentManageBooking) return;

    const alertBox = document.getElementById('manage-alert');
    alertBox.classList.add('hidden');

    const cardElements = document.querySelectorAll('#manage-guests-container .guest-card');
    const updatedGaeste = [];

    cardElements.forEach(card => {
        const v = card.querySelector('.m-vorname').value.trim();
        const n = card.querySelector('.m-nachname').value.trim();
        const em = card.querySelector('.m-email').value.trim();
        const al = card.querySelector('.m-allergie').value.trim();

        if (v && n) {
            updatedGaeste.push({ vorname: v, nachname: n, email: em, allergien: al });
        }
    });

    const btn = document.getElementById('btn-submit-update');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Speichern...`;

    try {
        const res = await api.updateReservation(
            currentManageBooking.bookingId,
            currentManageBooking.hauptEmail,
            updatedGaeste
        );

        btn.disabled = false;
        btn.innerHTML = orig;

        if (res.status === 'success') {
            alertBox.className = 'alert alert-success';
            alertBox.textContent = 'Deine Reservation wurde erfolgreich aktualisiert! Eine Bestätigung wurde gesendet.';
            alertBox.classList.remove('hidden');
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = res.message || 'Fehler beim Aktualisieren.';
            alertBox.classList.remove('hidden');
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = orig;
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Verbindungsfehler beim Speichern.';
        alertBox.classList.remove('hidden');
    }
}

// Hilfsfunktionen
function formatDateCH(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return isoDateStr;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
