import { safeStorage } from 'electron';
import type { SecretCipher } from './connectionStore';

export class ElectronSecretCipher implements SecretCipher {
  async isAvailable() {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    if (!available) return false;
    return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
  }

  async encrypt(value: string) {
    return (await safeStorage.encryptStringAsync(value)).toString('base64');
  }

  async decrypt(value: string) {
    const result = await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'));
    return {
      value: result.result,
      shouldReEncrypt: result.shouldReEncrypt,
    };
  }
}
