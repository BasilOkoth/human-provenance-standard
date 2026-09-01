"use client";

import nacl from "tweetnacl";
import * as util from "tweetnacl-util";

const KEY_STORAGE = "hps_creator_key_v1";

function bytesToBase64(bytes: Uint8Array) {
  return util.encodeBase64(bytes);
}

function base64ToBytes(value: string) {
  return util.decodeBase64(value);
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createEncryptedCreatorKey(passphrase: string) {
  const pair = nacl.sign.keyPair();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKey(passphrase, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    pair.secretKey
  );

  const vault = {
    version: 1,
    publicKey: bytesToBase64(pair.publicKey),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encryptedSecret: bytesToBase64(new Uint8Array(encrypted))
  };

  localStorage.setItem(KEY_STORAGE, JSON.stringify(vault));
  return vault.publicKey;
}

export function getStoredPublicKey(): string | null {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw).publicKey ?? null;
  } catch {
    return null;
  }
}

export async function signWithCreatorKey(message: string, passphrase: string) {
  const raw = localStorage.getItem(KEY_STORAGE);
  if (!raw) throw new Error("No creator signing key found on this device.");

  const vault = JSON.parse(raw);
  const aesKey = await deriveKey(passphrase, base64ToBytes(vault.salt));

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(vault.iv) },
      aesKey,
      base64ToBytes(vault.encryptedSecret)
    );
  } catch {
    throw new Error("Incorrect creator-key passphrase.");
  }

  const signature = nacl.sign.detached(
    util.decodeUTF8(message),
    new Uint8Array(decrypted)
  );

  return {
    publicKey: vault.publicKey as string,
    signature: util.encodeBase64(signature)
  };
}

export function exportEncryptedKeyFile() {
  const raw = localStorage.getItem(KEY_STORAGE);
  if (!raw) throw new Error("No creator key exists on this device.");
  return raw;
}

export function importEncryptedKeyFile(raw: string) {
  const parsed = JSON.parse(raw);
  if (!parsed.publicKey || !parsed.encryptedSecret) throw new Error("Invalid HPS key file.");
  localStorage.setItem(KEY_STORAGE, JSON.stringify(parsed));
  return parsed.publicKey as string;
}
