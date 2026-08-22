import { api } from './api.js';

// Konfiguration der 8 Veranstaltungstage
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
    { value: 'Kein Fisch', label: 'Kein Fisch' },
    { value: 'Kein Fleisch', label: 'Kein Fleisch' },
    { value: 'Kein Fleisch & Fisch', label: 'Kein Fleisch & Fisch' },
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
    const MAX_SEATS = 30;
    EVENT_DATES.forEach(d => {
        const card = document.getElementById(`date-card-${d.iso}`);
        const badge = document.getElementById(`badge-${d.iso}`);
        if (!card || !badge) return;

        const info = availabilityData[d.iso];
        // Immer explizit aus 'booked' berechnen – nie blind dem 'available'-Feld vertrauen.
        // Extrem ressourcenschonende Bereinigung für Polling: parseInt garantiert eine Zahl.
        const booked = parseInt(info?.booked, 10) || 0;
        const avail = Math.max(0, MAX_SEATS - booked);

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
    const info = availabilityData[isoDate];
    const booked = info?.booked ?? 0;
    const avail = Math.max(0, 30 - booked);
    if (avail <= 0) return;

    selectedDate = isoDate;

    EVENT_DATES.forEach(d => {
        document.getElementById(`date-card-${d.iso}`)?.classList.toggle('selected', d.iso === isoDate);
    });

    const maxSeats = Math.min(10, avail);
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
                </div>
            </div>`;
    }

    container.innerHTML = html;

    for (let i = 0; i < guestCount; i++) {
        ['vorname', 'nachname'].forEach(f => {
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
    document.getElementById('sum-price').textContent = `CHF ${guestCount * 95}.–`;
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

    const rawHauptVorname = document.getElementById('haupt-vorname')?.value || '';
    const rawHauptNachname = document.getElementById('haupt-nachname')?.value || '';
    const rawHauptEmail = document.getElementById('haupt-email')?.value || '';

    if (!rawHauptVorname.trim() || !rawHauptNachname.trim() || !rawHauptEmail.trim()) {
        alert('Bitte fülle alle Pflichtfelder des Hauptkontakts aus.');
        return;
    }

    if (hasInvalidCharacters(rawHauptVorname) || hasInvalidCharacters(rawHauptNachname) || hasInvalidCharacters(rawHauptEmail, true)) {
        if (errorAlert) {
            errorAlert.textContent = 'Fehler: Unzulässige Sonderzeichen im Hauptkontakt. Bitte nur Standardzeichen verwenden.';
            errorAlert.classList.remove('hidden');
        }
        window.scrollTo({ top: errorAlert.offsetTop - 100, behavior: 'smooth' });
        return;
    }

    const hauptVorname = sanitizeForBackend(rawHauptVorname);
    const hauptNachname = sanitizeForBackend(rawHauptNachname);
    const hauptEmail = sanitizeForBackend(rawHauptEmail, true);

    const gaeste = [];
    for (let i = 0; i < guestCount; i++) {
        const rawVorname = document.getElementById(`gast-vorname-${i}`)?.value || '';
        const rawNachname = document.getElementById(`gast-nachname-${i}`)?.value || '';
        const rawEmail = document.getElementById(`gast-email-${i}`)?.value || '';
        const rawAllergie = document.getElementById(`gast-allergie-${i}`)?.value || '';
        const rawDetail = document.getElementById(`gast-detail-${i}`)?.value || '';

        if (!rawVorname.trim() || !rawNachname.trim()) {
            alert(`Bitte gib Vor- und Nachname für Gast ${i + 1} an.`);
            return;
        }

        if (hasInvalidCharacters(rawVorname) || hasInvalidCharacters(rawNachname) || hasInvalidCharacters(rawEmail, true) || hasInvalidCharacters(rawDetail)) {
            if (errorAlert) {
                errorAlert.textContent = `Fehler: Unzulässige Sonderzeichen bei Gast ${i + 1}. Bitte nur Standardzeichen verwenden.`;
                errorAlert.classList.remove('hidden');
            }
            window.scrollTo({ top: errorAlert.offsetTop - 100, behavior: 'smooth' });
            return;
        }

        const vorname = sanitizeForBackend(rawVorname);
        const nachname = sanitizeForBackend(rawNachname);
        const email = sanitizeForBackend(rawEmail, true);
        const allergie = sanitizeForBackend(rawAllergie);
        const detail = sanitizeForBackend(rawDetail);

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

// app.js - Refactored showSuccessView
function showSuccessView(bookingId, isoDate, email, gaeste) {
    document.getElementById('booking-form-wrapper')?.classList.add('hidden');
    document.querySelector('.hero-section')?.classList.add('hidden');
    document.querySelector('.info-sections')?.classList.add('hidden');

    const sv = document.getElementById('booking-success-view');
    sv?.classList.remove('hidden');

    document.getElementById('success-booking-id').textContent = sanitizeForDOM(bookingId);
    document.getElementById('success-date').textContent = sanitizeForDOM(formatDateCH(isoDate));
    document.getElementById('success-seats').textContent = `${gaeste.length} ${gaeste.length === 1 ? 'Platz' : 'Plätze'}`;
    document.getElementById('success-email').textContent = sanitizeForDOM(email);

    const gl = document.getElementById('success-guest-list');
    if (gl) {
        gl.replaceChildren(); // Sicherer und schneller als innerHTML = ''

        gaeste.forEach((g, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;';

            const nameDiv = document.createElement('div');
            const nameStrong = document.createElement('strong');
            nameStrong.textContent = `Gast ${i + 1}: `;
            nameDiv.appendChild(nameStrong);
            // textContent verhindert XSS nativ, zusätzliche Sanitisierung zur absoluten Sicherheit
            nameDiv.appendChild(document.createTextNode(`${sanitizeForDOM(g.vorname)} ${sanitizeForDOM(g.nachname)}`));

            const allergieDiv = document.createElement('div');
            allergieDiv.className = 'text-muted';
            const allergieEm = document.createElement('em');
            allergieEm.textContent = sanitizeForDOM(g.allergien);
            allergieDiv.appendChild(allergieEm);

            row.appendChild(nameDiv);
            row.appendChild(allergieDiv);
            gl.appendChild(row);
        });
    }

    const btnCopy = document.getElementById('btn-copy-id');
    if (btnCopy) {
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(bookingId).then(() => alert('Booking-ID kopiert!'));
        };
    }

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

// app.js - Refactored renderManageView
function renderManageView(res) {
    document.getElementById('lookup-step')?.classList.add('hidden');
    document.getElementById('manage-edit-step')?.classList.remove('hidden');

    document.getElementById('manage-booking-id').textContent = sanitizeForDOM(res.bookingId);
    document.getElementById('manage-date').textContent = sanitizeForDOM(formatDateCH(res.datum));

    const payEl = document.getElementById('manage-payment-status');
    if (payEl && res.paymentInfo) {
        payEl.replaceChildren();
        const { totalPaid, isFullyPaid } = res.paymentInfo;
        const total = res.gaeste.length;

        const statusSpan = document.createElement('span');
        statusSpan.style.fontWeight = '700';

        if (isFullyPaid) {
            statusSpan.style.color = 'var(--status-success-text)';
            statusSpan.textContent = `Bezahlt (${totalPaid}/${total})`;
        } else if (totalPaid > 0) {
            statusSpan.style.color = 'var(--status-warning-text)';
            statusSpan.textContent = `Teilweise bezahlt (${totalPaid}/${total})`;
        } else {
            statusSpan.style.color = 'var(--status-danger-text)';
            statusSpan.textContent = 'Noch nicht bezahlt';
        }
        payEl.appendChild(statusSpan);
    }

    const container = document.getElementById('manage-guests-container');
    if (container) {
        container.replaceChildren();

        res.gaeste.forEach((g, i) => {
            // Container für die Gast-Karte
            const card = document.createElement('div');
            card.className = 'guest-card mb-2';

            // Titel
            const title = document.createElement('h4');
            title.style.cssText = 'color:var(--primary-dark);margin-bottom:12px;';
            title.textContent = `Gast ${i + 1}`;
            card.appendChild(title);

            // Form-Row
            const row = document.createElement('div');
            row.className = 'form-row';

            // Hilfsfunktion zur Erstellung von Formularfeldern
            const createField = (labelTxt, cssClass, type, value, isRequired) => {
                const group = document.createElement('div');
                group.className = 'form-group';

                const label = document.createElement('label');
                label.textContent = labelTxt;

                const input = document.createElement('input');
                input.type = type;
                input.className = cssClass;
                input.value = sanitizeForDOM(value); // Zuweisung an .value property kombiniert mit Sanitisierung
                if (isRequired) input.required = true;

                group.appendChild(label);
                group.appendChild(input);
                return group;
            };

            row.appendChild(createField('Vorname', 'm-vorname', 'text', g.vorname, true));
            row.appendChild(createField('Nachname', 'm-nachname', 'text', g.nachname, true));
            row.appendChild(createField('E-Mail', 'm-email', 'email', g.email, false));
            card.appendChild(row);

            // Allergie / Präferenzen (ganze Breite)
            card.appendChild(createField('Allergie / Präferenzen', 'm-allergie', 'text', g.allergien, true));

            container.appendChild(card);
        });
    }
}

async function handleManageUpdateSubmit(e) {
    e.preventDefault();
    if (!currentManageBooking) return;

    const alertBox = document.getElementById('manage-alert');
    alertBox?.classList.add('hidden');

    const updatedGaeste = [];
    let hasError = false;

    document.querySelectorAll('#manage-guests-container .guest-card').forEach((card) => {
        const rawV = card.querySelector('.m-vorname')?.value || '';
        const rawN = card.querySelector('.m-nachname')?.value || '';
        const rawEm = card.querySelector('.m-email')?.value || '';
        const rawAl = card.querySelector('.m-allergie')?.value || '';

        if (hasInvalidCharacters(rawV) || hasInvalidCharacters(rawN) || hasInvalidCharacters(rawEm, true) || hasInvalidCharacters(rawAl)) {
            hasError = true;
        }

        if (rawV.trim() && rawN.trim()) {
            updatedGaeste.push({ 
                vorname: sanitizeForBackend(rawV), 
                nachname: sanitizeForBackend(rawN), 
                email: sanitizeForBackend(rawEm, true), 
                allergien: sanitizeForBackend(rawAl) 
            });
        }
    });

    if (hasError) {
        if (alertBox) {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = 'Fehler: Unzulässige Sonderzeichen in den Feldern. Bitte korrigieren.';
            alertBox.classList.remove('hidden');
        }
        return;
    }

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

// Backend-Sanitisierung: Verhindert Formula Injection und filtert Sonderzeichen
function sanitizeForBackend(str, isEmail = false) {
    if (!str) return '';
    let val = String(str);
    // Verhindere Google Sheets Formel-Injektion (Zellen, die mit = + - @ beginnen)
    val = val.replace(/^[=+\-@\s]+/g, '');
    if (isEmail) {
        // Erlaubt für Emails: a-z, 0-9, @, ., -, _
        val = val.replace(/[^a-zA-Z0-9@.\-_]/g, '');
    } else {
        // Erlaubt für Namen/Allergien: Buchstaben (inkl. Umlaute), Zahlen, Leerschlag, Bindestrich und &, (, ), ., ,
        val = val.replace(/[^a-zA-Z0-9\s\-äöüÄÖÜßéèêàâôûùç&(),.]/g, '');
    }
    return val.trim();
}

function hasInvalidCharacters(str, isEmail = false) {
    if (!str) return false;
    // Prüft auf Formula-Injection-Zeichen am Anfang
    if (/^[=+\-@\s]/.test(str)) return true;
    
    if (isEmail) {
        return /[^a-zA-Z0-9@.\-_]/.test(str);
    } else {
        // Prüft, ob ein unerlaubtes Sonderzeichen im Text enthalten ist
        return /[^a-zA-Z0-9\s\-äöüÄÖÜßéèêàâôûùç&(),.]/.test(str);
    }
}

// DOM-Sanitisierung: Extrem schnell, verhindert rudimentäres HTML für Textknoten
function sanitizeForDOM(str) {
    if (!str) return '';
    return String(str).replace(/[<>]/g, '');
}
