"use strict";

const byId = (id) => document.getElementById(id);
const search = byId("search");
const settings = byId("settings");
const keyInput = byId("api-key");
const cityInput = byId("city");
const status = byId("status");
const weather = byId("weather");
const favoriteButton = byId("favorite");
const favoriteChips = byId("favorites");
const favoritesKey = "skyline-favorite-cities";
const dayMs = 86400000;
const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const icons = {
  "01d": "☀️", "01n": "🌙", "02d": "🌤️", "02n": "☁️", "03": "☁️",
  "04": "☁️", "09": "🌧️", "10": "🌦️", "11": "⛈️", "13": "❄️", "50": "🌫️"
};
const sample = {
  location: "San Francisco, US",
  query: "San Francisco, US",
  current: { main: { temp: 17, feels_like: 16, humidity: 72 }, wind: { speed: 5.4 },
    weather: [{ icon: "02d", description: "partly cloudy" }] },
  days: [
    [17, 12, "02d", "Partly cloudy"], [18, 12, "01d", "Clear skies"],
    [16, 11, "04d", "Cloudy"], [15, 10, "10d", "Light rain"], [17, 11, "02d", "Partly cloudy"]
  ].map(([high, low, icon, description], index) => ({
    date: new Date(Date.UTC(2025, 0, 13 + index)), high, low, icon, description
  })),
  sample: true
};

let data = sample;
let unit = "C";
let apiKey = "";
let activeRequest;
let favorites = [];

try {
  const saved = JSON.parse(localStorage.getItem(favoritesKey));
  if (Array.isArray(saved)) {
    favorites = saved.filter((city) => typeof city?.location === "string" && typeof city.query === "string");
  }
} catch {
  // Favorites can still be used for this page if storage is unavailable.
}

try {
  apiKey = sessionStorage.getItem("skyline-api-key") || "";
} catch {
  // Searching still works if the browser blocks storage.
}

function showStatus(message = "", isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = !message;
}

function temperature(celsius) {
  return `${Math.round(unit === "F" ? celsius * 9 / 5 + 32 : celsius)}°${unit}`;
}

function weatherIcon(code) {
  return icons[code] || icons[code?.slice(0, 2)] || "☁️";
}

function dayCard(day) {
  const card = document.createElement("li");
  card.className = "day";
  const date = document.createElement("time");
  date.dateTime = day.date.toISOString().slice(0, 10);
  date.textContent = weekday.format(day.date);
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = weatherIcon(day.icon);
  const description = document.createElement("p");
  description.textContent = day.description;
  const range = document.createElement("div");
  range.className = "range";
  range.setAttribute("aria-label", `High ${temperature(day.high)}, low ${temperature(day.low)}`);
  const low = document.createElement("span");
  low.textContent = temperature(day.low);
  range.append(temperature(day.high), low);
  card.append(date, icon, description, range);
  return card;
}

function renderFavorite() {
  const saved = favorites.some((city) => city.location === data.location);
  favoriteButton.textContent = saved ? "♥" : "♡";
  favoriteButton.setAttribute("aria-label", `Favorite ${data.location}`);
  favoriteButton.setAttribute("aria-pressed", saved);
  favoriteButton.hidden = false;
}

function renderFavoriteChips() {
  favoriteChips.replaceChildren(...favorites.map(({ location, query }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = location;
    chip.addEventListener("click", () => {
      cityInput.value = query;
      search.requestSubmit();
    });
    return chip;
  }));
  favoriteChips.hidden = favorites.length === 0;
}

favoriteButton.addEventListener("click", () => {
  const { location, query } = data;
  favorites = favorites.some((city) => city.location === location)
    ? favorites.filter((city) => city.location !== location)
    : [...favorites, { location, query }];
  try {
    localStorage.setItem(favoritesKey, JSON.stringify(favorites));
  } catch {
    showStatus("Favorites are available until you close or reload this page. Browser storage is unavailable.", true);
  }
  renderFavorite();
  renderFavoriteChips();
});

function render() {
  const { current } = data;
  const condition = current.weather[0];
  byId("data-label").textContent = data.sample ? "Sample weather" : "Current conditions";
  byId("location").textContent = data.location;
  renderFavorite();
  byId("temperature").textContent = temperature(current.main.temp);
  byId("condition").textContent = condition.description;
  byId("current-icon").textContent = weatherIcon(condition.icon);
  byId("feels").textContent = temperature(current.main.feels_like);
  byId("humidity").textContent = `${current.main.humidity}%`;
  const speed = current.wind.speed * (unit === "F" ? 2.23694 : 3.6);
  byId("wind").textContent = `${Math.round(speed)} ${unit === "F" ? "mph" : "km/h"}`;
  byId("days").replaceChildren(...data.days.map(dayCard));
  byId("celsius").setAttribute("aria-pressed", unit === "C");
  byId("fahrenheit").setAttribute("aria-pressed", unit === "F");
}

