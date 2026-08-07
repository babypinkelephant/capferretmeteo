import { api } from './api.js';

// Konfiguration der 8 Veranstaltungstage
const EVENT_DATES = [
    { iso: '2026-11-04', dayName: 'Mittwoch',   dateFormatted: '04. November 2026' },
    { iso: '2026-11-05', dayName: 'Donnerstag',  dateFormatted: '05. November 2026' },
    { iso: '2026-11-06', dayName: 'Freitag',     dateFormatted: '06. November 2026' },
    { iso: '2026-11-07', dayName: 'Samstag',     dateFormatted: '07. November 2026' },
    { iso: '2026-11-11', dayName: 'Mittwoch',    dateFormatted: '11. November 2026' },
    { iso: '2026-11-12', dayName: 'Donnerstag',  dateFormatted: '12. November 2026' },
    { iso: '2026-11-13', dayName: 'Freitag',     dateFormatted: '13. November 2026' },
    { iso: '2026-11-14', dayName: 'Samstag',     dateFormatted: '14. November 2026' }
];

const PREFERENCE_OPTIONS = [
    { value: 'Keine Einschränkungen',       label: 'Keine Einschränkungen' },
    { value: 'Vegetarisch',                 label: 'Vegetarisch' },
    { value: 'Vegan',                       label: 'Vegan' },
    { value: 'Laktoseintoleranz',           label: 'Laktoseintoleranz' },
    { value: 'Glutenfrei',                  label: 'Glutenfrei' },
    { value: 'Nussallergie',                label: 'Nussallergie' },
    { value: 'Kein Fisch / Schalentiere',   label: 'Kein Fisch / keine Schalentiere' },
    { value: 'Sonstiges',                   label: 'Sonstige Allergie (bitte im Detailfeld angeben)' }
];

// App-State
let selectedDate = null;
let guestCount = 2;
let availabilityData = {};
let currentManageBooking = null;

document.addEventListener('DOMContentLoaded', () => {
    renderDateCards();
    setupEventListeners();
    updateGuestFormCards();

    // Polling starten – Seitenstart löst sofortigen Abruf aus (Cache-Hit ~200ms)
    api.startPolling((newData) => {
        availabilityData = newData;
        updateDateCardsAvailability();
    });
});

// ============================================================
// DATE RENDERING
// ============================================================

function renderDateCards() {
    const container = document.getElementById('dates-container');
    if (!container) return;

    container.innerHTML = EVENT_DATES.map(d => `
        <div class="date-card disabled" id="date-card-${d.iso}" data-date="${d.iso}">
            <div>
                <div class="date-day">${d.dayName}</div>
                <div class="date-number">${d.iso.split('-')[2]}.${d.iso.split('-')[1]}.</div>
            </div>
            <div class="badge-availability badge-warning" id="badge-${d.iso}">Lade...</div>
        </div>
    `).join('');

    EVENT_DATES.forEach(d => {
        document.getElementById(`date-card-${d.iso}`)
            ?.addEventListener('click', () => selectDate(d.iso));
    });
}

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
                document.getElementById('booking-step-2')?.classList.add('hidden');
                document.getElementById('booking-step-3')?.classList.add('hidden');
            }
        } else if (avail <= 5) {
            card.classList.remove('disabled');
            badge.className = 'badge-availability badge-warning';
            badge.textContent = `Nur ${avail} frei!`;
        } else {
            card.classList.remove('disabled');
            badge.className = 'badge-availability badge-available';
            badge.textContent = `${avail} Plätze frei`;
        }
    });
}

// ============================================================
// DATE SELECTION
// ============================================================

