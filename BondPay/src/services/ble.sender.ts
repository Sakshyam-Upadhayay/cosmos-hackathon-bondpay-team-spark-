import { BleManager, Device } from 'react-native-ble-plx';
import {
  BLE_SERVICE_UUID,
  BLE_CONTROL_CHAR_UUID,
  BLE_DATA_CHAR_UUID,
  BLE_MAX_MTU,
  BLE_TIMEOUT_MS,
} from '../constants';
import {
  chunkPayload,
  buildTransferMetadata,
  serializeMetadata,
  buildStagePayload,
  buildBLEPacket,
} from './ble.protocol';
import { PaymentPayload } from '../types';

type TransferCompleteCallback = () => void;
type TransferErrorCallback = (error: string) => void;

export class BLEPaymentSender {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private onTransferComplete: TransferCompleteCallback | null = null;
  private onTransferError: TransferErrorCallback | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  setCallbacks(
    onTransferComplete: TransferCompleteCallback,
    onTransferError: TransferErrorCallback
  ) {
    this.onTransferComplete = onTransferComplete;
    this.onTransferError = onTransferError;
  }

  async scanForReceiver(sessionId: string): Promise<Device | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(null);
      }, BLE_TIMEOUT_MS);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          resolve(null);
          return;
        }

        if (device?.serviceUUIDs?.includes(BLE_SERVICE_UUID)) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          resolve(device);
        }
      });
    });
  }

  async connectToDevice(device: Device): Promise<void> {
    this.connectedDevice = await device.connect({ requestMTU: BLE_MAX_MTU });
  }

  async sendPayment(payload: PaymentPayload, sessionId: string): Promise<boolean> {
    if (!this.connectedDevice) {
      this.onTransferError?.('Not connected to receiver');
      return false;
    }

    try {
      const payloadJson = JSON.stringify(payload);
      const payloadBytes = new TextEncoder().encode(payloadJson);

      const handshakePayload = buildStagePayload('HANDSHAKE', { sessionId });
      await this.writeToControlCharacteristic(handshakePayload);

      const ackReceived = await this.waitForACK('HANDSHAKE_ACK');
      if (!ackReceived) {
        this.onTransferError?.('Handshake ACK timeout');
        return false;
      }

      const metadata = buildTransferMetadata(payloadBytes, sessionId);
      const metadataPayload = buildStagePayload('METADATA', metadata);
      await this.writeToControlCharacteristic(metadataPayload);

      const metadataAck = await this.waitForACK('METADATA_ACK');
      if (!metadataAck) {
        this.onTransferError?.('Metadata ACK timeout');
        return false;
      }

      const chunks = chunkPayload(payloadBytes, BLE_MAX_MTU);
      for (let i = 0; i < chunks.length; i++) {
        const packet = buildBLEPacket(
          { sequenceNo: i, dataLength: chunks[i].length },
          chunks[i]
        );
        await this.writeToDataCharacteristic(packet);

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const completePayload = buildStagePayload('CHUNKS_COMPLETE');
      await this.writeToControlCharacteristic(completePayload);

      const txAck = await this.waitForACK('CHUNKS_COMPLETE_ACK');
      if (!txAck) {
        this.onTransferError?.('Transfer complete ACK timeout');
        return false;
      }

      const disconnectPayload = buildStagePayload('DISCONNECT');
      await this.writeToControlCharacteristic(disconnectPayload);

      this.onTransferComplete?.();
      return true;
    } catch (err) {
      this.onTransferError?.(`Transfer error: ${err}`);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      this.connectedDevice = null;
    }
  }

  private async writeToControlCharacteristic(data: Uint8Array): Promise<void> {
    if (!this.connectedDevice) return;

    const services = await this.connectedDevice.services();
    const controlService = services.find((s) => s.uuid === BLE_SERVICE_UUID);

    if (controlService) {
      const characteristics = await controlService.characteristics();
      const controlChar = characteristics.find((c) => c.uuid === BLE_CONTROL_CHAR_UUID);

      if (controlChar) {
        const base64Data = Buffer.from(data).toString('base64');
        await this.manager.writeCharacteristicWithResponseForDevice(
          this.connectedDevice.id,
          controlChar.serviceUUID,
          controlChar.uuid,
          base64Data
        );
      }
    }
  }

  private async writeToDataCharacteristic(data: Uint8Array): Promise<void> {
    if (!this.connectedDevice) return;

    const services = await this.connectedDevice.services();
    const controlService = services.find((s) => s.uuid === BLE_SERVICE_UUID);

    if (controlService) {
      const characteristics = await controlService.characteristics();
      const dataChar = characteristics.find((c) => c.uuid === BLE_DATA_CHAR_UUID);

      if (dataChar) {
        const base64Data = Buffer.from(data).toString('base64');
        await this.manager.writeCharacteristicWithoutResponseForDevice(
          this.connectedDevice.id,
          dataChar.serviceUUID,
          dataChar.uuid,
          base64Data
        );
      }
    }
  }

  private async waitForACK(expectedACK: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, BLE_TIMEOUT_MS);

      if (!this.connectedDevice) {
        clearTimeout(timeout);
        resolve(false);
        return;
      }

      this.manager.monitorCharacteristicForDevice(
        this.connectedDevice.id,
        BLE_SERVICE_UUID,
        BLE_CONTROL_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            clearTimeout(timeout);
            resolve(false);
            return;
          }

          if (characteristic?.value) {
            const data = Buffer.from(characteristic.value, 'base64');
            const message = JSON.parse(new TextDecoder().decode(data));

            if (message.stage === expectedACK) {
              clearTimeout(timeout);
              resolve(true);
            }
          }
        }
      );
    });
  }
}
