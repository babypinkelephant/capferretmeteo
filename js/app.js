const googleScriptUrl = "https://script.google.com/macros/s/AKfycbyBh5QG1q-YhsQLCqBvMWgKyx-5Rxo9yKXWLIelasjKoFb6iB_m7vMC1N65BKmsfuKWQw/exec";

let historyData = [];
let archiveDataGlobal = [];
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
            archiveDataGlobal = jsonArchiv;
            renderArchive(archiveDataGlobal);
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

function updateArchiveTimeframe() {
    renderArchive(archiveDataGlobal);
}

function renderArchive(data) {
    if (!data || data.length === 0) return;

    const timeframe = document.getElementById('archiveTimeframe') ? document.getElementById('archiveTimeframe').value : '14';
    let filteredData = data;
    
    if (timeframe !== 'all') {
        const days = parseInt(timeframe, 10);
        // The data is chronological (oldest to newest based on previous code). 
        // We want the last 'days' elements.
        filteredData = data.slice(-days);
    }

    const labels = filteredData.map(day => {
        let d = day["Datum"] || "--";
        if (d.includes("T")) d = d.split("T")[0]; // nur das Datum
        return d;
    });
    
    const parse = (val, fallback = null) => (val !== undefined && val !== "") ? parseFloat(val) : fallback;

    const tempAvg = filteredData.map(day => parse(day["Temp (avg)"]));
    const tempMins = filteredData.map(day => parse(day["Temp (MIN)"]));
    const tempMaxs = filteredData.map(day => parse(day["Temp (MAX)"]));
    
    const rains = filteredData.map(day => parse(day["Regen (Gesamt mm)"], 0));
    
    const windAvg = filteredData.map(day => parse(day["Wind-S (avg)"]));
    const windGusts = filteredData.map(day => parse(day["Böen (MAX)"]));
    
    const uvs = filteredData.map(day => parse(day["UV (MAX)"], 0));

    Chart.defaults.color = 'rgba(255, 255, 255, 0.8)';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    const xAxesOptions = {
        grid: { color: 'rgba(255,255,255,0.1)' }, 
        ticks: { color: 'rgba(255, 255, 255, 0.7)', maxTicksLimit: 7, maxRotation: 45, minRotation: 45 }
    };
    
    const tooltipsShared = {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1a202c', 
        bodyColor: '#1a202c', 
        cornerRadius: 8,
        padding: 10,
        mode: 'index',
        intersect: false
    };

    const pointOptions = {
        pointRadius: 0,
        pointHoverRadius: 6
    };

    // 1. Temperatur Diagramm
    const ctxTemp = document.getElementById('archiveChartTemp');
    if (ctxTemp) {
        if (chartInstances['archiveTemp']) chartInstances['archiveTemp'].destroy();
        chartInstances['archiveTemp'] = new Chart(ctxTemp.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Temp (MAX)',
                        data: tempMaxs,
                        borderColor: '#ff4d4d', // Rot
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        ...pointOptions
                    },
                    {
                        label: 'Temp (avg)',
                        data: tempAvg,
                        borderColor: '#ffffff', // Weiß
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        ...pointOptions
                    },
                    {
                        label: 'Temp (MIN)',
                        data: tempMins,
                        borderColor: '#3498db', // Blau
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        ...pointOptions
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, tooltip: tooltipsShared },
                scales: { 
                    x: xAxesOptions, 
                    y: { 
                        display: true, 
                        grid: { 
                            color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255,255,255,0.1)',
                            lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                    }
                }
            }
        });
    }

    // 2. Niederschlag Diagramm
    const ctxRain = document.getElementById('archiveChartRain');
    if (ctxRain) {
        if (chartInstances['archiveRain']) chartInstances['archiveRain'].destroy();
        chartInstances['archiveRain'] = new Chart(ctxRain.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Regen (mm)',
                    data: rains,
                    backgroundColor: 'rgba(9, 132, 227, 0.7)',
                    borderColor: 'rgba(9, 132, 227, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, tooltip: tooltipsShared },
                scales: { x: xAxesOptions, y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' } } }
            }
        });
    }

    // 3. Wind Diagramm
    const ctxWind = document.getElementById('archiveChartWind');
    if (ctxWind) {
        if (chartInstances['archiveWind']) chartInstances['archiveWind'].destroy();
        chartInstances['archiveWind'] = new Chart(ctxWind.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Böen (MAX) km/h',
                        data: windGusts,
                        borderColor: '#e1b12c',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        ...pointOptions
                    },
                    {
                        label: 'Wind-S (avg) km/h',
                        data: windAvg,
                        borderColor: '#fbc531',
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        ...pointOptions
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, tooltip: tooltipsShared },
                scales: { x: xAxesOptions, y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true } }
            }
        });
    }

    // 4. UV Diagramm
    const ctxUV = document.getElementById('archiveChartUV');
    if (ctxUV) {
        if (chartInstances['archiveUV']) chartInstances['archiveUV'].destroy();
        chartInstances['archiveUV'] = new Chart(ctxUV.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'UV Index (MAX)',
                    data: uvs,
                    borderColor: '#9c88ff',
                    backgroundColor: 'rgba(156, 136, 255, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    ...pointOptions
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, tooltip: tooltipsShared },
                scales: { x: xAxesOptions, y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true } }
            }
        });
    }
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
