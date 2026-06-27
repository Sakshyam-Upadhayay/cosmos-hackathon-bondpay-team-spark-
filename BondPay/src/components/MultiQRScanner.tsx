import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { MultiQRService } from '../services/multiqr.service';
import { Ionicons } from '@expo/vector-icons';

interface MultiQRScannerProps {
  onComplete: (payload: string) => void;
  onCancel: () => void;
  isDark?: boolean;
}

export const MultiQRScanner: React.FC<MultiQRScannerProps> = ({ onComplete, onCancel, isDark = false }) => {
  const [scannedChunksCount, setScannedChunksCount] = useState(0);
  const [totalChunksCount, setTotalChunksCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scannedSetRef = useRef<Set<number>>(new Set());
  const currentSessionIdRef = useRef<string | null>(null);

  // Instantiate the accumulator
  const accumulatorRef = useRef(
    MultiQRService.createAccumulator((finalPayload) => {
      onComplete(finalPayload);
    })
  );

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    // Attempt parsing as a Multi-QR chunk
    try {
      const parsed = JSON.parse(data);
      
      // Check if it is indeed a Multi-QR envelope
      if (parsed.v === 1 && parsed.sid && parsed.i !== undefined && parsed.t) {
        const sid = parsed.sid;
        const index = parsed.i;

        // If we switch to a new session, reset state
        if (currentSessionIdRef.current !== sid) {
          currentSessionIdRef.current = sid;
          setCurrentSessionId(sid);
          scannedSetRef.current.clear();
        }

        // Avoid duplicate chunk processing
        if (scannedSetRef.current.has(index)) {
          return;
        }

        scannedSetRef.current.add(index);
        
        const result = accumulatorRef.current.addChunk(data);
        if (result.success) {
          setScannedChunksCount(result.scannedCount);
          setTotalChunksCount(result.totalCount);
          setProgress(result.progress);
          setErrorMessage(null);
        } else if (result.error) {
          setErrorMessage(result.error);
        }
        return;
      }
      
      // If it is valid JSON but NOT a Multi-QR envelope, it might be a single-frame payment/pickup payload
      if (parsed.txId || parsed.pickupId || parsed.id) {
        onComplete(data);
        return;
      }
    } catch (e) {
      // Scanned data is not JSON, check if it might be a raw string payment (not standard, but let's report error)
      setErrorMessage('Invalid QR code format scanned.');
    }
  };

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <Text style={styles.title}>Scan Payment QR Code</Text>
      
      <View style={styles.cameraWrapper}>
        <CameraView
          onBarcodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.reticleContainer}>
          <View style={styles.reticle} />
        </View>
      </View>

      {totalChunksCount > 1 && (
        <View style={styles.progressContainer}>
          <Text style={[styles.progressLabel, isDark && styles.darkText]}>
            Receiving Payment payload... ({scannedChunksCount} of {totalChunksCount} frames)
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.percentText}>{Math.round(progress * 100)}%</Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Ionicons name="close-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
        <Text style={styles.cancelButtonText}>Cancel Scan</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkContainer: {
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  darkText: {
    color: '#FFF',
  },
  cameraWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    marginBottom: 20,
  },
  reticleContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticle: {
    width: '65%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: '#2D46B9',
    backgroundColor: 'rgba(45,70,185,0.08)',
  },
  progressContainer: {
    width: '100%',
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  progressLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: '#EEE',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2ECC71',
  },
  percentText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2ECC71',
    marginTop: 5,
  },
  errorContainer: {
    backgroundColor: '#FDEDEC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FADBD8',
    marginBottom: 15,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 13,
    fontWeight: '500',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E74C3C',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
