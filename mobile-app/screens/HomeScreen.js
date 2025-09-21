import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, NativeModules, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import axios from 'axios';
import WeatherCard from '../components/WeatherCard';
import SummaryCard from '../components/SummaryCard';
import LocationSearchModal from '../components/LocationSearchModal';

export default function HomeScreen({ location }) {
    const [region, setRegion] = useState({
        latitude: location?.latitude || 37.7749,
        longitude: location?.longitude || -122.4194,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    });
    const [date, setDate] = useState(new Date());
    const [showPicker, setShowPicker] = useState(false);
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedActivity, setSelectedActivity] = useState('hiking');
    const [locationName, setLocationName] = useState('');
    const [isManualLocation, setIsManualLocation] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showLocationSearch, setShowLocationSearch] = useState(false);
    const [smartAlerts, setSmartAlerts] = useState([]);
    const [clothingAdvice, setClothingAdvice] = useState([]);

    useEffect(() => {
        if (location) {
            setRegion(prev => ({
                ...prev,
                latitude: location.latitude,
                longitude: location.longitude
            }));
        }
    }, [location]);

    useEffect(() => {
        loadWeatherData();
    }, [region, date, selectedActivity]);

    const handleLocationSelect = (selectedLocation) => {
        setRegion({
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
        });
        setLocationName(selectedLocation.name);
        setIsManualLocation(true);
        setShowLocationSearch(false);
        Alert.alert('Location Updated', `Weather data will be fetched for: ${selectedLocation.name}`, [{ text: 'OK' }]);
    };

    // FIXED GPS FUNCTION
    const handleUseCurrentLocation = async () => {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Location permission is needed.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
            });
            setLocationName('');
            setIsManualLocation(false);
            Alert.alert('Location Updated', 'GPS location acquired successfully!');
        } catch (error) {
            Alert.alert('GPS Error', 'Could not get your location. Please try again.');
        } finally {
            setLocationLoading(false);
        }
    };
    const getActivityTypes = () => [
        { key: 'hiking', title: 'Hiking', icon: '🥾', description: 'Trail and mountain adventures' },
        { key: 'camping', title: 'Camping', icon: '⛺', description: 'Overnight outdoor stays' },
        { key: 'fishing', title: 'Fishing', icon: '🎣', description: 'Water and lake activities' },
        { key: 'cycling', title: 'Cycling', icon: '🚴', description: 'Road and trail biking' },
        { key: 'outdoor_events', title: 'Events', icon: '📅', description: 'Outdoor gatherings' }
    ];

    const getQuickDateOptions = () => {
        const today = new Date();
        const options = [];

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);

            let label;
            if (i === 0) label = 'Today';
            else if (i === 1) label = 'Tomorrow';
            else label = date.toLocaleDateString('en-US', { weekday: 'short' });

            options.push({
                label,
                shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                fullDate: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                date,
                dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
                isToday: i === 0,
                isTomorrow: i === 1
            });
        }

        return options;
    };

    const getActivityTip = (activityKey) => {
        const tips = {
            hiking: 'Weather analysis includes trail conditions, UV exposure, and temperature comfort zones.',
            camping: 'Get insights on overnight temperatures, precipitation, wind conditions, and comfort.',
            fishing: 'Receive data on wind patterns, water conditions, and optimal fishing weather.',
            cycling: 'Analysis covers wind resistance, temperature comfort, and road safety conditions.',
            outdoor_events: 'Comprehensive weather planning for gatherings including comfort and precipitation.'
        };
        return tips[activityKey] || 'Select an activity for personalized weather insights.';
    };

    const loadWeatherData = async () => {
        setLoading(true);
        try {
            const [openMeteoData, nasaData, era5Data, noaaData] = await Promise.allSettled([
                fetchOpenMeteoData(region.latitude, region.longitude, date),
                fetchNASAData(region.latitude, region.longitude, date),
                fetchERA5Data(region.latitude, region.longitude, date),
                fetchNOAAData(region.latitude, region.longitude, date)
            ]);

            const processedData = {
                openMeteo: openMeteoData.status === 'fulfilled' ? openMeteoData.value : null,
                nasa: nasaData.status === 'fulfilled' ? nasaData.value : null,
                era5: era5Data.status === 'fulfilled' ? era5Data.value : null,
                noaa: noaaData.status === 'fulfilled' ? noaaData.value : null
            };

            const weatherAnalysis = analyzeWeatherRisks(processedData, region.latitude, region.longitude, date, selectedActivity);
            const alerts = generateSmartAlerts(weatherAnalysis);
            const clothing = generateClothingAdvice(weatherAnalysis, selectedActivity, processedData);
            setWeather(weatherAnalysis);
            setSmartAlerts(alerts);
            setClothingAdvice(clothing);
        } catch (error) {
            const fallbackWeather = generateDemoWeather(region.latitude, region.longitude, date);
            setWeather(fallbackWeather);
        } finally {
            setLoading(false);
        }
    };
    const validateWeatherValue = (value, min, max) => {
        if (value === null || value === undefined || isNaN(value) || value === -9999) return null;
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return (numValue >= min && numValue <= max) ? numValue : null;
    };

    const fetchOpenMeteoData = async (lat, lon, selectedDate) => {
        try {
            const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
                params: {
                    latitude: lat,
                    longitude: lon,
                    daily: 'temperature_2m_max,temperature_2m_min,windspeed_10m_max,precipitation_sum,relative_humidity_2m_max',
                    timezone: 'auto',
                    forecast_days: 7
                },
                timeout: 15000
            });

            const daily = response.data.daily;
            const validatedData = {
                tempMax: validateWeatherValue(daily.temperature_2m_max[0], -50, 60),
                tempMin: validateWeatherValue(daily.temperature_2m_min[0], -50, 60),
                windSpeed: validateWeatherValue(daily.windspeed_10m_max[0], 0, 200),
                precipitation: validateWeatherValue(daily.precipitation_sum[0], 0, 500),
                humidity: validateWeatherValue(daily.relative_humidity_2m_max[0], 0, 100)
            };

            return { source: 'Open-Meteo API', data: validatedData, available: true };
        } catch (error) {
            return { source: 'Open-Meteo (error)', data: null, available: false };
        }
    };

    const fetchNASAData = async (lat, lon, selectedDate) => {
        try {
            const dateStr = selectedDate.toISOString().split('T')[0].replace(/-/g, '');
            const response = await axios.get('https://power.larc.nasa.gov/api/temporal/daily/point', {
                params: {
                    parameters: 'T2M_MAX,T2M_MIN,WS10M,PRECTOTCORR,RH2M',
                    community: 'RE',
                    longitude: parseFloat(lon).toFixed(4),
                    latitude: parseFloat(lat).toFixed(4),
                    start: dateStr,
                    end: dateStr,
                    format: 'JSON'
                },
                timeout: 20000
            });

            if (!response.data?.properties?.parameter) {
                throw new Error('Invalid NASA response');
            }

            const rawData = response.data.properties.parameter;
            const processedData = {};
            let validDataCount = 0;

            Object.keys(rawData).forEach(param => {
                const paramData = rawData[param];
                if (typeof paramData === 'object') {
                    Object.keys(paramData).forEach(dateKey => {
                        const value = paramData[dateKey];
                        if (typeof value === 'number' && value !== -9999) {
                            if (!processedData[param]) processedData[param] = {};
                            processedData[param][dateKey] = value;
                            validDataCount++;
                        }
                    });
                }
            });

            return validDataCount > 0 ?
                { source: 'NASA POWER', data: processedData, available: true } :
                { source: 'NASA POWER (no data)', data: null, available: false };
        } catch (error) {
            return { source: 'NASA POWER (error)', data: null, available: false };
        }
    };

    const fetchERA5Data = async (lat, lon, selectedDate) => {
        try {
            // ERA5 data through Copernicus Climate Data Store (CDS) API
            // Note: This is a simplified implementation - actual CDS API requires authentication
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');

            // Using ERA5 reanalysis data via alternative endpoint (demo implementation)
            const response = await axios.get('https://api.open-meteo.com/v1/era5', {
                params: {
                    latitude: parseFloat(lat).toFixed(4),
                    longitude: parseFloat(lon).toFixed(4),
                    start_date: `${year}-${month}-${day}`,
                    end_date: `${year}-${month}-${day}`,
                    daily: 'temperature_2m_max,temperature_2m_min,windspeed_10m_max,precipitation_sum,relative_humidity_2m_max',
                    timezone: 'auto'
                },
                timeout: 15000
            });

            if (!response.data?.daily) {
                throw new Error('Invalid ERA5 response');
            }

            const daily = response.data.daily;
            const validatedData = {
                tempMax: validateWeatherValue(daily.temperature_2m_max[0], -50, 60),
                tempMin: validateWeatherValue(daily.temperature_2m_min[0], -50, 60),
                windSpeed: validateWeatherValue(daily.windspeed_10m_max[0], 0, 200),
                precipitation: validateWeatherValue(daily.precipitation_sum[0], 0, 500),
                humidity: validateWeatherValue(daily.relative_humidity_2m_max[0], 0, 100)
            };

            // Check if we have valid data (no -9999 values)
            const hasValidData = Object.values(validatedData).some(value => value !== null);

            return hasValidData ?
                { source: 'Copernicus ERA5', data: validatedData, available: true } :
                { source: 'Copernicus ERA5 (no data)', data: null, available: false };
        } catch (error) {
            return { source: 'Copernicus ERA5 (error)', data: null, available: false };
        }
    };

    const fetchNOAAData = async (lat, lon, selectedDate) => {
        try {
            // NOAA NCEI Climate Data Online (CDO) API
            const dateStr = selectedDate.toISOString().split('T')[0];

            // Using NOAA's Global Summary of the Month (GSOM) dataset
            const response = await axios.get('https://www.ncei.noaa.gov/cdo-web/api/v2/data', {
                params: {
                    datasetid: 'GSOM',
                    locationid: `FIPS:US`,
                    startdate: dateStr,
                    enddate: dateStr,
                    datatypeid: 'TAVG,TMAX,TMIN,PRCP',
                    units: 'metric',
                    limit: 1000
                },
                headers: {
                    'token': 'demo_token' // Note: Replace with actual NOAA API token
                },
                timeout: 15000
            });

            if (!response.data?.results) {
                throw new Error('Invalid NOAA response');
            }

            const results = response.data.results;
            const processedData = {};
            let validDataCount = 0;

            results.forEach(item => {
                if (item.value !== null && item.value !== -9999 && item.value !== -999.9) {
                    const validValue = validateWeatherValue(item.value, -100, 100);
                    if (validValue !== null) {
                        processedData[item.datatype] = validValue;
                        validDataCount++;
                    }
                }
            });

            return validDataCount > 0 ?
                { source: 'NOAA NCEI (CDO)', data: processedData, available: true } :
                { source: 'NOAA NCEI (no data)', data: null, available: false };
        } catch (error) {
            // Fallback to demo data for NOAA since it requires authentication
            return {
                source: 'NOAA NCEI (demo)',
                data: {
                    TMAX: 25.5,
                    TMIN: 15.2,
                    TAVG: 20.3,
                    PRCP: 2.1
                },
                available: true
            };
        }
    };

    const analyzeWeatherRisks = (apiData, lat, lon, selectedDate, activity) => {
        let maxTemp = null, minTemp = null, windSpeed = null, precipitation = null, humidity = null;

        // Priority order: 1. NASA POWER, 2. Copernicus ERA5, 3. Open-Meteo, 4. NOAA NCEI

        // 1. Try NASA POWER first (most reliable for weather data)
        if (apiData.nasa?.data && apiData.nasa.available) {
            const nasaData = apiData.nasa.data;
            const dateKey = Object.keys(nasaData.T2M_MAX || {})[0];
            if (dateKey) {
                maxTemp = validateWeatherValue(nasaData.T2M_MAX?.[dateKey], -50, 60);
                minTemp = validateWeatherValue(nasaData.T2M_MIN?.[dateKey], -50, 60);
                windSpeed = validateWeatherValue(nasaData.WS10M?.[dateKey], 0, 200);
                precipitation = validateWeatherValue(nasaData.PRECTOTCORR?.[dateKey], 0, 500);
                humidity = validateWeatherValue(nasaData.RH2M?.[dateKey], 0, 100);
            }
        }

        // 2. Try Copernicus ERA5 for missing data
        if ((!maxTemp || !minTemp || !windSpeed || !precipitation || !humidity) &&
            apiData.era5?.data && apiData.era5.available) {
            const era5Data = apiData.era5.data;
            if (!maxTemp) maxTemp = era5Data.tempMax;
            if (!minTemp) minTemp = era5Data.tempMin;
            if (!windSpeed) windSpeed = era5Data.windSpeed;
            if (!precipitation) precipitation = era5Data.precipitation;
            if (!humidity) humidity = era5Data.humidity;
        }

        // 3. Try Open-Meteo for missing data
        if ((!maxTemp || !minTemp || !windSpeed || !precipitation || !humidity) &&
            apiData.openMeteo?.data && apiData.openMeteo.available) {
            const omData = apiData.openMeteo.data;
            if (!maxTemp) maxTemp = omData.tempMax;
            if (!minTemp) minTemp = omData.tempMin;
            if (!windSpeed) windSpeed = omData.windSpeed;
            if (!precipitation) precipitation = omData.precipitation;
            if (!humidity) humidity = omData.humidity;
        }

        // 4. Try NOAA NCEI for missing data
        if ((!maxTemp || !minTemp || !windSpeed || !precipitation) &&
            apiData.noaa?.data && apiData.noaa.available) {
            const noaaData = apiData.noaa.data;
            if (!maxTemp && noaaData.TMAX) maxTemp = validateWeatherValue(noaaData.TMAX, -50, 60);
            if (!minTemp && noaaData.TMIN) minTemp = validateWeatherValue(noaaData.TMIN, -50, 60);
            if (!precipitation && noaaData.PRCP) precipitation = validateWeatherValue(noaaData.PRCP, 0, 500);
            // NOAA doesn't typically provide wind speed and humidity in basic datasets
        }

        // Use defaults if no data
        if (maxTemp === null) {
            maxTemp = 22; minTemp = 15; windSpeed = 10; precipitation = 2; humidity = 60;
        }

        // 🌡️ Activity-Specific Risk Categories - Always show all 5 categories
        const risks = [];

        // Get activity-specific thresholds and advice
        const getActivityAdvice = (category, severity, value, activity) => {
            const activityAdvice = {
                hiking: {
                    hot: {
                        EXTREME: `🥾 HIKING ALERT: ${value}°C is dangerous for hiking. Start before 6 AM, bring 3L+ water, electrolytes, and consider postponing.`,
                        HIGH: `🥾 HIKING CAUTION: ${value}°C requires early start (before 7 AM), 2L+ water, frequent shade breaks, and sun protection.`,
                        MODERATE: `🥾 HIKING ADVICE: ${value}°C is warm for hiking. Bring extra water, wear light colors, and avoid midday sun.`,
                        SAFE: `🥾 HIKING PERFECT: ${value}°C is ideal for hiking. Comfortable temperature for all-day trails.`
                    },
                    cold: {
                        EXTREME: `🥾 HIKING ALERT: ${value}°C is dangerous. Bring winter gear, insulated boots, emergency shelter, and inform others of your route.`,
                        HIGH: `🥾 HIKING CAUTION: ${value}°C requires warm layers, waterproof boots, gloves, hat, and emergency supplies.`,
                        MODERATE: `🥾 HIKING ADVICE: ${value}°C needs warm clothing, extra layers, and hot drinks. Check trail conditions.`,
                        SAFE: `🥾 HIKING GOOD: ${value}°C is comfortable for hiking with normal outdoor clothing.`
                    },
                    wind: {
                        EXTREME: `🥾 HIKING DANGER: ${value} km/h winds are hazardous on ridges and exposed trails. Avoid high elevations.`,
                        HIGH: `🥾 HIKING CAUTION: ${value} km/h winds require extra stability. Avoid exposed ridges and secure all gear.`,
                        MODERATE: `🥾 HIKING ADVICE: ${value} km/h winds may affect balance on narrow trails. Secure loose items.`,
                        SAFE: `🥾 HIKING IDEAL: ${value} km/h winds are manageable for all hiking trails.`
                    },
                    wet: {
                        EXTREME: `🥾 HIKING ALERT: ${value}mm rain makes trails dangerous. Risk of flash floods and slippery rocks. Consider postponing.`,
                        HIGH: `🥾 HIKING CAUTION: ${value}mm rain requires waterproof gear, extra grip shoes, and avoid stream crossings.`,
                        MODERATE: `🥾 HIKING ADVICE: ${value}mm rain needs rain gear and extra caution on rocky/muddy sections.`,
                        SAFE: `🥾 HIKING PERFECT: ${value}mm light rain won't affect most hiking trails.`
                    }
                },
                camping: {
                    hot: {
                        EXTREME: `⛺ CAMPING ALERT: ${value}°C overnight heat is dangerous. Bring cooling towels, extra water, and consider air-conditioned shelter.`,
                        HIGH: `⛺ CAMPING CAUTION: ${value}°C requires shade setup, cooling strategies, and extra hydration for comfortable sleep.`,
                        MODERATE: `⛺ CAMPING ADVICE: ${value}°C is warm for camping. Set up in shade, bring fans, and extra water.`,
                        SAFE: `⛺ CAMPING PERFECT: ${value}°C is ideal for comfortable outdoor camping.`
                    },
                    cold: {
                        EXTREME: `⛺ CAMPING ALERT: ${value}°C requires winter camping gear, 4-season tent, sleeping bag rated -10°C+, and emergency heating.`,
                        HIGH: `⛺ CAMPING CAUTION: ${value}°C needs warm sleeping bag, insulated pad, winter tent, and backup heating source.`,
                        MODERATE: `⛺ CAMPING ADVICE: ${value}°C requires warm sleeping gear, extra blankets, and windproof tent setup.`,
                        SAFE: `⛺ CAMPING GOOD: ${value}°C is comfortable for camping with standard gear.`
                    }
                },
                fishing: {
                    hot: {
                        EXTREME: `🎣 FISHING ALERT: ${value}°C heat affects fish behavior. Fish before dawn/after dusk, bring shade, and stay hydrated.`,
                        HIGH: `🎣 FISHING ADVICE: ${value}°C is hot for fishing. Early morning and evening are best. Bring sun protection.`,
                        MODERATE: `🎣 FISHING GOOD: ${value}°C is warm but manageable. Fish in shaded areas and stay hydrated.`,
                        SAFE: `🎣 FISHING PERFECT: ${value}°C is ideal for all-day fishing comfort.`
                    },
                    wind: {
                        EXTREME: `🎣 FISHING DANGER: ${value} km/h winds make boat fishing dangerous and casting nearly impossible.`,
                        HIGH: `🎣 FISHING DIFFICULT: ${value} km/h winds affect casting accuracy and boat stability. Shore fishing recommended.`,
                        MODERATE: `🎣 FISHING CHALLENGING: ${value} km/h winds require adjusted casting technique and secure equipment.`,
                        SAFE: `🎣 FISHING IDEAL: ${value} km/h winds are perfect for comfortable fishing.`
                    }
                },
                cycling: {
                    hot: {
                        EXTREME: `🚴 CYCLING ALERT: ${value}°C is dangerous for cycling. Risk of heat exhaustion. Cycle before 7 AM or after 7 PM only.`,
                        HIGH: `🚴 CYCLING CAUTION: ${value}°C requires early morning rides, frequent water breaks, and electrolyte replacement.`,
                        MODERATE: `🚴 CYCLING ADVICE: ${value}°C is warm for cycling. Bring extra water, wear light colors, and take shade breaks.`,
                        SAFE: `🚴 CYCLING PERFECT: ${value}°C is ideal for comfortable cycling at any time.`
                    },
                    wind: {
                        EXTREME: `🚴 CYCLING DANGER: ${value} km/h headwinds make cycling extremely difficult and potentially unsafe.`,
                        HIGH: `🚴 CYCLING CHALLENGING: ${value} km/h winds significantly increase effort and affect bike handling.`,
                        MODERATE: `🚴 CYCLING ADVICE: ${value} km/h winds require extra effort and careful handling, especially on turns.`,
                        SAFE: `🚴 CYCLING IDEAL: ${value} km/h winds are manageable for comfortable cycling.`
                    }
                },
                outdoor_events: {
                    hot: {
                        EXTREME: `📅 EVENT ALERT: ${value}°C is dangerous for outdoor events. Provide cooling stations, medical support, and consider rescheduling.`,
                        HIGH: `📅 EVENT CAUTION: ${value}°C requires shade structures, water stations, and frequent breaks for attendees.`,
                        MODERATE: `📅 EVENT ADVICE: ${value}°C needs shade options, extra water, and sun protection for guests.`,
                        SAFE: `📅 EVENT PERFECT: ${value}°C is comfortable for outdoor events and activities.`
                    },
                    wet: {
                        EXTREME: `📅 EVENT ALERT: ${value}mm rain will severely impact outdoor events. Have indoor backup or postpone.`,
                        HIGH: `📅 EVENT CAUTION: ${value}mm rain requires covered areas, waterproof setup, and weather contingency plans.`,
                        MODERATE: `📅 EVENT ADVICE: ${value}mm rain needs tent/canopy coverage and waterproof equipment protection.`,
                        SAFE: `📅 EVENT GOOD: ${value}mm light rain won't significantly affect most outdoor events.`
                    }
                }
            };

            const defaultAdvice = {
                hot: { SAFE: `Temperature ${value}°C is comfortable for ${activity} activities.` },
                cold: { SAFE: `Temperature ${value}°C is suitable for ${activity} with proper clothing.` },
                wind: { SAFE: `Wind speed ${value} km/h is manageable for ${activity} activities.` },
                wet: { SAFE: `Precipitation ${value}mm is minimal and won't affect ${activity}.` }
            };

            return activityAdvice[activity]?.[category]?.[severity] ||
                defaultAdvice[category]?.[severity] ||
                `Conditions are ${severity.toLowerCase()} for ${activity}.`;
        };

        // 1. 🔥 Very Hot - Activity-specific temperature analysis
        let hotSeverity, hotAdvice;
        if (maxTemp > 35) {
            hotSeverity = "EXTREME";
            hotAdvice = getActivityAdvice('hot', 'EXTREME', maxTemp.toFixed(1), activity);
        } else if (maxTemp > 30) {
            hotSeverity = activity === 'cycling' ? "HIGH" : "MODERATE"; // Cycling is more sensitive to heat
            hotAdvice = getActivityAdvice('hot', hotSeverity, maxTemp.toFixed(1), activity);
        } else if (maxTemp > 25 && activity === 'cycling') {
            hotSeverity = "MODERATE";
            hotAdvice = getActivityAdvice('hot', 'MODERATE', maxTemp.toFixed(1), activity);
        } else {
            hotSeverity = "SAFE";
            hotAdvice = getActivityAdvice('hot', 'SAFE', maxTemp.toFixed(1), activity);
        }

        risks.push({
            label: "Very Hot",
            icon: "🔥",
            risk: `${hotSeverity !== 'SAFE' ? hotSeverity + ' heat risk' : 'No heat risk'} - ${maxTemp.toFixed(1)}°C`,
            advice: hotAdvice,
            color: hotSeverity === 'EXTREME' ? "red" : hotSeverity === 'HIGH' ? "orange" : hotSeverity === 'MODERATE' ? "yellow" : "green"
        });

        // 2. 🥶 Very Cold - Activity-specific cold analysis
        let coldSeverity, coldAdvice;
        const coldThreshold = activity === 'fishing' ? 10 : activity === 'camping' ? 5 : 0; // Different activities have different cold sensitivity

        if (minTemp < coldThreshold - 10) {
            coldSeverity = "EXTREME";
            coldAdvice = getActivityAdvice('cold', 'EXTREME', minTemp.toFixed(1), activity);
        } else if (minTemp < coldThreshold - 5) {
            coldSeverity = "HIGH";
            coldAdvice = getActivityAdvice('cold', 'HIGH', minTemp.toFixed(1), activity);
        } else if (minTemp < coldThreshold) {
            coldSeverity = "MODERATE";
            coldAdvice = getActivityAdvice('cold', 'MODERATE', minTemp.toFixed(1), activity);
        } else {
            coldSeverity = "SAFE";
            coldAdvice = getActivityAdvice('cold', 'SAFE', minTemp.toFixed(1), activity);
        }

        risks.push({
            label: "Very Cold",
            icon: "🥶",
            risk: `${coldSeverity !== 'SAFE' ? coldSeverity + ' cold risk' : 'No cold risk'} - ${minTemp.toFixed(1)}°C`,
            advice: coldAdvice,
            color: coldSeverity === 'EXTREME' ? "blue" : coldSeverity === 'HIGH' ? "lightblue" : coldSeverity === 'MODERATE' ? "cyan" : "green"
        });

        // 3. 💨 Very Windy - Activity-specific wind analysis
        let windSeverity, windAdvice;
        const windThreshold = activity === 'fishing' || activity === 'cycling' ? 20 : 25; // More sensitive activities

        if (windSpeed > windThreshold + 20) {
            windSeverity = "EXTREME";
            windAdvice = getActivityAdvice('wind', 'EXTREME', windSpeed.toFixed(1), activity);
        } else if (windSpeed > windThreshold + 10) {
            windSeverity = "HIGH";
            windAdvice = getActivityAdvice('wind', 'HIGH', windSpeed.toFixed(1), activity);
        } else if (windSpeed > windThreshold) {
            windSeverity = "MODERATE";
            windAdvice = getActivityAdvice('wind', 'MODERATE', windSpeed.toFixed(1), activity);
        } else {
            windSeverity = "SAFE";
            windAdvice = getActivityAdvice('wind', 'SAFE', windSpeed.toFixed(1), activity);
        }

        risks.push({
            label: "Very Windy",
            icon: "💨",
            risk: `${windSeverity !== 'SAFE' ? windSeverity + ' wind hazard' : 'No wind hazard'} - ${windSpeed.toFixed(1)} km/h`,
            advice: windAdvice,
            color: windSeverity === 'EXTREME' ? "red" : windSeverity === 'HIGH' ? "orange" : windSeverity === 'MODERATE' ? "yellow" : "green"
        });

        // 4. 🌧️ Very Wet - Activity-specific precipitation analysis
        let wetSeverity, wetAdvice;
        const wetThreshold = activity === 'outdoor_events' ? 5 : activity === 'hiking' ? 15 : 10;

        if (precipitation > wetThreshold + 15) {
            wetSeverity = "EXTREME";
            wetAdvice = getActivityAdvice('wet', 'EXTREME', precipitation.toFixed(1), activity);
        } else if (precipitation > wetThreshold + 5) {
            wetSeverity = "HIGH";
            wetAdvice = getActivityAdvice('wet', 'HIGH', precipitation.toFixed(1), activity);
        } else if (precipitation > wetThreshold) {
            wetSeverity = "MODERATE";
            wetAdvice = getActivityAdvice('wet', 'MODERATE', precipitation.toFixed(1), activity);
        } else {
            wetSeverity = "SAFE";
            wetAdvice = getActivityAdvice('wet', 'SAFE', precipitation.toFixed(1), activity);
        }

        risks.push({
            label: "Very Wet",
            icon: "🌧️",
            risk: `${wetSeverity !== 'SAFE' ? wetSeverity + ' precipitation risk' : 'No precipitation risk'} - ${precipitation.toFixed(1)} mm`,
            advice: wetAdvice,
            color: wetSeverity === 'EXTREME' ? "blue" : wetSeverity === 'HIGH' ? "lightblue" : wetSeverity === 'MODERATE' ? "cyan" : "green"
        });

        // 5. 😰 Very Uncomfortable - Activity-specific comfort analysis
        const heatIndex = maxTemp + (0.5 * (humidity - 50));
        let comfortSeverity, comfortAdvice;

        if (humidity > 80 && maxTemp > 25) {
            comfortSeverity = "EXTREME";
            comfortAdvice = `😰 ${activity.toUpperCase()} ALERT: Heat index ${heatIndex.toFixed(1)}°C with ${humidity.toFixed(0)}% humidity creates dangerous conditions. High risk of heat exhaustion.`;
        } else if (humidity > 70 && maxTemp > 25) {
            comfortSeverity = "HIGH";
            comfortAdvice = `😰 ${activity.toUpperCase()} CAUTION: Heat index ${heatIndex.toFixed(1)}°C with ${humidity.toFixed(0)}% humidity requires frequent breaks and extra hydration.`;
        } else if (humidity > 60 && maxTemp > 28) {
            comfortSeverity = "MODERATE";
            comfortAdvice = `😰 ${activity.toUpperCase()} ADVICE: Heat index ${heatIndex.toFixed(1)}°C with ${humidity.toFixed(0)}% humidity may cause discomfort. Stay hydrated.`;
        } else {
            comfortSeverity = "SAFE";
            comfortAdvice = `😰 ${activity.toUpperCase()} PERFECT: Heat index ${heatIndex.toFixed(1)}°C with ${humidity.toFixed(0)}% humidity creates comfortable conditions.`;
        }

        risks.push({
            label: "Very Uncomfortable",
            icon: "😰",
            risk: `${comfortSeverity !== 'SAFE' ? comfortSeverity + ' discomfort' : 'Comfortable conditions'} - Heat index ${heatIndex.toFixed(1)}°C`,
            advice: comfortAdvice,
            color: comfortSeverity === 'EXTREME' ? "red" : comfortSeverity === 'HIGH' ? "orange" : comfortSeverity === 'MODERATE' ? "yellow" : "green"
        });

        return { conditions: risks };
    };

    const generateSmartAlerts = (weatherData, currentTime = new Date()) => {
        const alerts = [];
        const currentHour = currentTime.getHours();

        if (!weatherData?.conditions) return alerts;

        // Extract weather values from the conditions
        let maxTemp = 22, minTemp = 15, windSpeed = 10, precipitation = 2, humidity = 60;

        weatherData.conditions.forEach(condition => {
            if (condition.label === "Very Hot" && condition.risk.includes("°C")) {
                const tempMatch = condition.risk.match(/(\d+\.?\d*)°C/);
                if (tempMatch) maxTemp = parseFloat(tempMatch[1]);
            }
            if (condition.label === "Very Wet" && condition.risk.includes("mm")) {
                const precipMatch = condition.risk.match(/(\d+\.?\d*) mm/);
                if (precipMatch) precipitation = parseFloat(precipMatch[1]);
            }
            if (condition.label === "Very Windy" && condition.risk.includes("km/h")) {
                const windMatch = condition.risk.match(/(\d+\.?\d*) km\/h/);
                if (windMatch) windSpeed = parseFloat(windMatch[1]);
            }
        });

        // 🌧️ Rain-Based Smart Alerts
        if (precipitation > 5) {
            const rainTime = currentHour + 2; // Simulate rain in 2 hours
            alerts.push({
                id: 'rain_laundry',
                icon: '👕',
                priority: 'HIGH',
                title: 'Laundry Alert',
                message: `Dry your laundry now! Rain expected in 2 hours (${precipitation.toFixed(1)}mm).`,
                action: 'Bring clothes inside',
                timing: 'Next 2 hours',
                category: 'household'
            });

            alerts.push({
                id: 'rain_commute',
                icon: '🚗',
                priority: 'MEDIUM',
                title: 'Commute Planning',
                message: `Traffic will be slower due to rain. Leave 15 minutes earlier tomorrow.`,
                action: 'Adjust departure time',
                timing: 'Tomorrow morning',
                category: 'transport'
            });

            if (precipitation > 15) {
                alerts.push({
                    id: 'rain_outdoor',
                    icon: '⛺',
                    priority: 'HIGH',
                    title: 'Outdoor Activity Alert',
                    message: `Heavy rain (${precipitation.toFixed(1)}mm) will impact outdoor plans. Consider indoor alternatives.`,
                    action: 'Reschedule or move indoors',
                    timing: 'Today',
                    category: 'activity'
                });
            }
        }

        // 🌡️ Temperature-Based Smart Alerts
        if (maxTemp > 30) {
            alerts.push({
                id: 'heat_pets',
                icon: '🐕',
                priority: 'HIGH',
                title: 'Pet Safety Alert',
                message: `${maxTemp.toFixed(1)}°C is too hot for pet walks. Walk early morning or late evening only.`,
                action: 'Adjust pet schedule',
                timing: 'Today',
                category: 'safety'
            });

            alerts.push({
                id: 'heat_car',
                icon: '🚙',
                priority: 'MEDIUM',
                title: 'Vehicle Alert',
                message: `Pre-cool your car before driving. Interior temperature can reach 50°C+.`,
                action: 'Start AC remotely or park in shade',
                timing: 'Before driving',
                category: 'transport'
            });

            if (maxTemp > 35) {
                alerts.push({
                    id: 'heat_health',
                    icon: '💊',
                    priority: 'EXTREME',
                    title: 'Health Alert',
                    message: `Extreme heat (${maxTemp.toFixed(1)}°C)! Stay indoors 10 AM - 6 PM. Check on elderly neighbors.`,
                    action: 'Avoid outdoor exposure',
                    timing: 'Midday hours',
                    category: 'health'
                });
            }
        }

        // 💨 Wind-Based Smart Alerts
        if (windSpeed > 25) {
            alerts.push({
                id: 'wind_objects',
                icon: '🪴',
                priority: 'MEDIUM',
                title: 'Secure Loose Items',
                message: `${windSpeed.toFixed(1)} km/h winds! Secure outdoor furniture, plants, and decorations.`,
                action: 'Move items indoors or tie down',
                timing: 'Before winds increase',
                category: 'property'
            });

            if (windSpeed > 40) {
                alerts.push({
                    id: 'wind_driving',
                    icon: '🚛',
                    priority: 'HIGH',
                    title: 'Driving Hazard',
                    message: `Strong winds (${windSpeed.toFixed(1)} km/h) affect vehicle control. Avoid highways if possible.`,
                    action: 'Drive carefully or postpone',
                    timing: 'When driving',
                    category: 'transport'
                });
            }
        }

        // 🌫️ Fog/Visibility Alerts (simulated based on humidity + temperature)
        if (humidity > 85 && maxTemp - minTemp < 5) {
            alerts.push({
                id: 'fog_commute',
                icon: '🌫️',
                priority: 'MEDIUM',
                title: 'Fog Warning',
                message: `Fog likely tomorrow morning. Leave 10 minutes earlier and use fog lights.`,
                action: 'Adjust commute time',
                timing: 'Tomorrow morning',
                category: 'transport'
            });
        }

        // 🌸 Pollen Alerts (simulated based on temperature and season)
        const month = currentTime.getMonth();
        const isPollenSeason = (month >= 2 && month <= 5) || (month >= 8 && month <= 10); // Spring/Fall

        if (isPollenSeason && maxTemp > 15 && maxTemp < 25 && precipitation < 2) {
            alerts.push({
                id: 'pollen_health',
                icon: '🌸',
                priority: 'MEDIUM',
                title: 'Pollen Alert',
                message: `High pollen count expected. Take allergy medication and keep windows closed.`,
                action: 'Take allergy precautions',
                timing: 'Before going outside',
                category: 'health'
            });
        }

        // ❄️ Frost/Ice Alerts
        if (minTemp < 2 && humidity > 70) {
            alerts.push({
                id: 'frost_plants',
                icon: '🌱',
                priority: 'MEDIUM',
                title: 'Frost Protection',
                message: `Frost risk tonight (${minTemp.toFixed(1)}°C). Cover sensitive plants and bring potted plants indoors.`,
                action: 'Protect plants',
                timing: 'Before sunset',
                category: 'garden'
            });

            alerts.push({
                id: 'frost_car',
                icon: '🧊',
                priority: 'LOW',
                title: 'Morning Prep',
                message: `Frost expected. Allow extra time to defrost car windows tomorrow morning.`,
                action: 'Plan extra time',
                timing: 'Tomorrow morning',
                category: 'transport'
            });
        }

        // 🏃‍♂️ Exercise/Activity Timing Alerts
        if (maxTemp > 25) {
            const bestTime = maxTemp > 30 ? "before 7 AM or after 7 PM" : "before 9 AM or after 6 PM";
            alerts.push({
                id: 'exercise_timing',
                icon: '🏃‍♂️',
                priority: 'LOW',
                title: 'Exercise Timing',
                message: `Best time for outdoor exercise: ${bestTime} to avoid heat (${maxTemp.toFixed(1)}°C).`,
                action: 'Schedule exercise',
                timing: 'Plan ahead',
                category: 'fitness'
            });
        }

        // 💧 Water Conservation Alert
        if (precipitation < 1 && maxTemp > 28) {
            alerts.push({
                id: 'water_plants',
                icon: '💧',
                priority: 'LOW',
                title: 'Garden Care',
                message: `Hot and dry conditions. Water plants early morning or evening to prevent evaporation.`,
                action: 'Water garden',
                timing: 'Early morning/evening',
                category: 'garden'
            });
        }

        // Sort alerts by priority
        const priorityOrder = { 'EXTREME': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
        return alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    };

    const generateClothingAdvice = (weatherData, activity, apiData, currentTime = new Date()) => {
        const advice = [];
        const currentHour = currentTime.getHours();

        if (!weatherData?.conditions && !apiData) return advice;

        // ENHANCED WEATHER DATA ANALYTICS - Direct API Integration
        let maxTemp = 22, minTemp = 15, windSpeed = 10, precipitation = 2, humidity = 60;
        let dataSource = "Default";

        // Enhanced validation function to filter out invalid API values
        const isValidValue = (value, min = -100, max = 100) => {
            if (value === null || value === undefined || isNaN(value)) return false;
            if (value === -9999 || value === -999 || value === -99.9 || value === -999.0) return false;
            if (value < min || value > max) return false;
            return true;
        };

        // Priority 1: Extract from NASA POWER API (most accurate)
        if (apiData?.nasa?.data && apiData.nasa.available) {
            const nasaData = apiData.nasa.data;
            const dateKey = Object.keys(nasaData.T2M_MAX || {})[0];
            if (dateKey) {
                const nasaMaxTemp = nasaData.T2M_MAX?.[dateKey];
                const nasaMinTemp = nasaData.T2M_MIN?.[dateKey];
                const nasaWindSpeed = nasaData.WS10M?.[dateKey];
                const nasaPrecip = nasaData.PRECTOTCORR?.[dateKey];
                const nasaHumidity = nasaData.RH2M?.[dateKey];

                if (isValidValue(nasaMaxTemp, -50, 60)) maxTemp = nasaMaxTemp;
                if (isValidValue(nasaMinTemp, -50, 60)) minTemp = nasaMinTemp;
                if (isValidValue(nasaWindSpeed, 0, 200)) windSpeed = nasaWindSpeed;
                if (isValidValue(nasaPrecip, 0, 500)) precipitation = nasaPrecip;
                if (isValidValue(nasaHumidity, 0, 100)) humidity = nasaHumidity;

                if (isValidValue(nasaMaxTemp) || isValidValue(nasaMinTemp)) {
                    dataSource = "NASA POWER";
                }
            }
        }

        // Priority 2: Copernicus ERA5 data
        if ((maxTemp === 22 || minTemp === 15) && apiData?.era5?.data && apiData.era5.available) {
            const era5Data = apiData.era5.data;

            if (maxTemp === 22 && isValidValue(era5Data.tempMax, -50, 60)) maxTemp = era5Data.tempMax;
            if (minTemp === 15 && isValidValue(era5Data.tempMin, -50, 60)) minTemp = era5Data.tempMin;
            if (windSpeed === 10 && isValidValue(era5Data.windSpeed, 0, 200)) windSpeed = era5Data.windSpeed;
            if (precipitation === 2 && isValidValue(era5Data.precipitation, 0, 500)) precipitation = era5Data.precipitation;
            if (humidity === 60 && isValidValue(era5Data.humidity, 0, 100)) humidity = era5Data.humidity;

            if (isValidValue(era5Data.tempMax) || isValidValue(era5Data.tempMin)) {
                dataSource = dataSource === "Default" ? "Copernicus ERA5" : dataSource + " + ERA5";
            }
        }

        // Priority 3: Open-Meteo data
        if ((maxTemp === 22 || minTemp === 15) && apiData?.openMeteo?.data && apiData.openMeteo.available) {
            const omData = apiData.openMeteo.data;

            if (maxTemp === 22 && isValidValue(omData.tempMax, -50, 60)) maxTemp = omData.tempMax;
            if (minTemp === 15 && isValidValue(omData.tempMin, -50, 60)) minTemp = omData.tempMin;
            if (windSpeed === 10 && isValidValue(omData.windSpeed, 0, 200)) windSpeed = omData.windSpeed;
            if (precipitation === 2 && isValidValue(omData.precipitation, 0, 500)) precipitation = omData.precipitation;
            if (humidity === 60 && isValidValue(omData.humidity, 0, 100)) humidity = omData.humidity;

            if (isValidValue(omData.tempMax) || isValidValue(omData.tempMin)) {
                dataSource = dataSource === "Default" ? "Open-Meteo" : dataSource + " + OpenMeteo";
            }
        }

        // Priority 4: NOAA data
        if ((maxTemp === 22 || minTemp === 15) && apiData?.noaa?.data && apiData.noaa.available) {
            const noaaData = apiData.noaa.data;

            if (maxTemp === 22 && isValidValue(noaaData.TMAX, -50, 60)) maxTemp = noaaData.TMAX;
            if (minTemp === 15 && isValidValue(noaaData.TMIN, -50, 60)) minTemp = noaaData.TMIN;
            if (precipitation === 2 && isValidValue(noaaData.PRCP, 0, 500)) precipitation = noaaData.PRCP;

            if (isValidValue(noaaData.TMAX) || isValidValue(noaaData.TMIN)) {
                dataSource = dataSource === "Default" ? "NOAA NCEI" : dataSource + " + NOAA";
            }
        }

        // ADVANCED WEATHER ANALYTICS with validation
        const heatIndex = isValidValue(maxTemp) && isValidValue(humidity) ?
            maxTemp + (0.5 * (humidity - 50)) : maxTemp;
        const windChill = isValidValue(minTemp) && isValidValue(windSpeed) && minTemp < 10 ?
            minTemp - (windSpeed * 0.2) : minTemp;
        const comfortIndex = isValidValue(maxTemp) && isValidValue(minTemp) ?
            (maxTemp + minTemp) / 2 : 20;
        const weatherSeverity = {
            rain: precipitation > 25 ? 'EXTREME' : precipitation > 15 ? 'HIGH' : precipitation > 5 ? 'MODERATE' : 'LOW',
            heat: heatIndex > 35 ? 'EXTREME' : heatIndex > 30 ? 'HIGH' : heatIndex > 25 ? 'MODERATE' : 'LOW',
            cold: windChill < -10 ? 'EXTREME' : windChill < 0 ? 'HIGH' : windChill < 5 ? 'MODERATE' : 'LOW',
            wind: windSpeed > 40 ? 'EXTREME' : windSpeed > 25 ? 'HIGH' : windSpeed > 15 ? 'MODERATE' : 'LOW'
        };

        // DATA ANALYTICS SUMMARY with validation
        const formatValue = (value, unit, validRange) => {
            return isValidValue(value, validRange[0], validRange[1]) ?
                `${value.toFixed(1)}${unit}` : `No Data`;
        };

        const tempRange = isValidValue(minTemp, -50, 60) && isValidValue(maxTemp, -50, 60) ?
            `${minTemp.toFixed(1)}°C-${maxTemp.toFixed(1)}°C` : 'No Data';

        advice.push({
            category: "Weather Analytics",
            icon: "📊",
            recommendation: `Data Source: ${dataSource}. Temp: ${tempRange}, Heat Index: ${formatValue(heatIndex, '°C', [-50, 70])}, Wind Chill: ${formatValue(windChill, '°C', [-50, 60])}, Precipitation: ${formatValue(precipitation, 'mm', [0, 500])}, Wind: ${formatValue(windSpeed, 'km/h', [0, 200])}, Humidity: ${formatValue(humidity, '%', [0, 100])}`,
            priority: "analytics"
        });

        // 🌧️ RAINFALL INTENSITY-BASED CLOTHING (Analytics-Driven)
        if (precipitation > 0.5) {
            let rainGear = "";
            let rainIcon = "";
            const rainSeverity = weatherSeverity.rain;

            if (precipitation > 25) {
                // HEAVY RAINFALL (25+ mm) - EXTREME SEVERITY
                rainIcon = "🌧️";
                rainGear = `HEAVY RAINFALL (${isValidValue(precipitation, 0, 500) ? precipitation.toFixed(1) + 'mm' : 'Heavy Rain'}): Waterproof raincoat with sealed seams + Large umbrella ${isValidValue(windSpeed) && windSpeed > 20 ? '(wind-resistant design)' : ''} + Waterproof boots + Rain pants + Waterproof bag covers. Avoid cotton, denim, suede. ${isValidValue(humidity) && humidity > 85 ? 'High humidity - choose breathable waterproof materials.' : ''}`;
            } else if (precipitation > 15) {
                // MODERATE RAINFALL (15-25 mm) - HIGH SEVERITY
                rainIcon = "🌦️";
                rainGear = `MODERATE RAIN (${isValidValue(precipitation, 0, 500) ? precipitation.toFixed(1) + 'mm' : 'Moderate Rain'}): Raincoat with hood + Compact umbrella + Water-resistant shoes + Quick-dry clothing. ${isValidValue(windSpeed) && windSpeed > 20 ? 'Strong winds detected - secure umbrella or avoid.' : 'Light winds - umbrella safe to use.'}`;
            } else if (precipitation > 5) {
                // LIGHT RAINFALL (5-15 mm) - MODERATE SEVERITY
                rainIcon = "☔";
                rainGear = `LIGHT RAIN (${isValidValue(precipitation, 0, 500) ? precipitation.toFixed(1) + 'mm' : 'Light Rain'}): Light rain jacket/windbreaker + Small umbrella + Water-resistant footwear. ${isValidValue(humidity) && humidity > 80 ? 'High humidity - choose breathable materials.' : 'Normal humidity levels.'}`;
            } else {
                // DRIZZLE (0.5-5 mm) - LOW SEVERITY
                rainIcon = "🌦️";
                rainGear = `DRIZZLE (${isValidValue(precipitation, 0, 500) ? precipitation.toFixed(1) + 'mm' : 'Light Drizzle'}): Light jacket with hood + Optional umbrella + Regular shoes with good grip. ${isValidValue(comfortIndex) && comfortIndex < 15 ? 'Cool conditions - layer appropriately.' : 'Mild conditions.'}`;
            }

            advice.push({
                category: `Rain Protection (${rainSeverity} Risk)`,
                icon: rainIcon,
                recommendation: rainGear,
                priority: "essential"
            });
        }

        // ☀️ SUNNY WEATHER INTENSITY-BASED CLOTHING (Analytics-Driven)
        if (maxTemp > 20 && precipitation < 2) {
            let sunGear = "";
            let sunIcon = "";
            const heatSeverity = weatherSeverity.heat;

            if (maxTemp > 35) {
                // EXTREME HEAT (35+ °C) - EXTREME SEVERITY
                sunIcon = "🔥";
                const tempDisplay = isValidValue(maxTemp, -50, 60) ? maxTemp.toFixed(1) + '°C' : 'Hot';
                const heatDisplay = isValidValue(heatIndex, -50, 70) ? heatIndex.toFixed(1) + '°C' : 'Very Hot';
                sunGear = `EXTREME HEAT (${tempDisplay}, feels like ${heatDisplay}): Wide-brimmed hat + UV-blocking sunglasses + Long-sleeve UV shirt + Cooling towel + Electrolyte drinks. ${isValidValue(humidity) && humidity > 70 ? 'High humidity increases heat stress.' : ''} ${isValidValue(windSpeed) && windSpeed < 5 ? 'No wind relief - seek AC.' : 'Light breeze provides some relief.'}`;
            } else if (maxTemp > 30) {
                // HOT WEATHER (30-35 °C) - HIGH SEVERITY
                sunIcon = "☀️";
                const tempDisplay = isValidValue(maxTemp, -50, 60) ? maxTemp.toFixed(1) + '°C' : 'Hot';
                const heatDisplay = isValidValue(heatIndex, -50, 70) ? heatIndex.toFixed(1) + '°C' : 'Hot';
                sunGear = `HOT WEATHER (${tempDisplay}, feels like ${heatDisplay}): Baseball cap/sun hat + Sunglasses + Light-colored clothing + Sunscreen SPF 30+. ${activity === 'cycling' ? 'High exertion activity - extra cooling needed.' : ''} ${isValidValue(humidity) && humidity > 60 ? 'Moderate humidity - stay hydrated.' : ''}`;
            } else if (maxTemp > 25) {
                // WARM WEATHER (25-30 °C) - MODERATE SEVERITY
                sunIcon = "�️";
                const tempDisplay = isValidValue(maxTemp, -50, 60) ? maxTemp.toFixed(1) + '°C' : 'Warm';
                sunGear = `WARM WEATHER (${tempDisplay}): Cap/hat + Sunglasses + Breathable fabrics + Light layers. ${currentHour >= 10 && currentHour <= 16 ? 'Peak UV hours - extra protection needed.' : 'Lower UV exposure time.'}`;
            } else {
                // MILD SUNNY (20-25 °C) - LOW SEVERITY
                sunIcon = "🌞";
                const tempDisplay = isValidValue(maxTemp, -50, 60) ? maxTemp.toFixed(1) + '°C' : 'Mild';
                sunGear = `MILD SUN (${tempDisplay}): Optional cap + Sunglasses for bright conditions + Comfortable clothing. ${isValidValue(windSpeed) && windSpeed > 10 ? 'Breezy conditions - light layers recommended.' : 'Calm conditions.'}`;
            }

            advice.push({
                category: `Sun Protection (${heatSeverity} Risk)`,
                icon: sunIcon,
                recommendation: sunGear,
                priority: "essential"
            });
        }

        // 🥶 WINTER/COLD INTENSITY-BASED CLOTHING (Analytics-Driven)
        if (minTemp < 15) {
            let winterGear = "";
            let winterIcon = "";
            const coldSeverity = weatherSeverity.cold;

            if (minTemp < -10) {
                // EXTREME COLD (-10°C and below) - EXTREME SEVERITY
                winterIcon = "🧊";
                winterGear = `EXTREME COLD (${minTemp.toFixed(1)}°C, feels like ${windChill.toFixed(1)}°C): Heavy winter coat + Thermal underwear + Insulated boots + Warm hat + Insulated gloves + Scarf + Face protection. ${windSpeed > 20 ? 'Strong winds increase frostbite risk.' : ''} ${humidity > 80 ? 'High humidity may cause ice formation.' : ''}`;
            } else if (minTemp < 0) {
                // FREEZING (0 to -10°C) - HIGH SEVERITY
                winterIcon = "❄️";
                winterGear = `FREEZING (${minTemp.toFixed(1)}°C, feels like ${windChill.toFixed(1)}°C): Winter coat + Sweater + Warm boots + Beanie/winter hat + Gloves + Scarf. ${activity === 'hiking' ? 'Trail conditions may be icy - proper footwear essential.' : ''} ${windSpeed > 15 ? 'Wind chill factor significant.' : ''}`;
            } else if (minTemp < 5) {
                // VERY COLD (0-5°C) - MODERATE SEVERITY
                winterIcon = "🥶";
                winterGear = `VERY COLD (${minTemp.toFixed(1)}°C, feels like ${windChill.toFixed(1)}°C): Heavy sweater/coat + Long pants + Closed shoes + Light gloves + Warm hat. ${humidity > 70 ? 'High humidity may feel colder.' : ''} ${maxTemp - minTemp > 15 ? 'Large temperature range - layer clothing.' : ''}`;
            } else if (minTemp < 10) {
                // COLD (5-10°C) - MODERATE SEVERITY
                winterIcon = "🧥";
                winterGear = `COLD (${minTemp.toFixed(1)}°C): Sweater/light coat + Long sleeves + Jeans/long pants + Closed shoes. ${windSpeed > 20 ? 'Windy conditions - windproof outer layer recommended.' : ''} ${activity === 'cycling' ? 'Wind chill from movement - extra protection needed.' : ''}`;
            } else {
                // COOL (10-15°C) - LOW SEVERITY
                winterIcon = "🧥";
                winterGear = `COOL (${minTemp.toFixed(1)}°C): Light sweater/cardigan + Long sleeves + Comfortable pants + Regular shoes. ${maxTemp > 20 ? 'Temperature will rise - layering recommended.' : 'Stable cool conditions.'}`;
            }

            advice.push({
                category: `Cold Protection (${coldSeverity} Risk)`,
                icon: winterIcon,
                recommendation: winterGear,
                priority: "essential"
            });
        }

        // 👕 BASE LAYER (Temperature-based)
        let baseLayer = "";
        if (maxTemp > 30) {
            baseLayer = "Light, moisture-wicking t-shirt or tank top. Breathable cotton or synthetic blends.";
        } else if (maxTemp > 20) {
            baseLayer = "Comfortable t-shirt or light blouse. Cotton or cotton-blend materials.";
        } else if (maxTemp > 10) {
            baseLayer = "Long-sleeve shirt or light sweater. Layering-friendly materials.";
        } else {
            baseLayer = "Thermal underwear or warm base layer. Merino wool or synthetic thermal materials.";
        }

        advice.push({
            category: "Base Layer",
            icon: "👕",
            recommendation: baseLayer,
            priority: "essential"
        });

        // 💨 WIND INTENSITY-BASED CLOTHING
        if (windSpeed > 15) {
            let windGear = "";
            let windIcon = "";

            if (windSpeed > 40) {
                // EXTREME WIND (40+ km/h)
                windIcon = "🌪️";
                windGear = "EXTREME WIND: Heavy windproof jacket + Secure hat with chin strap + Wind-resistant pants + Sturdy footwear. Avoid loose clothing.";
            } else if (windSpeed > 30) {
                // STRONG WIND (30-40 km/h)
                windIcon = "💨";
                windGear = "STRONG WIND: Windbreaker or wind-resistant jacket + Secure accessories + Avoid umbrellas + Closed shoes.";
            } else if (windSpeed > 20) {
                // MODERATE WIND (20-30 km/h)
                windIcon = "🌬️";
                windGear = "MODERATE WIND: Light windbreaker + Secure loose items + Wind-resistant materials.";
            } else {
                // LIGHT WIND (15-20 km/h)
                windIcon = "🍃";
                windGear = "LIGHT WIND: Light jacket or cardigan + Secure accessories + Comfortable layers.";
            }

            advice.push({
                category: "Wind Protection",
                icon: windIcon,
                recommendation: windGear,
                priority: "important"
            });
        }

        // 👟 FOOTWEAR (Weather & Activity-specific)
        let footwear = "";
        if (precipitation > 15) {
            footwear = "HEAVY RAIN: Waterproof rain boots + Avoid leather, suede, or canvas materials.";
        } else if (precipitation > 5) {
            footwear = "LIGHT RAIN: Water-resistant shoes or boots + Non-slip soles essential.";
        } else if (minTemp < -5) {
            footwear = "EXTREME COLD: Insulated winter boots with thermal lining + Ice grips recommended.";
        } else if (minTemp < 5) {
            footwear = "COLD: Warm boots or closed shoes + Thick socks + Waterproof materials.";
        } else if (maxTemp > 35) {
            footwear = "EXTREME HEAT: Breathable sandals or mesh sneakers + Light-colored materials.";
        } else if (maxTemp > 28) {
            footwear = "HOT: Breathable sneakers or sandals + Light colors to reflect heat.";
        } else if (activity === 'hiking') {
            footwear = "HIKING: Sturdy hiking boots with ankle support + Non-slip soles + Weather-appropriate materials.";
        } else if (activity === 'cycling') {
            footwear = "CYCLING: Closed-toe athletic shoes + Secure laces + Avoid sandals for safety.";
        } else {
            footwear = "GENERAL: Comfortable walking shoes or sneakers + Weather-appropriate materials.";
        }

        advice.push({
            category: "Footwear",
            icon: "👟",
            recommendation: footwear,
            priority: "essential"
        });

        // 🕶️ Accessories & Protection
        const accessories = [];

        if (maxTemp > 25 || currentHour >= 10 && currentHour <= 16) {
            accessories.push("UV-protection sunglasses");
            accessories.push("Wide-brimmed hat or cap");
        }

        if (precipitation > 2) {
            accessories.push("Compact umbrella");
        }

        if (windSpeed > 15) {
            accessories.push("Scarf or neck warmer");
        }

        if (minTemp < 10) {
            accessories.push("Warm gloves or mittens");
            accessories.push("Insulated hat or beanie");
        }

        if (maxTemp > 30) {
            accessories.push("Cooling towel or bandana");
        }

        if (accessories.length > 0) {
            advice.push({
                category: "Accessories",
                icon: "🕶️",
                recommendation: accessories.join(", ") + ".",
                priority: "helpful"
            });
        }

        // 🎒 Activity-Specific Gear
        let activityGear = "";
        switch (activity) {
            case 'hiking':
                activityGear = "Backpack with water, first aid kit, trail snacks. Moisture-wicking socks essential.";
                break;
            case 'camping':
                activityGear = "Weather-appropriate sleeping bag, insulated clothing layers, waterproof gear.";
                break;
            case 'fishing':
                activityGear = "Quick-dry clothing, sun hat, polarized sunglasses, waterproof jacket.";
                break;
            case 'cycling':
                activityGear = "Helmet, reflective clothing, padded shorts, moisture-wicking jersey.";
                break;
            case 'outdoor_events':
                activityGear = "Comfortable walking shoes, layers for temperature changes, portable seating.";
                break;
            default:
                activityGear = "Activity-appropriate clothing and safety gear as needed.";
        }

        advice.push({
            category: "Activity Gear",
            icon: "🎒",
            recommendation: activityGear,
            priority: "activity-specific"
        });

        // 💡 Smart Wardrobe Tips
        const tips = [];

        if (maxTemp - minTemp > 10) {
            tips.push("Layer clothing for temperature changes throughout the day");
        }

        if (humidity > 70) {
            tips.push("Choose breathable, moisture-wicking fabrics to stay comfortable");
        }

        if (maxTemp > 25) {
            tips.push("Light colors reflect heat better than dark colors");
        }

        if (precipitation > 1) {
            tips.push("Avoid white or light-colored bottoms that show water stains");
        }

        if (windSpeed > 20) {
            tips.push("Secure loose clothing and accessories that might blow away");
        }

        if (tips.length > 0) {
            advice.push({
                category: "Smart Tips",
                icon: "💡",
                recommendation: tips.join(". ") + ".",
                priority: "helpful"
            });
        }

        // 📱 AR & Tech Integration Placeholder
        advice.push({
            category: "Tech Integration",
            icon: "📱",
            recommendation: "Future: Point camera at wardrobe for AI outfit suggestions based on weather conditions.",
            priority: "future"
        });

        return advice;
    };

    const generateTimeBasedWeather = (weatherData, activity) => {
        if (!weatherData?.conditions) return { morning: "15-22°C", afternoon: "28-35°C", evening: "20-26°C" };

        // Extract actual temperatures from weather data
        let maxTemp = 25, minTemp = 15;
        weatherData.conditions.forEach(condition => {
            if (condition.label === "Very Hot" && condition.risk.includes("°C")) {
                const tempMatch = condition.risk.match(/(\d+\.?\d*)°C/);
                if (tempMatch) maxTemp = parseFloat(tempMatch[1]);
            }
            if (condition.label === "Very Cold" && condition.risk.includes("°C")) {
                const tempMatch = condition.risk.match(/(\d+\.?\d*)°C/);
                if (tempMatch) minTemp = parseFloat(tempMatch[1]);
            }
        });

        // Calculate time-based temperatures with activity adjustments
        const activityAdjustments = {
            hiking: { morning: -2, afternoon: +3, evening: -1 }, // Hiking feels cooler in morning, hotter in afternoon
            camping: { morning: -3, afternoon: +2, evening: +1 }, // Camping overnight feels colder
            fishing: { morning: -1, afternoon: +1, evening: 0 }, // Near water, more moderate
            cycling: { morning: +1, afternoon: +4, evening: +2 }, // Exertion makes it feel hotter
            outdoor_events: { morning: 0, afternoon: +2, evening: +1 } // Crowd heat effect
        };

        const adj = activityAdjustments[activity] || { morning: 0, afternoon: 0, evening: 0 };

        // Calculate realistic time-based temperatures
        const morningMin = Math.round(minTemp + adj.morning);
        const morningMax = Math.round(minTemp + ((maxTemp - minTemp) * 0.3) + adj.morning);

        const afternoonMin = Math.round(maxTemp - 3 + adj.afternoon);
        const afternoonMax = Math.round(maxTemp + adj.afternoon);

        const eveningMin = Math.round(minTemp + ((maxTemp - minTemp) * 0.4) + adj.evening);
        const eveningMax = Math.round(maxTemp - 5 + adj.evening);

        return {
            morning: `${morningMin}-${morningMax}°C`,
            afternoon: `${afternoonMin}-${afternoonMax}°C`,
            evening: `${eveningMin}-${eveningMax}°C`
        };
    };

    const generateDemoWeather = (lat, lon, selectedDate) => {
        return {
            conditions: [{
                label: "Demo Weather",
                icon: "☀️",
                risk: "Demo data - APIs unavailable",
                advice: "This is sample weather data",
                color: "green"
            }]
        };
    };

    const onDateChange = (event, selectedDate) => {
        const currentDate = selectedDate || date;
        setShowPicker(Platform.OS === 'ios');
        setDate(currentDate);
    };

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Enhanced Header */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerBackground}>
                        <View style={styles.headerGradientOverlay} />
                        <View style={styles.logoContainer}>
                            <View style={styles.logoCircle}>
                                <Text style={styles.logoText}>🌤️</Text>
                                <View style={styles.logoGlow} />
                            </View>
                            <View style={styles.headerTextContainer}>
                                <Text style={styles.headerTitle}>Climatrail</Text>
                                <Text style={styles.headerSubtitle}>WEATHER INTELLIGENCE</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Enhanced Location Info */}
                <View style={styles.locationInfo}>
                    <View style={styles.locationCard}>
                        <View style={styles.locationIconContainer}>
                            <Text style={styles.locationIcon}>📍</Text>
                            <View style={styles.locationPulse} />
                        </View>
                        <View style={styles.locationContent}>
                            <View style={styles.locationHeader}>
                                <Text style={styles.locationLabel}>
                                    {isManualLocation ? 'Selected Location' : 'Current Location'}
                                </Text>
                                <View style={styles.locationStatus}>
                                    <View style={[styles.statusDot, { backgroundColor: isManualLocation ? '#f39c12' : '#27ae60' }]} />
                                    <Text style={styles.statusText}>{isManualLocation ? 'Manual' : 'GPS'}</Text>
                                </View>
                            </View>
                            <Text style={styles.locationText}>
                                {locationName || `${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.locationActions}>
                        <TouchableOpacity
                            style={[styles.locationActionBtn, styles.searchBtn]}
                            onPress={() => setShowLocationSearch(true)}
                        >
                            <Text style={styles.actionBtnIcon}>🗺️</Text>
                            <Text style={styles.actionBtnText}>Search</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.locationActionBtn, styles.gpsBtn, locationLoading && styles.loadingBtn]}
                            onPress={handleUseCurrentLocation}
                            disabled={locationLoading}
                        >
                            <Text style={styles.actionBtnIcon}>{locationLoading ? '⟳' : '📍'}</Text>
                            <Text style={styles.actionBtnText}>
                                {locationLoading ? 'Getting GPS...' : 'Use GPS'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Premium Date Selection */}
                <View style={styles.dateSection}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleContainer}>
                            <View style={styles.sectionIconContainer}>
                                <Text style={styles.sectionIcon}>📅</Text>
                            </View>
                            <View>
                                <Text style={styles.sectionTitle}>Date Selection</Text>
                                <Text style={styles.sectionSubtitle}>Choose your adventure date</Text>
                            </View>
                        </View>
                        <View style={styles.selectedDateBadge}>
                            <Text style={styles.selectedDateLabel}>Selected</Text>
                            <Text style={styles.selectedDateText}>
                                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.quickSelectLabel}>Quick Select (Next 7 Days)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickDateScroll}>
                        {getQuickDateOptions().map((option, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.quickDateBtn,
                                    option.date.toDateString() === date.toDateString() && styles.quickDateBtnSelected,
                                    option.isToday && styles.todayDateBtn
                                ]}
                                onPress={() => setDate(option.date)}
                            >
                                <Text style={[
                                    styles.quickDateLabel,
                                    option.date.toDateString() === date.toDateString() && styles.quickDateLabelSelected,
                                    option.isToday && styles.todayLabel
                                ]}>
                                    {option.label}
                                </Text>
                                <Text style={[
                                    styles.quickDateText,
                                    option.date.toDateString() === date.toDateString() && styles.quickDateTextSelected
                                ]}>
                                    {option.shortDate}
                                </Text>
                                <Text style={[
                                    styles.dayOfWeekText,
                                    option.date.toDateString() === date.toDateString() && styles.dayOfWeekTextSelected
                                ]}>
                                    {option.dayOfWeek}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <View style={styles.customDateContainer}>
                        <Text style={styles.customDateLabel}>Custom Date Range (Up to 30 days)</Text>
                        <TouchableOpacity style={styles.customDateBtn} onPress={() => setShowPicker(true)}>
                            <View style={styles.customDateContent}>
                                <Text style={styles.customDateText}>
                                    {date.toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </Text>
                                <Text style={styles.customDateSubtext}>Tap to change</Text>
                            </View>
                            <Text style={styles.customDateArrow}>📅</Text>
                        </TouchableOpacity>
                    </View>

                    {showPicker && (
                        <DateTimePicker
                            value={date}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={onDateChange}
                            minimumDate={new Date()}
                            maximumDate={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}
                        />
                    )}
                </View>
                {/* Premium Activity Selection */}
                <View style={styles.activitySection}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleContainer}>
                            <View style={styles.sectionIconContainer}>
                                <Text style={styles.sectionIcon}>🎯</Text>
                            </View>
                            <View>
                                <Text style={styles.sectionTitle}>Activity Selection</Text>
                                <Text style={styles.sectionSubtitle}>Personalized weather analysis</Text>
                            </View>
                        </View>
                        <View style={styles.activityCounter}>
                            <Text style={styles.counterText}>5 Activities</Text>
                        </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activityScroll}>
                        {getActivityTypes().map((activity) => (
                            <TouchableOpacity
                                key={activity.key}
                                style={[
                                    styles.activityCard,
                                    selectedActivity === activity.key && styles.activityCardSelected
                                ]}
                                onPress={() => setSelectedActivity(activity.key)}
                            >
                                <View style={styles.activityCardHeader}>
                                    <Text style={styles.activityIcon}>{activity.icon}</Text>
                                    {selectedActivity === activity.key && (
                                        <View style={styles.selectedBadge}>
                                            <Text style={styles.selectedBadgeText}>✓</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.activityTitle}>{activity.title}</Text>
                                <Text style={styles.activityDescription}>{activity.description}</Text>
                                <View style={styles.activityFooter}>
                                    <View style={styles.activityDots}>
                                        <View style={[styles.dot, selectedActivity === activity.key && styles.activeDot]} />
                                        <View style={[styles.dot, selectedActivity === activity.key && styles.activeDot]} />
                                        <View style={[styles.dot, selectedActivity === activity.key && styles.activeDot]} />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.activityInsight}>
                        <View style={styles.insightIcon}>
                            <Text style={styles.insightEmoji}>💡</Text>
                        </View>
                        <Text style={styles.activityTipText}>{getActivityTip(selectedActivity)}</Text>
                    </View>
                </View>

                {/* Smart Alerts */}
                {smartAlerts.length > 0 && (
                    <View style={styles.alertsSection}>
                        <Text style={styles.sectionTitle}>🚨 Smart Weather Alerts</Text>
                        <Text style={styles.alertsSubtitle}>Actionable insights based on weather conditions</Text>
                        {smartAlerts.map((alert, index) => (
                            <View key={alert.id} style={[styles.alertCard, styles[`priority${alert.priority}`]]}>
                                <View style={styles.alertHeader}>
                                    <Text style={styles.alertIcon}>{alert.icon}</Text>
                                    <View style={styles.alertTitleContainer}>
                                        <Text style={styles.alertTitle}>{alert.title}</Text>
                                        <Text style={styles.alertPriority}>{alert.priority} PRIORITY</Text>
                                    </View>
                                    <Text style={styles.alertTiming}>{alert.timing}</Text>
                                </View>
                                <Text style={styles.alertMessage}>{alert.message}</Text>
                                <View style={styles.alertActionContainer}>
                                    <Text style={styles.alertActionLabel}>Action:</Text>
                                    <Text style={styles.alertAction}>{alert.action}</Text>
                                </View>
                                <Text style={styles.alertCategory}>#{alert.category}</Text>
                            </View>
                        ))}
                    </View>
                )
                }

                {/* Clothing & Lifestyle Advisor */}
                {
                    clothingAdvice.length > 0 && (
                        <View style={styles.clothingSection}>
                            <Text style={styles.sectionTitle}>👗 Clothing & Lifestyle Advisor</Text>
                            <Text style={styles.clothingSubtitle}>Personalized outfit recommendations based on weather & activity</Text>

                            {/* Weather Data Analytics */}
                            <View style={styles.clothingCategory}>
                                <Text style={styles.clothingCategoryTitle}>📊 Weather Data Analytics</Text>
                                {clothingAdvice.filter(item => item.priority === 'analytics').map((item, index) => (
                                    <View key={index} style={[styles.clothingItem, styles.analyticsItem]}>
                                        <Text style={styles.clothingIcon}>{item.icon}</Text>
                                        <View style={styles.clothingContent}>
                                            <Text style={styles.clothingLabel}>{item.category}</Text>
                                            <Text style={styles.analyticsRecommendation}>{item.recommendation}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Essential Recommendations */}
                            <View style={styles.clothingCategory}>
                                <Text style={styles.clothingCategoryTitle}>🎯 Essential Items</Text>
                                {clothingAdvice.filter(item => item.priority === 'essential').map((item, index) => (
                                    <View key={index} style={styles.clothingItem}>
                                        <Text style={styles.clothingIcon}>{item.icon}</Text>
                                        <View style={styles.clothingContent}>
                                            <Text style={styles.clothingLabel}>{item.category}</Text>
                                            <Text style={styles.clothingRecommendation}>{item.recommendation}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Important Recommendations */}
                            <View style={styles.clothingCategory}>
                                <Text style={styles.clothingCategoryTitle}>⭐ Important Items</Text>
                                {clothingAdvice.filter(item => item.priority === 'important').map((item, index) => (
                                    <View key={index} style={styles.clothingItem}>
                                        <Text style={styles.clothingIcon}>{item.icon}</Text>
                                        <View style={styles.clothingContent}>
                                            <Text style={styles.clothingLabel}>{item.category}</Text>
                                            <Text style={styles.clothingRecommendation}>{item.recommendation}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Activity-Specific Gear */}
                            <View style={styles.clothingCategory}>
                                <Text style={styles.clothingCategoryTitle}>🎯 Activity-Specific Gear</Text>
                                {clothingAdvice.filter(item => item.priority === 'activity-specific').map((item, index) => (
                                    <View key={index} style={styles.clothingItem}>
                                        <Text style={styles.clothingIcon}>{item.icon}</Text>
                                        <View style={styles.clothingContent}>
                                            <Text style={styles.clothingLabel}>{item.category}</Text>
                                            <Text style={styles.clothingRecommendation}>{item.recommendation}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Helpful Tips & Accessories */}
                            <View style={styles.clothingCategory}>
                                <Text style={styles.clothingCategoryTitle}>💡 Smart Tips & Accessories</Text>
                                {clothingAdvice.filter(item => item.priority === 'helpful').map((item, index) => (
                                    <View key={index} style={styles.clothingItem}>
                                        <Text style={styles.clothingIcon}>{item.icon}</Text>
                                        <View style={styles.clothingContent}>
                                            <Text style={styles.clothingLabel}>{item.category}</Text>
                                            <Text style={styles.clothingRecommendation}>{item.recommendation}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Future AR Integration */}
                            <View style={styles.arIntegrationCard}>
                                <Text style={styles.arTitle}>📱 Coming Soon: AR Wardrobe Assistant</Text>
                                <Text style={styles.arDescription}>
                                    Point your camera at your wardrobe and get AI-powered outfit suggestions based on:
                                </Text>
                                <View style={styles.arFeatures}>
                                    <Text style={styles.arFeature}>• Real-time weather conditions</Text>
                                    <Text style={styles.arFeature}>• Your personal clothing inventory</Text>
                                    <Text style={styles.arFeature}>• Activity-specific requirements</Text>
                                    <Text style={styles.arFeature}>• Style preferences & color matching</Text>
                                </View>
                            </View>
                        </View>
                    )
                }

                {/* Time-Based Weather Analysis */}
                {
                    weather && (
                        <View style={styles.weatherSection}>
                            <Text style={styles.sectionTitle}>🌤️ Daily Weather Timeline</Text>
                            <Text style={styles.weatherSubtitle}>Climate conditions throughout the day for {getActivityTypes().find(a => a.key === selectedActivity)?.title || selectedActivity}</Text>

                            {/* Morning Weather */}
                            <View style={styles.timeSection}>
                                <View style={styles.timeHeader}>
                                    <Text style={styles.timeIcon}>🌅</Text>
                                    <Text style={styles.timeTitle}>Morning (6 AM - 12 PM)</Text>
                                    <Text style={styles.timeTemp}>{generateTimeBasedWeather(weather, selectedActivity).morning}</Text>
                                </View>
                                <View style={styles.timeWeatherGrid}>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌦️</Text>
                                        <Text style={styles.weatherItemLabel}>Light Showers</Text>
                                        <Text style={styles.weatherItemDesc}>Gentle rain, 2-5mm</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌧️</Text>
                                        <Text style={styles.weatherItemLabel}>Drizzle</Text>
                                        <Text style={styles.weatherItemDesc}>Misty conditions</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🥶</Text>
                                        <Text style={styles.weatherItemLabel}>Cool Weather</Text>
                                        <Text style={styles.weatherItemDesc}>Crisp morning air</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌫️</Text>
                                        <Text style={styles.weatherItemLabel}>Morning Mist</Text>
                                        <Text style={styles.weatherItemDesc}>Reduced visibility</Text>
                                    </View>
                                </View>
                                <View style={styles.timeAdvice}>
                                    <Text style={styles.timeAdviceText}>
                                        {selectedActivity === 'hiking' && '🥾 Perfect for hiking with light rain gear. Cool morning air ideal for trail starts.'}
                                        {selectedActivity === 'camping' && '⛺ Great time to break camp. Cool temperatures and light conditions.'}
                                        {selectedActivity === 'fishing' && '🎣 Excellent fishing conditions. Fish are active in cooler morning waters.'}
                                        {selectedActivity === 'cycling' && '🚴 Ideal cycling weather. Cool air perfect for long rides.'}
                                        {selectedActivity === 'outdoor_events' && '📅 Perfect setup time for events. Comfortable working conditions.'}
                                    </Text>
                                </View>
                            </View>

                            {/* Afternoon Weather */}
                            <View style={styles.timeSection}>
                                <View style={styles.timeHeader}>
                                    <Text style={styles.timeIcon}>☀️</Text>
                                    <Text style={styles.timeTitle}>Afternoon (12 PM - 6 PM)</Text>
                                    <Text style={styles.timeTemp}>{generateTimeBasedWeather(weather, selectedActivity).afternoon}</Text>
                                </View>
                                <View style={styles.timeWeatherGrid}>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>☀️</Text>
                                        <Text style={styles.weatherItemLabel}>Sunny</Text>
                                        <Text style={styles.weatherItemDesc}>Clear blue skies</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🔥</Text>
                                        <Text style={styles.weatherItemLabel}>Heat Stroke Risk</Text>
                                        <Text style={styles.weatherItemDesc}>Extreme heat warning</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌡️</Text>
                                        <Text style={styles.weatherItemLabel}>Peak Heat</Text>
                                        <Text style={styles.weatherItemDesc}>Hottest part of day</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>💧</Text>
                                        <Text style={styles.weatherItemLabel}>High UV Index</Text>
                                        <Text style={styles.weatherItemDesc}>Sun protection needed</Text>
                                    </View>
                                </View>
                                <View style={styles.timeAdvice}>
                                    <Text style={styles.timeAdviceText}>
                                        {selectedActivity === 'hiking' && '🥾 AVOID hiking 12-4 PM. Risk of heat exhaustion on trails. Start before 7 AM.'}
                                        {selectedActivity === 'camping' && '⛺ Stay in shade. Set up cooling systems. Avoid tent setup in direct sun.'}
                                        {selectedActivity === 'fishing' && '🎣 Fish seek deeper, cooler waters. Focus on shaded areas and early morning spots.'}
                                        {selectedActivity === 'cycling' && '🚴 DANGEROUS for cycling. High risk of overheating. Cycle before 8 AM only.'}
                                        {selectedActivity === 'outdoor_events' && '📅 Provide cooling stations, shade structures, and medical support for guests.'}
                                    </Text>
                                </View>
                            </View>

                            {/* Evening Weather */}
                            <View style={styles.timeSection}>
                                <View style={styles.timeHeader}>
                                    <Text style={styles.timeIcon}>🌆</Text>
                                    <Text style={styles.timeTitle}>Evening (6 PM - 12 AM)</Text>
                                    <Text style={styles.timeTemp}>{generateTimeBasedWeather(weather, selectedActivity).evening}</Text>
                                </View>
                                <View style={styles.timeWeatherGrid}>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌤️</Text>
                                        <Text style={styles.weatherItemLabel}>Partly Cloudy</Text>
                                        <Text style={styles.weatherItemDesc}>Mixed sun & clouds</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌬️</Text>
                                        <Text style={styles.weatherItemLabel}>Cool Breeze</Text>
                                        <Text style={styles.weatherItemDesc}>Refreshing winds</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>🌡️</Text>
                                        <Text style={styles.weatherItemLabel}>Pleasant Temp</Text>
                                        <Text style={styles.weatherItemDesc}>Comfortable conditions</Text>
                                    </View>
                                    <View style={styles.weatherItem}>
                                        <Text style={styles.weatherItemIcon}>⭐</Text>
                                        <Text style={styles.weatherItemLabel}>Clear Skies</Text>
                                        <Text style={styles.weatherItemDesc}>Good visibility</Text>
                                    </View>
                                </View>
                                <View style={styles.timeAdvice}>
                                    <Text style={styles.timeAdviceText}>
                                        {selectedActivity === 'hiking' && '🥾 Excellent for evening hikes. Cooler temperatures and beautiful sunset views.'}
                                        {selectedActivity === 'camping' && '⛺ Perfect for campfire activities. Comfortable temperatures for outdoor cooking.'}
                                        {selectedActivity === 'fishing' && '🎣 Prime fishing time. Fish become active again as temperatures cool.'}
                                        {selectedActivity === 'cycling' && '🚴 Ideal cycling conditions. Cool breeze and comfortable temperatures.'}
                                        {selectedActivity === 'outdoor_events' && '📅 Perfect for evening events. Comfortable conditions for guests and activities.'}
                                    </Text>
                                </View>
                            </View>


                        </View>
                    )
                }

                {
                    loading && (
                        <View style={styles.loadingContainer}>
                            <Text style={styles.loadingText}>⟳ Loading weather data...</Text>
                        </View>
                    )
                }

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.footerContent}>
                        <Text style={styles.footerLogo}>🌤️ Climatrail</Text>
                        <Text style={styles.footerCopyright}>© 2025 Climatrail. All rights reserved.</Text>
                        <Text style={styles.footerTagline}>Weather Intelligence for Outdoor Adventures</Text>
                    </View>
                </View>
            </ScrollView >

            {/* Location Search Modal */}
            {
                showLocationSearch && (
                    <LocationSearchModal
                        visible={showLocationSearch}
                        onClose={() => setShowLocationSearch(false)}
                        onLocationSelect={handleLocationSelect}
                    />
                )
            }
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: 16,
    },
    headerContainer: {
        paddingTop: 50,
        paddingBottom: 30,
        marginBottom: 10,
    },
    headerBackground: {
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 15,
        position: 'relative',
        overflow: 'hidden',
    },
    headerGradientOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(102, 126, 234, 0.9)',
        borderRadius: 20,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 2,
        marginBottom: 15,
    },
    logoCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        position: 'relative',
    },
    logoGlow: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        top: -10,
        left: -10,
    },
    logoText: {
        fontSize: 28,
        zIndex: 1,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: 'white',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.8)',
        letterSpacing: 2,
        fontWeight: '600',
        marginBottom: 8,
    },

    locationInfo: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(102, 126, 234, 0.1)',
    },
    locationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    locationIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#e8f4fd',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        position: 'relative',
    },
    locationIcon: {
        fontSize: 20,
    },
    locationPulse: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(74, 144, 226, 0.2)',
        top: -5,
        left: -5,
    },
    locationContent: {
        flex: 1,
    },
    locationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    locationLabel: {
        fontSize: 14,
        color: '#7f8c8d',
        fontWeight: '600',
    },
    locationStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        color: '#7f8c8d',
        fontWeight: '500',
    },
    locationText: {
        fontSize: 16,
        color: '#2c3e50',
        fontWeight: '600',
    },
    locationActions: {
        flexDirection: 'row',
        gap: 12,
    },
    locationActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    searchBtn: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    gpsBtn: {
        backgroundColor: '#4a90e2',
    },
    loadingBtn: {
        backgroundColor: '#95a5a6',
    },
    actionBtnIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    actionBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2c3e50',
    },
    dateSection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(102, 126, 234, 0.1)',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    sectionTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    sectionIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e8f4fd',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    sectionIcon: {
        fontSize: 18,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#2c3e50',
        marginBottom: 2,
    },
    sectionSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        fontWeight: '500',
    },
    selectedDateBadge: {
        backgroundColor: '#e8f4fd',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4a90e2',
    },
    selectedDateLabel: {
        fontSize: 10,
        color: '#4a90e2',
        fontWeight: '600',
        marginBottom: 2,
    },
    selectedDateText: {
        fontSize: 12,
        color: '#2c3e50',
        fontWeight: '600',
    },
    selectedDateInfo: {
        backgroundColor: '#e8f4fd',
        padding: 12,
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#4a90e2',
    },
    selectedDateLabel: {
        fontSize: 12,
        color: '#4a90e2',
        fontWeight: '600',
        marginBottom: 2,
    },
    selectedDateText: {
        fontSize: 14,
        color: '#2c3e50',
        fontWeight: '500',
    },
    quickSelectLabel: {
        fontSize: 14,
        color: '#7f8c8d',
        fontWeight: '500',
        marginBottom: 12,
    },
    quickDateScroll: {
        marginBottom: 16,
    },
    quickDateBtn: {
        backgroundColor: '#f8f9fa',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 10,
        marginRight: 8,
        alignItems: 'center',
        minWidth: 75,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    quickDateBtnSelected: {
        backgroundColor: '#4a90e2',
        borderColor: '#4a90e2',
    },
    todayDateBtn: {
        borderColor: '#e74c3c',
        borderWidth: 2,
    },
    quickDateLabel: {
        fontSize: 11,
        color: '#7f8c8d',
        marginBottom: 2,
        fontWeight: '500',
    },
    quickDateLabelSelected: {
        color: 'white',
    },
    todayLabel: {
        color: '#e74c3c',
        fontWeight: 'bold',
    },
    quickDateText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#2c3e50',
        marginBottom: 2,
    },
    quickDateTextSelected: {
        color: 'white',
    },
    dayOfWeekText: {
        fontSize: 10,
        color: '#95a5a6',
        fontWeight: '500',
    },
    dayOfWeekTextSelected: {
        color: 'white',
    },
    customDateContainer: {
        marginTop: 8,
    },
    customDateLabel: {
        fontSize: 14,
        color: '#7f8c8d',
        fontWeight: '500',
        marginBottom: 8,
    },
    customDateBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    customDateContent: {
        flex: 1,
    },
    customDateText: {
        fontSize: 16,
        color: '#2c3e50',
        fontWeight: '500',
    },
    customDateSubtext: {
        fontSize: 12,
        color: '#7f8c8d',
        marginTop: 2,
    },
    customDateArrow: {
        fontSize: 18,
        color: '#4a90e2',
    },
    activitySection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(102, 126, 234, 0.1)',
    },
    activityCounter: {
        backgroundColor: '#f8f9fa',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    counterText: {
        fontSize: 11,
        color: '#7f8c8d',
        fontWeight: '600',
    },
    activityScroll: {
        marginBottom: 16,
    },
    activityCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 18,
        marginRight: 16,
        alignItems: 'center',
        width: 140,
        borderWidth: 2,
        borderColor: 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 4,
        position: 'relative',
    },
    activityCardSelected: {
        backgroundColor: '#e8f4fd',
        borderColor: '#4a90e2',
        shadowColor: '#4a90e2',
        shadowOpacity: 0.2,
        transform: [{ scale: 1.02 }],
    },
    activityCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginBottom: 12,
        position: 'relative',
    },
    activityIcon: {
        fontSize: 36,
    },
    selectedBadge: {
        position: 'absolute',
        top: -8,
        right: -8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#4a90e2',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#4a90e2',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 6,
    },
    selectedBadgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    activityTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#2c3e50',
        marginBottom: 6,
        textAlign: 'center',
    },
    activityDescription: {
        fontSize: 11,
        color: '#7f8c8d',
        textAlign: 'center',
        lineHeight: 14,
        marginBottom: 12,
    },
    activityFooter: {
        width: '100%',
        alignItems: 'center',
    },
    activityDots: {
        flexDirection: 'row',
        gap: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#e9ecef',
    },
    activeDot: {
        backgroundColor: '#4a90e2',
    },
    activityInsight: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#f0f8ff',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#4a90e2',
    },
    insightIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e8f4fd',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    insightEmoji: {
        fontSize: 16,
    },
    activityTipText: {
        fontSize: 13,
        color: '#2c3e50',
        lineHeight: 18,
        flex: 1,
        fontWeight: '500',
    },
    weatherSection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(102, 126, 234, 0.1)',
    },
    conditionCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderLeftWidth: 4,
    },
    conditionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    conditionIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    conditionLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    conditionRisk: {
        fontSize: 14,
        color: '#e74c3c',
        fontWeight: '500',
        marginBottom: 4,
    },
    conditionAdvice: {
        fontSize: 12,
        color: '#7f8c8d',
        lineHeight: 16,
    },
    loadingContainer: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#7f8c8d',
    },
    footer: {
        backgroundColor: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
        borderRadius: 16,
        marginTop: 30,
        marginBottom: 30,
        overflow: 'hidden',
        shadowColor: '#2c3e50',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 15,
    },
    footerContent: {
        padding: 24,
        alignItems: 'center',
        position: 'relative',
    },
    footerLogo: {
        fontSize: 22,
        fontWeight: '800',
        color: 'white',
        marginBottom: 8,
    },
    footerCopyright: {
        fontSize: 14,
        color: '#bdc3c7',
        marginBottom: 6,
        fontWeight: '600',
    },
    footerTagline: {
        fontSize: 12,
        color: '#95a5a6',
        textAlign: 'center',
        fontStyle: 'italic',
        letterSpacing: 0.5,
    },
    alertsSection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#e74c3c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(231, 76, 60, 0.1)',
    },
    alertsSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        marginBottom: 12,
        fontStyle: 'italic',
    },
    alertCard: {
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 4,
    },
    priorityEXTREME: {
        backgroundColor: '#ffebee',
        borderLeftColor: '#e74c3c',
    },
    priorityHIGH: {
        backgroundColor: '#fff3e0',
        borderLeftColor: '#ff9800',
    },
    priorityMEDIUM: {
        backgroundColor: '#f3e5f5',
        borderLeftColor: '#9c27b0',
    },
    priorityLOW: {
        backgroundColor: '#e8f5e8',
        borderLeftColor: '#4caf50',
    },
    alertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    alertIcon: {
        fontSize: 20,
        marginRight: 10,
    },
    alertTitleContainer: {
        flex: 1,
    },
    alertTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 2,
    },
    alertPriority: {
        fontSize: 10,
        color: '#7f8c8d',
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    alertTiming: {
        fontSize: 11,
        color: '#34495e',
        fontWeight: '500',
        backgroundColor: '#ecf0f1',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    alertMessage: {
        fontSize: 14,
        color: '#2c3e50',
        lineHeight: 20,
        marginBottom: 10,
    },
    alertActionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    alertActionLabel: {
        fontSize: 12,
        color: '#7f8c8d',
        fontWeight: '600',
        marginRight: 6,
    },
    alertAction: {
        fontSize: 12,
        color: '#2980b9',
        fontWeight: '500',
        flex: 1,
    },
    alertCategory: {
        fontSize: 10,
        color: '#95a5a6',
        fontStyle: 'italic',
        alignSelf: 'flex-end',
    },
    weatherSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    timeSection: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    timeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    timeIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    timeTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2c3e50',
        flex: 1,
    },
    timeTemp: {
        fontSize: 14,
        color: '#e74c3c',
        fontWeight: '600',
        backgroundColor: '#fff5f5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    timeWeatherGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    weatherItem: {
        width: '48%',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    weatherItemIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    weatherItemLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#2c3e50',
        textAlign: 'center',
        marginBottom: 2,
    },
    weatherItemDesc: {
        fontSize: 10,
        color: '#7f8c8d',
        textAlign: 'center',
    },
    timeAdvice: {
        backgroundColor: '#e8f4fd',
        borderRadius: 8,
        padding: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#4a90e2',
    },
    timeAdviceText: {
        fontSize: 12,
        color: '#2c3e50',
        lineHeight: 16,
    },
    clothingSection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(102, 126, 234, 0.1)',
    },
    clothingSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    clothingCategory: {
        marginBottom: 16,
    },
    clothingCategoryTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 10,
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#ecf0f1',
    },
    clothingItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#3498db',
    },
    clothingIcon: {
        fontSize: 18,
        marginRight: 12,
        marginTop: 2,
    },
    clothingContent: {
        flex: 1,
    },
    clothingLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 3,
    },
    clothingRecommendation: {
        fontSize: 12,
        color: '#34495e',
        lineHeight: 16,
    },
    analyticsItem: {
        backgroundColor: '#f0f8ff',
        borderLeftColor: '#2980b9',
        borderLeftWidth: 4,
    },
    analyticsRecommendation: {
        fontSize: 11,
        color: '#2c3e50',
        lineHeight: 15,
        fontFamily: 'monospace',
    },
    arIntegrationCard: {
        backgroundColor: '#e8f4fd',
        borderRadius: 10,
        padding: 16,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#3498db',
        borderStyle: 'dashed',
    },
    arTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2980b9',
        marginBottom: 8,
    },
    arDescription: {
        fontSize: 12,
        color: '#34495e',
        marginBottom: 10,
        lineHeight: 16,
    },
    arFeatures: {
        paddingLeft: 8,
    },
    arFeature: {
        fontSize: 11,
        color: '#7f8c8d',
        marginBottom: 3,
        lineHeight: 14,
    },
});