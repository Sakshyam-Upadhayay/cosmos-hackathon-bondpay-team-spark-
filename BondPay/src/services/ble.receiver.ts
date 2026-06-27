import { BleManager, Device, Service, Characteristic } from 'react-native-ble-plx';
import {
  BLE_SERVICE_UUID,
  BLE_CONTROL_CHAR_UUID,
  BLE_DATA_CHAR_UUID,
  BLE_TIMEOUT_MS,
} from '../constants';
import {
  parseIncomingPacket,
  assembleChunks,
  parseStagePayload,
  buildStagePayload,
} from './ble.protocol';
import { PaymentPayload } from '../types';

type PaymentReceivedCallback = (payload: PaymentPayload) => void;
type ErrorCallback = (error: string) => void;

export class BLEPaymentReceiver {
  private manager: BleManager;
  private assembledChunks: Map<number, Uint8Array> = new Map();
  private expectedChunks = 0;
  private receivedCount = 0;
  private checksum = 0;
  private connectedDevice: Device | null = null;
  private onPaymentReceived: PaymentReceivedCallback | null = null;
  private onError: ErrorCallback | null = null;
  private paymentData: string = '';

  constructor() {
    this.manager = new BleManager();
  }

  setCallbacks(
    onPaymentReceived: PaymentReceivedCallback,
    onError: ErrorCallback
  ) {
    this.onPaymentReceived = onPaymentReceived;
    this.onError = onError;
  }

  async startPaymentSession(
    receiverId: string,
    amount: number,
    sessionId: string
  ): Promise<void> {
    this.assembledChunks.clear();
    this.receivedCount = 0;
    this.paymentData = '';

    await this.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        this.onError?.(`Scan error: ${error.message}`);
        return;
      }
    });
  }

  async stopSession(): Promise<void> {
    this.manager.stopDeviceScan();
    if (this.connectedDevice) {
      await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      this.connectedDevice = null;
    }
  }

  async connectToDevice(device: Device): Promise<void> {
    this.connectedDevice = device;
    const connectedDevice = await device.connect({ requestMTU: 512 });

    const services = await connectedDevice.services();
    const controlService = services.find((s) => s.uuid === BLE_SERVICE_UUID);

    if (!controlService) {
      throw new Error('BondPay service not found on device');
    }

    const characteristics = await controlService.characteristics();
    const controlChar = characteristics.find((c) => c.uuid === BLE_CONTROL_CHAR_UUID);
    const dataChar = characteristics.find((c) => c.uuid === BLE_DATA_CHAR_UUID);

    if (!controlChar || !dataChar) {
      throw new Error('Required characteristics not found');
    }

    await this.setupNotifications(controlChar, dataChar);
  }

  private async setupNotifications(
    controlChar: Characteristic,
    dataChar: Characteristic
  ): Promise<void> {
    await this.manager.monitorCharacteristicForDevice(
      this.connectedDevice!.id,
      controlChar.serviceUUID,
      controlChar.uuid,
      (error, characteristic) => {
        if (error) {
          this.onError?.(`Control notification error: ${error.message}`);
          return;
        }

        if (characteristic?.value) {
          this.handleControlMessage(characteristic.value);
        }
      }
    );

    await this.manager.monitorCharacteristicForDevice(
      this.connectedDevice!.id,
      dataChar.serviceUUID,
      dataChar.uuid,
      (error, characteristic) => {
        if (error) {
          this.onError?.(`Data notification error: ${error.message}`);
          return;
        }

        if (characteristic?.value) {
          this.handleDataPacket(characteristic.value);
        }
      }
    );
  }

  private handleControlMessage(base64Data: string): void {
    const data = Buffer.from(base64Data, 'base64');
    const message = parseStagePayload(data);

    switch (message.stage) {
      case 'HANDSHAKE':
        this.sendACK('HANDSHAKE');
        break;
      case 'METADATA':
        const metadata = message.data;
        this.expectedChunks = metadata.totalChunks;
        this.checksum = metadata.checksum;
        this.sendACK('METADATA');
        break;
      case 'CHUNKS_COMPLETE':
        this.processCompletePayload();
        break;
      case 'DISCONNECT':
        this.cleanup();
        break;
    }
  }

  private handleDataPacket(base64Data: string): void {
    const rawBytes = Buffer.from(base64Data, 'base64');
    const { header, payload } = parseIncomingPacket(new Uint8Array(rawBytes));

    this.assembledChunks.set(header.sequenceNo, payload);
    this.receivedCount++;

    if (this.receivedCount === this.expectedChunks) {
      this.sendACK('CHUNKS_COMPLETE');
    }
  }

  private async processCompletePayload(): Promise<void> {
    const assembled = assembleChunks(this.assembledChunks, this.expectedChunks);

    if (!assembled) {
      this.onError?.('Failed to assemble chunks');
      return;
    }

    this.paymentData = new TextDecoder().decode(assembled);

    try {
      const payload: PaymentPayload = JSON.parse(this.paymentData);
      this.onPaymentReceived?.(payload);
    } catch (err) {
      this.onError?.('Invalid payment payload format');
    }
  }

  private async sendACK(stage: string): Promise<void> {
    if (!this.connectedDevice) return;

    try {
      const ackData = buildStagePayload(`${stage}_ACK`);
      const base64Data = Buffer.from(ackData).toString('base64');

      const services = await this.connectedDevice.services();
      const controlService = services.find((s) => s.uuid === BLE_SERVICE_UUID);

      if (controlService) {
        const characteristics = await controlService.characteristics();
        const controlChar = characteristics.find((c) => c.uuid === BLE_CONTROL_CHAR_UUID);

        if (controlChar) {
          await this.manager.writeCharacteristicWithResponseForDevice(
            this.connectedDevice.id,
            controlChar.serviceUUID,
            controlChar.uuid,
            base64Data
          );
        }
      }
    } catch (err) {
      console.error('Failed to send ACK:', err);
    }
  }

  private cleanup(): void {
    this.assembledChunks.clear();
    this.receivedCount = 0;
    this.expectedChunks = 0;
    this.paymentData = '';
  }
}