function forecastDays(forecast, current) {
  const offset = forecast.city.timezone;
  const today = Math.floor((current.dt + offset) * 1000 / dayMs);
  const groups = new Map();
  for (const entry of forecast.list) {
    const localTime = (entry.dt + offset) * 1000;
    const day = Math.floor(localTime / dayMs);
    const date = new Date(localTime);
    const fromNoon = Math.abs(date.getUTCHours() * 60 + date.getUTCMinutes() - 720);
    const existing = groups.get(day);
    if (existing) {
      existing.high = Math.max(existing.high, entry.main.temp_max);
      existing.low = Math.min(existing.low, entry.main.temp_min);
      if (fromNoon >= existing.fromNoon) continue;
    }
    groups.set(day, {
      date: new Date(day * dayMs),
      high: existing?.high ?? entry.main.temp_max,
      low: existing?.low ?? entry.main.temp_min,
      icon: entry.weather[0].icon,
      description: entry.weather[0].description,
      fromNoon
    });
  }
  const ordered = [...groups].sort(([first], [second]) => first - second);
  const upcoming = ordered.filter(([day]) => day > today);
  return (upcoming.length >= 5 ? upcoming : ordered).slice(0, 5).map(([, day]) => day);
}

async function request(path, params, signal) {
  const url = new URL(path, "https://api.openweathermap.org");
  url.search = new URLSearchParams({ ...params, appid: apiKey });
  const response = await fetch(url, { signal });
  if (response.status === 401 || response.status === 403) {
    settings.open = true;
    throw new Error("OpenWeatherMap rejected this key. Check that it is valid and active.");
  }
  if (response.status === 429) throw new Error("OpenWeatherMap’s request limit was reached. Try again later.");
  if (!response.ok) throw new Error("OpenWeatherMap couldn’t load the weather. Try again shortly.");
  return response.json();
}

async function loadCity(city) {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort("timeout"), 12000);
  weather.setAttribute("aria-busy", "true");
  showStatus(`Loading weather for ${city}…`);

  try {
    const locations = await request("/geo/1.0/direct", { q: city, limit: 1 }, controller.signal);
    const place = locations[0];
    if (!place) throw new Error(`City not found: ${city}. Check the spelling or add a country code.`);
    const params = { lat: place.lat, lon: place.lon, units: "metric" };
    const [current, forecast] = await Promise.all([
      request("/data/2.5/weather", params, controller.signal),
      request("/data/2.5/forecast", params, controller.signal)
    ]);
    const location = [place.name, place.state, countryNames.of(place.country)].filter(Boolean).join(", ");
    const days = forecastDays(forecast, current);
    if (days.length < 5) throw new Error("OpenWeatherMap returned an incomplete forecast. Try again shortly.");
    if (activeRequest !== controller) return;
    data = { current, location, days, query: city };
    render();
    showStatus();
  } catch (error) {
    if (activeRequest !== controller) return;
    const message = controller.signal.reason === "timeout"
      ? "The request timed out. Try again."
      : error instanceof TypeError
        ? "Couldn’t reach OpenWeatherMap. Check your connection and try again."
        : error instanceof SyntaxError
          ? "OpenWeatherMap returned an unreadable response. Try again shortly."
          : error.message;
    showStatus(message, true);
    controller.abort();
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      weather.setAttribute("aria-busy", "false");
      activeRequest = undefined;
    }
  }
}

search.addEventListener("submit", (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (!city) {
    showStatus("Enter a city name to search.", true);
    cityInput.focus();
    return;
  }
  if (!apiKey) {
    settings.open = true;
    showStatus("Enter your OpenWeatherMap API key to search for live weather.", true);
    keyInput.focus();
    return;
  }
  loadCity(city);
});

byId("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) {
    showStatus("Enter an OpenWeatherMap API key.", true);
    keyInput.focus();
    return;
  }
  apiKey = key;
  try {
    sessionStorage.setItem("skyline-api-key", apiKey);
  } catch {
    // Keep the key in memory if browser storage is disabled.
  }
  keyInput.value = "";
  settings.open = false;
  if (cityInput.value.trim()) search.requestSubmit();
  else showStatus("API key saved for this tab. Search for a city to load live weather.");
  cityInput.focus();
});

byId("celsius").addEventListener("click", () => { unit = "C"; render(); });
byId("fahrenheit").addEventListener("click", () => { unit = "F"; render(); });

renderFavoriteChips();
render();
