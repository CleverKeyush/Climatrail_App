import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  withRepeat,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

export default function WelcomeScreen() {
  const opacity = useSharedValue(1);
  opacity.value = withRepeat(withTiming(0.3, { duration: 900 }), -1, true);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  
  return (
    <View style={styles.container}>
      <Animated.Text
        entering={FadeInUp}
        style={styles.emoji}
        accessibilityLabel="Weather app icon"
      >
        🌤️
      </Animated.Text>
      <Animated.Text entering={FadeIn} style={styles.title}>
        Climatrail
      </Animated.Text>
      <Animated.Text entering={FadeIn} style={styles.subtitle}>
        Weather Intelligence App
      </Animated.Text>
      <Animated.View style={pulseStyle}>
        <ActivityIndicator
          size="large"
          color="#007AFF"
          accessibilityLabel="Loading indicator"
        />
      </Animated.View>
      <Animated.Text entering={FadeIn} style={styles.loadingText}>
        Getting your location and weather data...
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 20,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#007AFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
    marginBottom: 40,
  },
  loadingText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginTop: 20,
  },
});