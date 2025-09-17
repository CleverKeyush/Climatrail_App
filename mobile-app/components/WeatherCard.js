import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

export default function WeatherCard({ label, icon, risk, advice, color }) {
  const colorMap = {
    red: '#FF4B3E',
    blue: '#3E8EFF',
    gray: '#888',
    darkblue: '#223366',
    orange: '#FF9900',
    green: '#28a745',
  };
  
  const cardColor = colorMap[color] || '#007AFF';
  
  return (
    <Animated.View 
      entering={FadeInUp} 
      style={[styles.card, { borderLeftColor: cardColor }]}
      accessibilityLabel={`${risk || label} weather condition`}
    >
      <Text style={styles.icon}>{icon || '🌤️'}</Text>
      <View style={styles.content}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Text style={[styles.risk, { color: cardColor }]}>
          {risk || 'Weather Condition'}
        </Text>
        <Text style={styles.advice}>
          {advice || 'No additional information available.'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 8,
    padding: 16,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  icon: { 
    fontSize: 32, 
    marginRight: 16,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  risk: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 6,
  },
  advice: { 
    fontSize: 14, 
    color: '#555',
    lineHeight: 20,
  },
});