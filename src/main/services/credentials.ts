import keytar from 'keytar';

import type { AuthMethod } from '../../shared/types';

const SERVICE_NAME = 'VikunjaSticky';
const ACCOUNT_NAME = 'primary';

interface StoredSecret {
  authMethod: AuthMethod;
  username: string;
  secret: string;
}

export async function loadStoredSecret() {
  const raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSecret;
  } catch {
    return null;
  }
}

export async function saveStoredSecret(secret: StoredSecret) {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(secret));
}

export async function clearStoredSecret() {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
}