function selectDate(isoDate) {
    const info = availabilityData[isoDate] || { available: 30 };
    if (info.available <= 0) return;

    selectedDate = isoDate;

    EVENT_DATES.forEach(d => {
        document.getElementById(`date-card-${d.iso}`)?.classList.toggle('selected', d.iso === isoDate);
    });

    const maxSeats = Math.min(10, info.available);
    if (guestCount > maxSeats) guestCount = Math.max(1, maxSeats);

    document.getElementById('counter-val').textContent = guestCount;

    const subtitleEl = document.getElementById('guest-count-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Für wie viele Personen möchtest du am ${formatDateCH(isoDate)} reservieren?`;

    document.getElementById('booking-step-2')?.classList.remove('hidden');
    document.getElementById('booking-step-3')?.classList.remove('hidden');

    updateGuestFormCards();
    updateSummary();

    setTimeout(() => {
        document.getElementById('booking-step-2')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    document.getElementById('btn-minus')?.addEventListener('click', () => {
        if (guestCount > 1) {
            guestCount--;
            document.getElementById('counter-val').textContent = guestCount;
            updateGuestFormCards();
            updateSummary();
        }
    });

    document.getElementById('btn-plus')?.addEventListener('click', () => {
        const maxSeats = selectedDate ? Math.min(10, availabilityData[selectedDate]?.available || 30) : 10;
        if (guestCount < maxSeats) {
            guestCount++;
            document.getElementById('counter-val').textContent = guestCount;
            updateGuestFormCards();
            updateSummary();
        }
    });

    // Sync Hauptkontakt -> Gast 1
    ['haupt-vorname', 'haupt-nachname', 'haupt-email'].forEach((id, idx) => {
        const field = ['gast-vorname-0', 'gast-nachname-0', 'gast-email-0'][idx];
        document.getElementById(id)?.addEventListener('input', (e) => {
            const g = document.getElementById(field);
            if (g) g.value = e.target.value;
            updateSummary();
        });
    });

    document.getElementById('reservation-form')?.addEventListener('submit', handleReservationSubmit);

    document.getElementById('btn-open-manage')?.addEventListener('click', () => {
        document.getElementById('modal-manage')?.classList.add('active');
    });
    document.getElementById('btn-close-manage')?.addEventListener('click', () => {
        document.getElementById('modal-manage')?.classList.remove('active');
    });

    document.getElementById('form-lookup')?.addEventListener('submit', handleLookupSubmit);
    document.getElementById('form-manage-update')?.addEventListener('submit', handleManageUpdateSubmit);
}

// ============================================================
// GUEST FORM CARDS
// ============================================================

function updateGuestFormCards() {
    const container = document.getElementById('guests-container');
    if (!container) return;

    // Vorherige Werte sichern
    const saved = [];
    for (let i = 0; i < 10; i++) {
        saved[i] = {
            v: document.getElementById(`gast-vorname-${i}`)?.value || '',
            n: document.getElementById(`gast-nachname-${i}`)?.value || '',
            e: document.getElementById(`gast-email-${i}`)?.value || '',
            a: document.getElementById(`gast-allergie-${i}`)?.value || 'Keine Einschränkungen',
            d: document.getElementById(`gast-detail-${i}`)?.value || ''
        };
    }

    const hauptV = document.getElementById('haupt-vorname')?.value || '';
    const hauptN = document.getElementById('haupt-nachname')?.value || '';
    const hauptE = document.getElementById('haupt-email')?.value || '';

    let html = '';
    for (let i = 0; i < guestCount; i++) {
        const isHaupt = (i === 0);
        const dV = saved[i]?.v || (isHaupt ? hauptV : '');
        const dN = saved[i]?.n || (isHaupt ? hauptN : '');
        const dE = saved[i]?.e || (isHaupt ? hauptE : '');
        const dA = saved[i]?.a || 'Keine Einschränkungen';
        const dD = saved[i]?.d || '';

        html += `
            <div class="guest-card">
                <div class="guest-card-header">
                    <div class="guest-card-title">
                        Gast ${i + 1}
                        ${isHaupt ? '<span style="font-size:0.72rem;background:var(--accent-gold-light);color:var(--primary-dark);padding:2px 8px;border-radius:12px;margin-left:6px;">Hauptbucher</span>' : ''}
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="gast-vorname-${i}">Vorname *</label>
                        <input type="text" id="gast-vorname-${i}" value="${escHtml(dV)}" placeholder="z. B. Laura" required>
                    </div>
                    <div class="form-group">
                        <label for="gast-nachname-${i}">Nachname *</label>
                        <input type="text" id="gast-nachname-${i}" value="${escHtml(dN)}" placeholder="z. B. Keller" required>
                    </div>
                    <div class="form-group">
                        <label for="gast-email-${i}">E-Mail ${isHaupt ? '*' : '(optional)'}</label>
                        <input type="email" id="gast-email-${i}" value="${escHtml(dE)}" placeholder="laura@beispiel.ch" ${isHaupt ? 'required' : ''}>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="gast-allergie-${i}">Allergie / Ernährungsform *</label>
                        <select id="gast-allergie-${i}" required>
                            ${PREFERENCE_OPTIONS.map(o => `<option value="${o.value}" ${dA === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="gast-detail-${i}">Zusätzliche Details (optional)</label>
                        <input type="text" id="gast-detail-${i}" value="${escHtml(dD)}" placeholder="z. B. Schwer allergisch auf Erdnüsse">
                    </div>
                </div>
            </div>`;
    }

    container.innerHTML = html;

    for (let i = 0; i < guestCount; i++) {
        ['vorname','nachname'].forEach(f => {
            document.getElementById(`gast-${f}-${i}`)?.addEventListener('input', updateSummary);
        });
        document.getElementById(`gast-allergie-${i}`)?.addEventListener('change', updateSummary);
    }
}

// ============================================================
// SUMMARY
// ============================================================

function updateSummary() {
    if (!selectedDate) return;
    document.getElementById('sum-date').textContent = formatDateCH(selectedDate);
    document.getElementById('sum-seats').textContent = `${guestCount} ${guestCount === 1 ? 'Platz' : 'Plätze'}`;
    document.getElementById('sum-price').textContent = `CHF ${guestCount * 93}.–`;
    document.getElementById('sum-deposit').textContent = `CHF ${guestCount * 50}.–`;
}

// ============================================================
// FORM SUBMIT
// ============================================================

async function handleReservationSubmit(e) {
    e.preventDefault();

    if (!selectedDate) {
        alert('Bitte wähle zuerst ein Veranstaltungsdatum.');
        return;
    }

    const agb = document.getElementById('agb-checkbox');
    if (agb && !agb.checked) {
        alert('Bitte akzeptiere die Bedingungen zur Anzahlung.');
        return;
    }

    const errorAlert = document.getElementById('booking-error-alert');
    errorAlert?.classList.add('hidden');

    const hauptVorname  = document.getElementById('haupt-vorname')?.value.trim() || '';
    const hauptNachname = document.getElementById('haupt-nachname')?.value.trim() || '';
    const hauptEmail    = document.getElementById('haupt-email')?.value.trim() || '';

    if (!hauptVorname || !hauptNachname || !hauptEmail) {
        alert('Bitte fülle alle Pflichtfelder des Hauptkontakts aus.');
        return;
    }

    const gaeste = [];
    for (let i = 0; i < guestCount; i++) {
        const vorname = document.getElementById(`gast-vorname-${i}`)?.value.trim() || '';
        const nachname = document.getElementById(`gast-nachname-${i}`)?.value.trim() || '';
        const email = document.getElementById(`gast-email-${i}`)?.value.trim() || '';
        const allergie = document.getElementById(`gast-allergie-${i}`)?.value || 'Keine Einschränkungen';
        const detail = document.getElementById(`gast-detail-${i}`)?.value.trim() || '';

        if (!vorname || !nachname) {
            alert(`Bitte gib Vor- und Nachname für Gast ${i + 1} an.`);
            return;
        }

        gaeste.push({ vorname, nachname, email, allergien: detail ? `${allergie} (${detail})` : allergie });
    }

    const btn = document.getElementById('btn-submit-booking');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Wird verarbeitet...`;

    try {
        const res = await api.createReservation(selectedDate, hauptNachname, hauptEmail, gaeste);

        if (res.status === 'success') {
            showSuccessView(res.bookingId, selectedDate, hauptEmail, gaeste);
        } else {
            if (errorAlert) {
                errorAlert.textContent = res.message || 'Fehler beim Erstellen der Reservation.';
                errorAlert.classList.remove('hidden');
            }
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    } catch (err) {
        if (errorAlert) {
            errorAlert.textContent = 'Verbindungsfehler. Bitte versuche es erneut.';
            errorAlert.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.innerHTML = origText;
    }
}

// ============================================================
// SUCCESS VIEW
// ============================================================

function showSuccessView(bookingId, isoDate, email, gaeste) {
    // Formular-Bereich und Hero-Section ausblenden
    document.getElementById('booking-form-wrapper')?.classList.add('hidden');
    document.querySelector('.hero-section')?.classList.add('hidden');
    document.querySelector('.info-sections')?.classList.add('hidden');

    // Erfolgs-Ansicht direkt unter Header anzeigen
    const sv = document.getElementById('booking-success-view');
    sv?.classList.remove('hidden');

    document.getElementById('success-booking-id').textContent = bookingId;
    document.getElementById('success-date').textContent = formatDateCH(isoDate);
    document.getElementById('success-seats').textContent = `${gaeste.length} ${gaeste.length === 1 ? 'Platz' : 'Plätze'}`;
    document.getElementById('success-email').textContent = email;

    const gl = document.getElementById('success-guest-list');
    if (gl) {
        gl.innerHTML = gaeste.map((g, i) => `
            <div style="padding:8px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;">
                <div><strong>Gast ${i + 1}:</strong> ${escHtml(g.vorname)} ${escHtml(g.nachname)}</div>
                <div class="text-muted"><em>${escHtml(g.allergien)}</em></div>
            </div>`).join('');
    }

    document.getElementById('btn-copy-id').onclick = () => {
        navigator.clipboard.writeText(bookingId).then(() => alert('Booking-ID kopiert!'));
    };

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// MANAGE MODAL
// ============================================================

async function handleLookupSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('lookup-email')?.value.trim() || '';
    const bookingId = document.getElementById('lookup-id')?.value.trim() || '';
    const alertBox = document.getElementById('lookup-alert');
    alertBox?.classList.add('hidden');

    const btn = document.getElementById('btn-submit-lookup');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Suche...`;

    try {
        const res = await api.lookupBooking(email, bookingId);
        btn.disabled = false;
        btn.innerHTML = orig;

        if (res.status === 'success') {
            currentManageBooking = res;
            renderManageView(res);
        } else {
            if (alertBox) {
                alertBox.textContent = res.message || 'Keine Reservation gefunden.';
                alertBox.classList.remove('hidden');
            }
        }
    } catch {
        btn.disabled = false;
        btn.innerHTML = orig;
        if (alertBox) {
            alertBox.textContent = 'Verbindungsfehler.';
            alertBox.classList.remove('hidden');
        }
    }
}

function renderManageView(res) {
    document.getElementById('lookup-step')?.classList.add('hidden');
    document.getElementById('manage-edit-step')?.classList.remove('hidden');

    document.getElementById('manage-booking-id').textContent = res.bookingId;
    document.getElementById('manage-date').textContent = formatDateCH(res.datum);

    const payEl = document.getElementById('manage-payment-status');
    if (payEl && res.paymentInfo) {
        const { totalPaid, isFullyPaid } = res.paymentInfo;
        const total = res.gaeste.length;
        if (isFullyPaid) {
            payEl.innerHTML = `<span style="color:var(--status-success-text);font-weight:700;">Bezahlt (${totalPaid}/${total})</span>`;
        } else if (totalPaid > 0) {
            payEl.innerHTML = `<span style="color:var(--status-warning-text);font-weight:700;">Teilweise bezahlt (${totalPaid}/${total})</span>`;
        } else {
            payEl.innerHTML = `<span style="color:var(--status-danger-text);font-weight:700;">Noch nicht bezahlt</span>`;
        }
    }

    const container = document.getElementById('manage-guests-container');
    if (container) {
        container.innerHTML = res.gaeste.map((g, i) => `
            <div class="guest-card mb-2">
                <h4 style="color:var(--primary-dark);margin-bottom:12px;">Gast ${i + 1}</h4>
                <div class="form-row">
                    <div class="form-group"><label>Vorname</label><input type="text" class="m-vorname" value="${escHtml(g.vorname)}" required></div>
                    <div class="form-group"><label>Nachname</label><input type="text" class="m-nachname" value="${escHtml(g.nachname)}" required></div>
                    <div class="form-group"><label>E-Mail</label><input type="email" class="m-email" value="${escHtml(g.email)}"></div>
                </div>
                <div class="form-group"><label>Allergie / Präferenzen</label><input type="text" class="m-allergie" value="${escHtml(g.allergien)}" required></div>
            </div>`).join('');
    }
}

async function handleManageUpdateSubmit(e) {
    e.preventDefault();
    if (!currentManageBooking) return;

    const alertBox = document.getElementById('manage-alert');
    alertBox?.classList.add('hidden');

    const updatedGaeste = [];
    document.querySelectorAll('#manage-guests-container .guest-card').forEach(card => {
        const v = card.querySelector('.m-vorname')?.value.trim() || '';
        const n = card.querySelector('.m-nachname')?.value.trim() || '';
        const em = card.querySelector('.m-email')?.value.trim() || '';
        const al = card.querySelector('.m-allergie')?.value.trim() || '';
        if (v && n) updatedGaeste.push({ vorname: v, nachname: n, email: em, allergien: al });
    });

    const btn = document.getElementById('btn-submit-update');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Speichern...`;

    try {
        const res = await api.updateReservation(currentManageBooking.bookingId, currentManageBooking.hauptEmail, updatedGaeste);
        btn.disabled = false;
        btn.innerHTML = orig;

        if (alertBox) {
            alertBox.className = res.status === 'success' ? 'alert alert-success' : 'alert alert-danger';
            alertBox.textContent = res.status === 'success' ? 'Reservation erfolgreich aktualisiert.' : (res.message || 'Fehler.');
            alertBox.classList.remove('hidden');
        }
    } catch {
        btn.disabled = false;
        btn.innerHTML = orig;
        if (alertBox) {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = 'Verbindungsfehler.';
            alertBox.classList.remove('hidden');
        }
    }
}

// ============================================================
// HELPERS
// ============================================================

function formatDateCH(iso) {
    if (!iso) return '';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
