const ed = require('@noble/ed25519');
const config = require('../config/env');

let serverPrivateKeyBytes = null;
let serverPublicKeyBytes = null;

function getServerKeyPair() {
  if (serverPrivateKeyBytes) {
    return { privateKey: serverPrivateKeyBytes, publicKey: serverPublicKeyBytes };
  }

  if (!config.SERVER_PRIVATE_KEY || !config.SERVER_PUBLIC_KEY) {
    throw new Error('Server keys not configured in environment variables');
  }

  serverPrivateKeyBytes = Buffer.from(config.SERVER_PRIVATE_KEY, 'base64');
  serverPublicKeyBytes = Buffer.from(config.SERVER_PUBLIC_KEY, 'base64');

  return { privateKey: serverPrivateKeyBytes, publicKey: serverPublicKeyBytes };
}

function getServerPublicKeyHex() {
  const { publicKey } = getServerKeyPair();
  return Buffer.from(publicKey).toString('hex');
}

async function signBond(payload) {
  const { privateKey } = getServerKeyPair();
  const payloadBytes = new TextEncoder().encode(payload);
  const hash = await ed.esh256(payloadBytes);
  const signature = await ed.signAsync(hash, privateKey);
  return Buffer.from(signature).toString('base64');
}

async function verifyBondSignature(payload, signatureBase64) {
  const { publicKey } = getServerKeyPair();
  const payloadBytes = new TextEncoder().encode(payload);
  const hash = await ed.esh256(payloadBytes);
  const signature = Buffer.from(signatureBase64, 'base64');
  return ed.verifyAsync(signature, hash, publicKey);
}

module.exports = {
  getServerKeyPair,
  getServerPublicKeyHex,
  signBond,
  verifyBondSignature,
};
