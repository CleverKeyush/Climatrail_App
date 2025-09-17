import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TextInput, 
    TouchableOpacity, 
    ScrollView, 
    Alert,
    Platform,
    SafeAreaView 
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import axios from 'axios';

export default function LocationSearchScreen({ navigation, route }) {
    const { onLocationSelect } = route.params || {};
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [showMap, setShowMap] = useState(true);
    const [mapRegion, setMapRegion] = useState({
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    });
    const mapRef = useRef(null);

    // Search for locations using Nominatim (OpenStreetMap)
    const searchLocations = async (query) => {
        if (!query || query.length < 3) {
            setSearchResults([]);
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: query,
                    format: 'json',
                    limit: 10,
                    addressdetails: 1
                },
                headers: {
                    'User-Agent': 'WeatherApp-LocationSearch/1.0'
                },
                timeout: 10000
            });

            const results = response.data.map(item => ({
                id: item.place_id,
                name: item.display_name,
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
                type: item.type,
                importance: item.importance
            }));

            setSearchResults(results);
        } catch (error) {
            console.error('Location search error:', error);
            Alert.alert('Search Error', 'Could not search for locations. Please try again.');
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            searchLocations(searchQuery);
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleLocationSelect = (location) => {
        setSelectedLocation(location);
        setMapRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        });
    };

    const confirmLocationSelection = () => {
        if (selectedLocation) {
            navigation.navigate('Home', {
                selectedLocation: {
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                    name: selectedLocation.name
                }
            });
        }
    };

    const handleMapPress = (event) => {
        const { latitude, longitude } = event.nativeEvent.coordinate;
        reverseGeocode(latitude, longitude);
    };

    const reverseGeocode = async (latitude, longitude) => {
        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                    lat: latitude,
                    lon: longitude,
                    format: 'json',
                    addressdetails: 1
                },
                headers: {
                    'User-Agent': 'WeatherApp-LocationSearch/1.0'
                },
                timeout: 10000
            });

            if (response.data) {
                const location = {
                    id: response.data.place_id,
                    name: response.data.display_name,
                    latitude: latitude,
                    longitude: longitude,
                    type: response.data.type || 'location'
                };

                setSelectedLocation(location);
                setMapRegion({
                    latitude: latitude,
                    longitude: longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            const location = {
                id: Date.now(),
                name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                latitude: latitude,
                longitude: longitude,
                type: 'coordinates'
            };
            setSelectedLocation(location);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>🗺️ Find Location</Text>
                <TouchableOpacity 
                    style={styles.toggleButton} 
                    onPress={() => setShowMap(!showMap)}
                >
                    <Text style={styles.toggleButtonText}>
                        {showMap ? '📝' : '🗺️'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search for city, address, or landmark..."
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus={false}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity 
                            style={styles.clearButton}
                            onPress={() => setSearchQuery('')}
                        >
                            <Text style={styles.clearButtonText}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Map View */}
            {showMap && (
                <View style={styles.mapContainer}>
                    <MapView
                        ref={mapRef}
                        style={styles.map}
                        region={mapRegion}
                        onPress={handleMapPress}
                        showsUserLocation={true}
                        showsMyLocationButton={true}
                    >
                        {selectedLocation && (
                            <Marker
                                coordinate={{
                                    latitude: selectedLocation.latitude,
                                    longitude: selectedLocation.longitude,
                                }}
                                title={selectedLocation.name}
                                description={`${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)}`}
                            />
                        )}
                    </MapView>
                    
                    {selectedLocation && (
                        <View style={styles.mapOverlay}>
                            <TouchableOpacity 
                                style={styles.confirmButton}
                                onPress={confirmLocationSelection}
                            >
                                <Text style={styles.confirmButtonText}>✓ Select This Location</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* Loading */}
            {loading && (
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>🔄 Searching locations...</Text>
                </View>
            )}

            {/* Search Results */}
            {!showMap && (
                <ScrollView style={styles.resultsContainer} showsVerticalScrollIndicator={false}>
                    {searchResults.length > 0 && (
                        <Text style={styles.resultsHeader}>
                            📍 Found {searchResults.length} location{searchResults.length !== 1 ? 's' : ''}
                        </Text>
                    )}
                    
                    {searchResults.map((result) => (
                        <TouchableOpacity
                            key={result.id}
                            style={styles.resultItem}
                            onPress={() => handleLocationSelect(result)}
                        >
                            <View style={styles.resultContent}>
                                <Text style={styles.resultIcon}>📍</Text>
                                <View style={styles.resultTextContainer}>
                                    <Text style={styles.resultName} numberOfLines={2}>
                                        {result.name}
                                    </Text>
                                    <Text style={styles.resultCoords}>
                                        {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                                    </Text>
                                    {result.type && (
                                        <Text style={styles.resultType}>{result.type}</Text>
                                    )}
                                </View>
                                <Text style={styles.selectArrow}>›</Text>
                            </View>
                        </TouchableOpacity>
                    ))}

                    {searchQuery.length >= 3 && searchResults.length === 0 && !loading && (
                        <View style={styles.noResultsContainer}>
                            <Text style={styles.noResultsIcon}>🔍</Text>
                            <Text style={styles.noResultsText}>No locations found</Text>
                            <Text style={styles.noResultsSubtext}>
                                Try searching for a city name, address, or landmark
                            </Text>
                        </View>
                    )}

                    {searchQuery.length < 3 && searchQuery.length > 0 && (
                        <View style={styles.hintContainer}>
                            <Text style={styles.hintText}>
                                💡 Type at least 3 characters to search
                            </Text>
                        </View>
                    )}

                    {searchQuery.length === 0 && (
                        <View style={styles.instructionsContainer}>
                            <Text style={styles.instructionsTitle}>🗺️ Search for any location</Text>
                            <Text style={styles.instructionsText}>
                                • Search by city name (e.g., "New York", "London")
                            </Text>
                            <Text style={styles.instructionsText}>
                                • Search by address (e.g., "Times Square")
                            </Text>
                            <Text style={styles.instructionsText}>
                                • Search by landmark (e.g., "Eiffel Tower")
                            </Text>
                            <Text style={styles.instructionsText}>
                                • Tap anywhere on the map to select a location
                            </Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 10 : 30,
        paddingBottom: 20,
        paddingHorizontal: 20,
        backgroundColor: '#007AFF',
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    toggleButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    searchContainer: {
        padding: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchIcon: {
        fontSize: 18,
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
    clearButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#ccc',
        alignItems: 'center',
        justifyContent: 'center',
    },
    clearButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        color: '#666',
    },
    resultsContainer: {
        flex: 1,
    },
    resultsHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        padding: 20,
        paddingBottom: 10,
    },
    resultItem: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    resultContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    resultIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    resultTextContainer: {
        flex: 1,
    },
    resultName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    resultCoords: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    resultType: {
        fontSize: 12,
        color: '#999',
        textTransform: 'capitalize',
    },
    selectArrow: {
        fontSize: 20,
        color: '#007AFF',
        fontWeight: 'bold',
    },
    noResultsContainer: {
        alignItems: 'center',
        padding: 40,
    },
    noResultsIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    noResultsText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    noResultsSubtext: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    hintContainer: {
        alignItems: 'center',
        padding: 20,
    },
    hintText: {
        fontSize: 16,
        color: '#666',
    },
    instructionsContainer: {
        padding: 20,
    },
    instructionsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
        textAlign: 'center',
    },
    instructionsText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
        lineHeight: 20,
    },
    // Map Styles
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    map: {
        flex: 1,
        minHeight: 400,
    },
    mapOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 16,
        right: 16,
    },
    confirmButton: {
        backgroundColor: '#28a745',
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});