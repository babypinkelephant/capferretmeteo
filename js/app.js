// Cap Ferret Coordinates
const LAT = 44.62;
const LON = -1.24;

// WMO Weather code mapping to emoji and text
const weatherCodes = {
    0: { icon: '☀️', desc: 'Klarer Himmel' },
    1: { icon: '🌤️', desc: 'Überwiegend klar' },
    2: { icon: '⛅', desc: 'Teilweise bewölkt' },
    3: { icon: '☁️', desc: 'Bedeckt' },
    45: { icon: '🌫️', desc: 'Nebel' },
    48: { icon: '🌫️', desc: 'Raureifnebel' },
    51: { icon: '🌧️', desc: 'Leichter Nieselregen' },
    53: { icon: '🌧️', desc: 'Mäßiger Nieselregen' },
    55: { icon: '🌧️', desc: 'Dichter Nieselregen' },
    61: { icon: '🌧️', desc: 'Leichter Regen' },
    63: { icon: '🌧️', desc: 'Mäßiger Regen' },
    65: { icon: '🌧️', desc: 'Starker Regen' },
    71: { icon: '❄️', desc: 'Leichter Schneefall' },
    73: { icon: '❄️', desc: 'Mäßiger Schneefall' },
    75: { icon: '❄️', desc: 'Starker Schneefall' },
    80: { icon: '🌦️', desc: 'Leichte Regenschauer' },
    81: { icon: '🌦️', desc: 'Mäßige Regenschauer' },
    82: { icon: '⛈️', desc: 'Heftige Regenschauer' },
    95: { icon: '⛈️', desc: 'Gewitter' },
    96: { icon: '⛈️', desc: 'Gewitter mit Hagel' },
    99: { icon: '⛈️', desc: 'Schweres Gewitter mit Hagel' },
};

function getWeatherInfo(code) {
    return weatherCodes[code] || { icon: '❓', desc: 'Unbekannt' };
}

function getDayName(dateString) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const date = new Date(dateString);
    return days[date.getDay()];
}

async function fetchWeather() {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FBerlin`);
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        // Update Current Weather
        document.getElementById('current-temp').textContent = Math.round(data.current.temperature_2m);
        document.getElementById('wind-speed').textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
        document.getElementById('humidity').textContent = `${data.current.relative_humidity_2m} %`;
        
        const currentInfo = getWeatherInfo(data.current.weather_code);
        document.getElementById('weather-desc').textContent = `${currentInfo.icon} ${currentInfo.desc}`;
        
        // Update Forecast
        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = ''; // Clear previous
        
        // Skip today (index 0), show next 4 days
        for (let i = 1; i <= 4; i++) {
            const date = data.daily.time[i];
            const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
            const minTemp = Math.round(data.daily.temperature_2m_min[i]);
            const code = data.daily.weather_code[i];
            const info = getWeatherInfo(code);
            
            const html = `
                <div class="forecast-item">
                    <span class="forecast-day">${getDayName(date)}</span>
                    <span class="forecast-icon">${info.icon}</span>
                    <span class="forecast-temp">${maxTemp}° / ${minTemp}°</span>
                </div>
            `;
            forecastContainer.insertAdjacentHTML('beforeend', html);
        }
        
    } catch (error) {
        console.error('Error fetching weather data:', error);
        document.getElementById('weather-desc').textContent = '⚠️ Fehler beim Laden';
    }
}

// Fetch on load
document.addEventListener('DOMContentLoaded', fetchWeather);
