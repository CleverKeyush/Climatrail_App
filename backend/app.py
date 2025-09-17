from flask import Flask, request, jsonify
import requests as pyrequests
from datetime import datetime

app = Flask(__name__)

# Helper: Classify weather conditions
CONDITION_RULES = [
    ("Very Hot", lambda t, *_: t > 35, "☀️", "⚠️ Very Hot", "Pack extra water and sunscreen.", "red"),
    ("Very Cold", lambda t, *_: t < 5, "❄️", "⚠️ Very Cold", "Dress warmly and watch for ice.", "blue"),
    ("Very Windy", lambda _, w, *__: w > 40, "💨", "⚠️ Very Windy", "Secure loose items and avoid open areas.", "gray"),
    ("Very Wet", lambda *_, p, **__: p > 10, "🌧️", "⚠️ Very Wet", "Bring rain gear and waterproof shoes.", "darkblue"),
    ("Very Uncomfortable", lambda *_, h: h > 80, "😓", "⚠️ Very Uncomfortable", "Stay hydrated and take breaks.", "orange"),
]

# Helper: Get location name (reverse geocode, fallback to lat/lon)
def get_location_name(lat, lon):
    try:
        resp = pyrequests.get(f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json", headers={"User-Agent": "weather-app"}, timeout=5)
        if resp.ok:
            data = resp.json()
            return data.get("display_name", f"{lat:.2f}, {lon:.2f}")
    except Exception:
        pass
    return f"{lat:.2f}, {lon:.2f}"

# Helper: Classify conditions
def classify_conditions(temp, wind, precip, humidity):
    results = []
    for label, rule, icon, risk, advice, color in CONDITION_RULES:
        if rule(temp, wind, precip, humidity):
            results.append({
                "label": label,
                "icon": icon,
                "risk": risk,
                "advice": advice,
                "color": color
            })
    return results

# Helper: Summary recommendation
def get_summary(conditions):
    if not conditions:
        return "Great day for outdoor activities!"
    if any(c["label"] in ["Very Hot", "Very Wet", "Very Uncomfortable"] for c in conditions):
        return "This day looks uncomfortable for hiking. Best to plan indoors."
    if any(c["label"] == "Very Windy" for c in conditions):
        return "Windy conditions. Caution advised for outdoor events."
    if any(c["label"] == "Very Cold" for c in conditions):
        return "Dress warmly for outdoor activities."
    return "Check conditions before heading out."

@app.route("/weather", methods=["POST"])
def weather():
    data = request.get_json(force=True)
    lat = data.get("lat")
    lon = data.get("lon")
    date = data.get("date")
    if not (lat and lon and date):
        return jsonify({"error": "Missing lat, lon, or date"}), 400
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
    except Exception:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    today = datetime.utcnow().date()
    is_past = dt.date() < today
    # Open-Meteo API
    base_url = "https://archive-api.open-meteo.com/v1/archive" if is_past else "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date,
        "end_date": date,
        "hourly": "temperature_2m,windspeed_10m,precipitation,relativehumidity_2m",
        "timezone": "auto"
    }
    try:
        resp = pyrequests.get(base_url, params=params, timeout=10)
        resp.raise_for_status()
        weather = resp.json()
        # Get daily averages
        h = weather["hourly"]
        temp = sum(h["temperature_2m"]) / len(h["temperature_2m"]) if h.get("temperature_2m") else 0
        wind = max(h["windspeed_10m"]) if h.get("windspeed_10m") else 0
        precip = sum(h.get("precipitation", [0]))
        humidity = sum(h["relativehumidity_2m"]) / len(h["relativehumidity_2m"]) if h.get("relativehumidity_2m") else 0
    except Exception as e:
        return jsonify({"error": f"Weather data unavailable: {str(e)}"}), 502
    conditions = classify_conditions(temp, wind, precip, humidity)
    location_name = get_location_name(lat, lon)
    summary = get_summary(conditions)
    return jsonify({
        "location_name": location_name,
        "date": date,
        "summary": summary,
        "conditions": conditions
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
