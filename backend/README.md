# Free Outdoor Event Weather App - Backend

This is the Flask backend for the Free Outdoor Event Weather App.

## Features
- Exposes `/weather` endpoint
- Accepts: `lat`, `lon`, `date` (YYYY-MM-DD)
- Fetches weather data from Open-Meteo API
- Classifies weather conditions (Very Hot, Very Cold, Very Windy, Very Wet, Very Uncomfortable)
- Returns JSON with location, date, summary, and condition cards

## Setup

1. Install Python 3.9+
2. Create a virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```powershell
   pip install flask requests
   ```
4. Run the server:
   ```powershell
   flask run
   ```

The server will start on http://127.0.0.1:5000

## API Example

```
POST /weather
{
  "lat": 40.7128,
  "lon": -74.0060,
  "date": "2025-09-15"
}
```

## Response
```
{
  "location_name": "New York, USA",
  "date": "2025-09-15",
  "summary": "This day looks uncomfortable for hiking. Best to plan indoors.",
  "conditions": [
    { "label": "Very Hot", "icon": "☀️", "risk": "⚠️ Very Hot", "advice": "Pack extra water and sunscreen.", "color": "red" },
    ...
  ]
}
```
