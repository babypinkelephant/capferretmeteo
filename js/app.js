const googleScriptUrl = "https://script.google.com/macros/s/AKfycbyBh5QG1q-YhsQLCqBvMWgKyx-5Rxo9yKXWLIelasjKoFb6iB_m7vMC1N65BKmsfuKWQw/exec";

let historyData = [];
let chartInstances = {};

// Tab Navigation Logik
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
}

async function init() {
    try {
        // 1. Current Data
        const resCurrent = await fetch(googleScriptUrl + "?type=current");
        const jsonCurrent = await resCurrent.json();
        if(jsonCurrent.observations && jsonCurrent.observations.length > 0) {
            updateCurrent(jsonCurrent.observations[0]);
        }

        // 2. History Data (Heute)
        const resHist = await fetch(googleScriptUrl + "?type=history");
        const jsonHist = await resHist.json();
        if(jsonHist.observations && jsonHist.observations.length > 0) {
            historyData = jsonHist.observations;
            renderTempChart(historyData);
            updateStats(historyData);
        }

        // 3. Archiv Daten laden
        const resArchiv = await fetch(googleScriptUrl + "?type=archiv");
        const jsonArchiv = await resArchiv.json();
        if(jsonArchiv && jsonArchiv.length > 0) {
            renderArchive(jsonArchiv);
        }

        document.getElementById('loader').classList.add('hidden');
        document.getElementById('tabMenu').classList.remove('hidden');
        document.getElementById('content').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        const loader = document.getElementById('loader');
        if (loader) loader.innerText = "⚠️ Verbindungsproblem beim Laden der Daten.";
    }
}

function updateCurrent(obs) {
    const now = new Date();
    const timeString = now.toLocaleDateString('de-CH') + ' ' + now.toLocaleTimeString('de-CH').slice(0,5);
    document.getElementById('timeUpdated').innerText = "Update: " + timeString + " Uhr";

    const val = (id, v, unit) => {
        const el = document.getElementById('val-' + id);
        if (el) el.innerText = (v !== undefined && v !== null) ? v + (unit ? " " + unit : "") : "--";
    };

    if (document.getElementById('temp')) {
        document.getElementById('temp').innerText = obs.metric.temp;
    }
    
    val('humidity', obs.humidity, "%");
    val('wind', obs.metric.windSpeed, "km/h");
    val('gust', obs.metric.windGust, "km/h");
    val('windDir', obs.winddir, "°");
    val('rain', obs.metric.precipRate, "mm/h");
    val('uv', obs.uv, "");
    val('pressure', obs.metric.pressure, "hPa");
    val('solar', obs.solarRadiation, "W/m²");
}

function updateStats(data) {
    let minVal = 100, maxVal = -100, sum = 0;
    let minTime = "", maxTime = "";

    data.forEach(d => {
        let t = d.metric.tempAvg;
        if (t < minVal) { minVal = t; minTime = d.obsTimeLocal; }
        if (t > maxVal) { maxVal = t; maxTime = d.obsTimeLocal; }
        sum += t;
    });

    let avg = (sum / data.length).toFixed(1);
    const fmt = (t) => t ? t.slice(11, 16) : "--:--";

    if (document.getElementById('stat-min')) document.getElementById('stat-min').innerText = minVal.toFixed(1) + "°";
    if (document.getElementById('time-min')) document.getElementById('time-min').innerText = fmt(minTime) + " Uhr";
    if (document.getElementById('stat-max')) document.getElementById('stat-max').innerText = maxVal.toFixed(1) + "°";
    if (document.getElementById('time-max')) document.getElementById('time-max').innerText = fmt(maxTime) + " Uhr";
    if (document.getElementById('stat-avg')) document.getElementById('stat-avg').innerText = avg + "°";
}

