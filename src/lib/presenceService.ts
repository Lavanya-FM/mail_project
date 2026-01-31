// src/lib/presenceService.ts
// Thin wrapper around P2PService to satisfy existing imports.
import { p2pService } from './p2pService';

class PresenceService {
  connect(_email: string, _userId: string | number) {
    // P2P service is already initialized in MainApp
    // This method is kept for API compatibility but does nothing
    // to prevent duplicate connections
    console.log('[PresenceService] Skipping connect - P2P already initialized');
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
