// Simple SHA-256 hash utility for API keys
// Uses WebCrypto for secure hashing

const te = new TextEncoder();

export async function hashApiKeyAsync(apiKey: string): Promise<string> {
  const data = te.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Synchronous fallback using simple hash (for compatibility with existing sync code)
export function hashApiKey(apiKey: string): string {
  // Simple djb2 hash for synchronous contexts - not cryptographically secure
  // but sufficient for quick comparison/verification
  let hash = 5381;
  for (let i = 0; i < apiKey.length; i++) {
    hash = (hash * 33) ^ apiKey.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
