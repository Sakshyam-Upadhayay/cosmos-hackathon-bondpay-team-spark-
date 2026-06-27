import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MultiQRService } from '../services/multiqr.service';

interface MultiQRDisplayProps {
  payload: string;
  delayMs?: number;
  size?: number;
}

export const MultiQRDisplay: React.FC<MultiQRDisplayProps> = ({ payload, delayMs = 333, size = 220 }) => {
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (payload) {
      // Split payload. Each chunk will fit in a small low-density QR code (~300 chars)
      const encodedChunks = MultiQRService.encode(payload, 300);
      setChunks(encodedChunks);
      setCurrentIndex(0);
    }
  }, [payload]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (chunks.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % chunks.length);
      }, delayMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [chunks, delayMs]);

  if (chunks.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.qrContainer}>
        <QRCode
          value={chunks[currentIndex]}
          size={size}
          color="#000000"
          backgroundColor="#FFFFFF"
          ecl="M"
        />
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {chunks.length > 1 ? `Syncing QR: ${currentIndex + 1} / ${chunks.length}` : 'Payment QR Code'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  qrContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  badge: {
    marginTop: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
