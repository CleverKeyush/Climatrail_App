import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Location from "expo-location";
import HomeScreen from "./screens/HomeScreen";
import WelcomeScreen from "./screens/WelcomeScreen";

export default function App() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    const getInitialLocation = async () => {
      try {
        console.log('🌍 [APP] Starting initial location setup...');
        
        // Check if location services are enabled first
        const isLocationEnabled = await Location.hasServicesEnabledAsync();
        console.log('🌍 [APP] Location services enabled:', isLocationEnabled);
        
        if (!isLocationEnabled) {
          console.log('🌍 [APP] Location services disabled, proceeding without GPS');
          setLocationError('Location services are disabled');
          setLocation(null);
          setLoading(false);
          return;
        }

        // Request permissions
        console.log('🌍 [APP] Requesting location permissions...');
        let { status } = await Location.requestForegroundPermissionsAsync();
        console.log('🌍 [APP] Permission status:', status);
        
        if (status !== "granted") {
          console.log('🌍 [APP] Location permission denied');
          setLocationError('Location permission denied');
          setLocation(null);
          setLoading(false);
          return;
        }

        // Get current position with multiple fallbacks
        console.log('🌍 [APP] Getting current position...');
        let loc;
        
        try {
          // Try high accuracy first
          loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeout: 15000,
            maximumAge: 60000, // Accept cached location up to 1 minute old
          });
          console.log('🌍 [APP] High accuracy location received:', loc.coords);
        } catch (highAccuracyError) {
          console.log('🌍 [APP] High accuracy failed, trying balanced accuracy...');
          try {
            loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              timeout: 10000,
              maximumAge: 120000, // Accept cached location up to 2 minutes old
            });
            console.log('🌍 [APP] Balanced accuracy location received:', loc.coords);
          } catch (balancedError) {
            console.log('🌍 [APP] Balanced accuracy failed, trying low accuracy...');
            loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
              timeout: 8000,
              maximumAge: 300000, // Accept cached location up to 5 minutes old
            });
            console.log('🌍 [APP] Low accuracy location received:', loc.coords);
          }
        }

        if (loc && loc.coords) {
          setLocation(loc.coords);
          setLocationError(null);
          console.log('🌍 [APP] ✅ Location successfully set:', {
            lat: loc.coords.latitude.toFixed(4),
            lng: loc.coords.longitude.toFixed(4),
            accuracy: loc.coords.accuracy
          });
        } else {
          throw new Error('No location data received');
        }

      } catch (error) {
        console.error('🌍 [APP] ❌ Location error:', error);
        setLocationError(error.message);
        setLocation(null);
        
        // Show user-friendly error message
        if (Platform.OS !== 'web') {
          setTimeout(() => {
            Alert.alert(
              'Location Notice',
              'Unable to get your current location. You can still use the app by manually selecting a location.',
              [{ text: 'OK' }]
            );
          }, 1000);
        }
      } finally {
        setLoading(false);
      }
    };

    // Add overall timeout to prevent infinite loading
    const overallTimeout = setTimeout(() => {
      console.log('🌍 [APP] ⏰ Overall timeout reached, proceeding without location');
      setLoading(false);
      setLocationError('Location request timed out');
    }, 8000);

    getInitialLocation().then(() => {
      clearTimeout(overallTimeout);
    });

    return () => {
      clearTimeout(overallTimeout);
    };
  }, []);

  if (loading) {
    return <WelcomeScreen />;
  }

  return <HomeScreen location={location} locationError={locationError} />;
}