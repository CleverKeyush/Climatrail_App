import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function SummaryCard({ summary }) {
  return (
    <Animated.View entering={FadeIn} style={styles.card} accessibilityLabel="Weather summary">
      <Text style={styles.title}>📊 Weather Summary</Text>
      <Text style={styles.summary}>{summary || 'Loading weather summary...'}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#e8f4fd',
    borderRadius: 12,
    marginVertical: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#b3d9f7',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 8,
    textAlign: 'center',
  },
  summary: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    lineHeight: 22,
  },
});