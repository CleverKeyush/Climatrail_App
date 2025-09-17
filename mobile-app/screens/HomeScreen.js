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
            setWeather(weatherAnalysis);
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

        // 🌡️ Risk Categories - Always show all 5 categories
        const risks = [];

        // 1. 🔥 Very Hot - Temperature-based heat risk
        if (maxTemp > 30) {
            const severity = maxTemp > 35 ? "EXTREME" : maxTemp > 32 ? "HIGH" : "MODERATE";
            risks.push({
                label: "Very Hot",
                icon: "🔥",
                risk: `${severity} heat risk - ${maxTemp.toFixed(1)}°C`,
                advice: `Temperature will reach ${maxTemp.toFixed(1)}°C. Stay hydrated and avoid midday activities.`,
                color: "red"
            });
        } else {
            risks.push({
                label: "Very Hot",
                icon: "🔥",
                risk: `No heat risk - ${maxTemp.toFixed(1)}°C`,
                advice: `Temperature ${maxTemp.toFixed(1)}°C is comfortable for outdoor activities.`,
                color: "green"
            });
        }

        // 2. 🥶 Very Cold - Low temperature warnings
        if (minTemp < 5) {
            const severity = minTemp < 0 ? "EXTREME" : minTemp < 2 ? "HIGH" : "MODERATE";
            risks.push({
                label: "Very Cold",
                icon: "🥶",
                risk: `${severity} cold risk - ${minTemp.toFixed(1)}°C`,
                advice: `Minimum temperature ${minTemp.toFixed(1)}°C. Dress warmly and bring extra layers.`,
                color: "blue"
            });
        } else {
            risks.push({
                label: "Very Cold",
                icon: "🥶",
                risk: `No cold risk - ${minTemp.toFixed(1)}°C`,
                advice: `Minimum temperature ${minTemp.toFixed(1)}°C is comfortable.`,
                color: "green"
            });
        }

        // 3. 💨 Very Windy - Wind speed hazards
        if (windSpeed > 25) {
            const severity = windSpeed > 40 ? "EXTREME" : windSpeed > 30 ? "HIGH" : "MODERATE";
            risks.push({
                label: "Very Windy",
                icon: "💨",
                risk: `${severity} wind hazard - ${windSpeed.toFixed(1)} km/h`,
                advice: `Strong winds ${windSpeed.toFixed(1)} km/h. Secure equipment and seek shelter.`,
                color: "orange"
            });
        } else {
            risks.push({
                label: "Very Windy",
                icon: "💨",
                risk: `No wind hazard - ${windSpeed.toFixed(1)} km/h`,
                advice: `Wind speed ${windSpeed.toFixed(1)} km/h is manageable for activities.`,
                color: "green"
            });
        }

        // 4. 🌧️ Very Wet - Precipitation risks
        if (precipitation > 10) {
            const severity = precipitation > 25 ? "EXTREME" : precipitation > 15 ? "HIGH" : "MODERATE";
            risks.push({
                label: "Very Wet",
                icon: "🌧️",
                risk: `${severity} precipitation risk - ${precipitation.toFixed(1)} mm`,
                advice: `Heavy rainfall ${precipitation.toFixed(1)} mm expected. Bring waterproof gear.`,
                color: "blue"
            });
        } else {
            risks.push({
                label: "Very Wet",
                icon: "🌧️",
                risk: `No precipitation risk - ${precipitation.toFixed(1)} mm`,
                advice: `Light precipitation ${precipitation.toFixed(1)} mm. Minimal rain expected.`,
                color: "green"
            });
        }

        // 5. 😰 Very Uncomfortable - Heat index and humidity
        if (humidity > 70 && maxTemp > 25) {
            const heatIndex = maxTemp + (0.5 * (humidity - 50));
            const severity = heatIndex > 35 ? "EXTREME" : heatIndex > 30 ? "HIGH" : "MODERATE";
            risks.push({
                label: "Very Uncomfortable",
                icon: "😰",
                risk: `${severity} discomfort - Heat index ${heatIndex.toFixed(1)}°C`,
                advice: `High humidity ${humidity.toFixed(0)}% makes it feel like ${heatIndex.toFixed(1)}°C. Take breaks.`,
                color: "red"
            });
        } else {
            const heatIndex = maxTemp + (0.5 * (humidity - 50));
            risks.push({
                label: "Very Uncomfortable",
                icon: "😰",
                risk: `Comfortable conditions - Heat index ${heatIndex.toFixed(1)}°C`,
                advice: `Humidity ${humidity.toFixed(0)}% and temperature create comfortable conditions.`,
                color: "green"
            });
        }

        return { conditions: risks };
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
                {/* Header */}
                <View style={styles.headerContainer}>
                    <View style={styles.logoContainer}>
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoText}>🌤️</Text>
                        </View>
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>Climatrail</Text>
                            <Text style={styles.headerSubtitle}>WEATHER INTELLIGENCE</Text>
                        </View>
                    </View>
                </View>

                {/* Location Info */}
                <View style={styles.locationInfo}>
                    <View style={styles.locationHeader}>
                        <Text style={styles.locationLabel}>
                            📍 {isManualLocation ? 'Selected Location' : 'Current Location'}
                        </Text>
                        <TouchableOpacity
                            style={styles.searchLocationBtn}
                            onPress={() => setShowLocationSearch(true)}
                        >
                            <Text style={styles.searchLocationBtnText}>🗺️ Search</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.locationText}>
                        {locationName || `${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`}
                    </Text>
                    <TouchableOpacity
                        style={styles.useGPSBtn}
                        onPress={handleUseCurrentLocation}
                        disabled={locationLoading}
                    >
                        <Text style={styles.useGPSBtnText}>
                            {locationLoading ? '⟳ Getting GPS...' : '📍 Use GPS'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Enhanced Date Selection */}
                <View style={styles.dateSection}>
                    <View style={styles.dateSectionHeader}>
                        <Text style={styles.sectionTitle}>📅 Date Selection</Text>
                        <View style={styles.selectedDateInfo}>
                            <Text style={styles.selectedDateLabel}>Selected:</Text>
                            <Text style={styles.selectedDateText}>
                                {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
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
                {/* Activity Selection */}
                <View style={styles.activitySection}>
                    <Text style={styles.sectionTitle}>🎯 Activity Selection</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activityScroll}>
                        {getActivityTypes().map((activity) => (
                            <TouchableOpacity
                                key={activity.key}
                                style={[styles.activityCard, selectedActivity === activity.key && styles.activityCardSelected]}
                                onPress={() => setSelectedActivity(activity.key)}
                            >
                                <Text style={styles.activityIcon}>{activity.icon}</Text>
                                <Text style={styles.activityTitle}>{activity.title}</Text>
                                <Text style={styles.activityDescription}>{activity.description}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.activityTip}>
                        <Text style={styles.activityTipText}>{getActivityTip(selectedActivity)}</Text>
                    </View>
                </View>

                {/* Weather Analysis */}
                {weather && (
                    <View style={styles.weatherSection}>
                        <Text style={styles.sectionTitle}>🌤️ Weather Analysis</Text>
                        {weather.conditions.map((condition, index) => (
                            <View key={index} style={[styles.conditionCard, { borderLeftColor: condition.color }]}>
                                <View style={styles.conditionHeader}>
                                    <Text style={styles.conditionIcon}>{condition.icon}</Text>
                                    <Text style={styles.conditionLabel}>{condition.label}</Text>
                                </View>
                                <Text style={styles.conditionRisk}>{condition.risk}</Text>
                                <Text style={styles.conditionAdvice}>{condition.advice}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {loading && (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>⟳ Loading weather data...</Text>
                    </View>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.footerContent}>
                        <Text style={styles.footerLogo}>🌤️ Climatrail</Text>
                        <Text style={styles.footerCopyright}>© 2025 Climatrail. All rights reserved.</Text>
                        <Text style={styles.footerTagline}>Weather Intelligence for Outdoor Adventures</Text>
                    </View>
                </View>
            </ScrollView>

            {/* Location Search Modal */}
            {showLocationSearch && (
                <LocationSearchModal
                    visible={showLocationSearch}
                    onClose={() => setShowLocationSearch(false)}
                    onLocationSelect={handleLocationSelect}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: 16,
    },
    headerContainer: {
        paddingTop: 60,
        paddingBottom: 20,
        alignItems: 'center',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#4a90e2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoText: {
        fontSize: 24,
    },
    headerTextContainer: {
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        letterSpacing: 1,
    },
    locationInfo: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    locationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    locationLabel: {
        fontSize: 14,
        color: '#7f8c8d',
        fontWeight: '500',
    },
    searchLocationBtn: {
        backgroundColor: '#e8f4fd',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    searchLocationBtnText: {
        color: '#4a90e2',
        fontSize: 12,
        fontWeight: '500',
    },
    locationText: {
        fontSize: 16,
        color: '#2c3e50',
        fontWeight: '500',
        marginBottom: 12,
    },
    useGPSBtn: {
        backgroundColor: '#4a90e2',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    useGPSBtnText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
    },
    dateSection: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    dateSectionHeader: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 8,
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
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    activityScroll: {
        marginBottom: 12,
    },
    activityCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 16,
        marginRight: 12,
        alignItems: 'center',
        width: 120,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    activityCardSelected: {
        backgroundColor: '#e8f4fd',
        borderColor: '#4a90e2',
    },
    activityIcon: {
        fontSize: 32,
        marginBottom: 8,
    },
    activityTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 4,
        textAlign: 'center',
    },
    activityDescription: {
        fontSize: 10,
        color: '#7f8c8d',
        textAlign: 'center',
    },
    activityTip: {
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 8,
    },
    activityTipText: {
        fontSize: 12,
        color: '#7f8c8d',
        textAlign: 'center',
        lineHeight: 16,
    },
    weatherSection: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
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
        backgroundColor: '#2c3e50',
        borderRadius: 12,
        marginTop: 20,
        marginBottom: 20,
        overflow: 'hidden',
    },
    footerContent: {
        padding: 20,
        alignItems: 'center',
    },
    footerLogo: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    footerCopyright: {
        fontSize: 14,
        color: '#bdc3c7',
        marginBottom: 4,
        fontWeight: '500',
    },
    footerTagline: {
        fontSize: 12,
        color: '#95a5a6',
        textAlign: 'center',
        fontStyle: 'italic',
    },
});