function renderArchive(data) {
    const container = document.getElementById('archiveContainer');
    if (!container) return;
    
    container.innerHTML = ""; 
    
    // Zeige die letzten 14 Tage an
    const daysToShow = data.slice(0, 14); 

    daysToShow.forEach(day => {
        const date = day["Datum"] || "--";
        const tempMin = day["Temp (MIN)"] !== undefined ? day["Temp (MIN)"] : "--";
        const tempMax = day["Temp (MAX)"] !== undefined ? day["Temp (MAX)"] : "--";
        const rain = day["Regen (Gesamt mm)"] !== undefined ? day["Regen (Gesamt mm)"] : "0";
        const gust = day["Böen (MAX)"] !== undefined ? day["Böen (MAX)"] : "--";
        const luxh = day["Licht (Gesamt Luxh)"] !== undefined ? day["Licht (Gesamt Luxh)"] : "--";

        const card = document.createElement('div');
        card.className = "archive-card";
        card.innerHTML = `
            <div class="ac-date">📅 ${date}</div>
            <div class="ac-row"><span class="ac-label">Temperatur:</span><span class="ac-val">${tempMin}° / ${tempMax}°</span></div>
            <div class="ac-row"><span class="ac-label">Regen:</span><span class="ac-val">${rain} mm</span></div>
            <div class="ac-row"><span class="ac-label">Spitzenböe:</span><span class="ac-val">${gust} km/h</span></div>
            <div class="ac-row"><span class="ac-label">Lux-Stunden:</span><span class="ac-val">${luxh}</span></div>
        `;
        container.appendChild(card);
    });
}

function renderTempChart(data) {
    const ctxEl = document.getElementById('tempChart');
    if (!ctxEl) return;
    
    const ctx = ctxEl.getContext('2d');
    const labels = data.map(d => d.obsTimeLocal.slice(11, 16));
    const temps = data.map(d => d.metric.tempAvg);

    if (chartInstances['tempMain']) chartInstances['tempMain'].destroy();

    // ChartJS defaults for aesthetics
    Chart.defaults.color = 'rgba(255, 255, 255, 0.8)';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    chartInstances['tempMain'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperatur',
                data: temps,
                borderColor: 'rgba(255, 255, 255, 0.9)', 
                borderWidth: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#1a202c', 
                    bodyColor: '#1a202c', 
                    displayColors: false,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: { label: function(context) { return context.parsed.y + ' °C'; } }
                }
            },
            scales: { 
                x: { display: true, grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)', maxTicksLimit: 6 } }, 
                y: { display: false } 
            }
        }
    });
}

window.openDetail = function(key, title) {
    const modal = document.getElementById('modal');
    const titleEl = document.getElementById('modalTitle');
    const ctxEl = document.getElementById('detailChart');
    
    if (!modal || !titleEl || !ctxEl) return;
    const ctx = ctxEl.getContext('2d');

    modal.classList.add('active');
    titleEl.innerText = title + " Verlauf (Heute)";

    const labels = historyData.map(d => d.obsTimeLocal.slice(11, 16));
    let values = [];
    
    if(key === 'humidity') values = historyData.map(d => d.humidityAvg);
    if(key === 'windSpeed') values = historyData.map(d => d.metric.windspeedAvg);
    if(key === 'windGust') values = historyData.map(d => d.metric.windgustHigh);
    if(key === 'windDir') values = historyData.map(d => d.winddirAvg);
    if(key === 'precipRate') values = historyData.map(d => d.metric.precipRate);
    if(key === 'pressure') values = historyData.map(d => d.metric.pressureMax);
    if(key === 'uv') values = historyData.map(d => d.uvHigh);
    if(key === 'solar') values = historyData.map(d => d.solarRadiationHigh);

    if(chartInstances['detail']) chartInstances['detail'].destroy();

    chartInstances['detail'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: title, data: values, borderColor: '#ffffff', 
                backgroundColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 3, fill: true, tension: 0.3, pointBackgroundColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { display: false }, ticks: { color: '#fff', maxTicksLimit: 6 } }
            }
        }
    });
};

window.closeModal = function() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('active');
};

// Check if we are on the meteo page before initializing
if (document.getElementById('tabMenu')) {
    document.addEventListener('DOMContentLoaded', init);
    setInterval(init, 300000);
}
