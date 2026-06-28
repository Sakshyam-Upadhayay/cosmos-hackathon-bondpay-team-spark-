import { syncTransactions } from '../src/controllers/transactions.controller';
import { CryptoService } from '../src/services/crypto.service';
import { config } from '../src/config';

// Mock request and response
const mockRequest = (body: any) => ({
  body,
  user: { userId: 'e6a88ab4-3d0a-4299-92c9-df7f6b653aef' } // Random UUID
} as any);

const mockResponse = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.jsonData = data;
    return res;
  };
  return res;
};

const runTest = async () => {
  try {
    await CryptoService.init();
    console.log('CryptoService initialized.');
    
    // We send a minimal sync request that contains incoming and outgoing lists
    const body = {
      batchId: 'test-batch-id-12345',
      incoming: [
        {
          transaction: {
            txId: 'TX-12345',
            senderId: 'e6a88ab4-3d0a-4299-92c9-df7f6b653aef',
            receiverId: 'e6a88ab4-3d0a-4299-92c9-df7f6b653aef',
            totalAmount: 100,
            timestamp: Math.floor(Date.now() / 1000),
            nonce: 'nonce123',
            senderPublicKey: 'pubkey',
            senderSignature: 'sig',
            message: 'hello'
          },
          bonds: [
            {
              bondId: 'BOND-123',
              value: 100,
              ownerId: 'e6a88ab4-3d0a-4299-92c9-df7f6b653aef',
              issuedAt: Math.floor(Date.now() / 1000),
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
              issuedByServer: 'v1.0',
              serverSignature: 'sig'
            }
          ]
        }
      ],
      outgoing: []
    };

    const req = mockRequest(body);
    const res = mockResponse();

    console.log('Calling syncTransactions...');
    await syncTransactions(req, res);
    console.log('Result status:', res.statusCode);
    console.log('Result data:', res.jsonData);

  } catch (error) {
    console.error('Test script crashed:', error);
  }
};

runTest();
