// src/lib/presenceService.ts
// Thin wrapper around P2PService to satisfy existing imports.
import { p2pService } from './p2pService';

class PresenceService {
  connect(email: string, userId: string | number) {
    p2pService.connect(userId, email);
  }

  onUpdate(fn: (online: Set<string>) => void) {
    // Convert array to Set for compatibility
    p2pService.onPeersUpdate((peers) => {
      fn(new Set(peers));
    });
  }

  isOnline(email: string): boolean {
    return p2pService.isPeerOnline(email);
  }
}

export const presenceService = new PresenceService();
