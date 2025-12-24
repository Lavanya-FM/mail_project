type PresenceHandler = (online: string[]) => void;

class PresenceService {
  private ws: WebSocket | null = null;
  private online = new Set<string>();
  private listeners: ((online: Set<string>) => void)[] = [];

  connect(email: string, userId: string) {
    if (this.ws) return;

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${protocol}://${location.host}/api/p2p`);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({
        type: 'register',
        email,
        userId,
      }));
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'presence-update') {
        this.online = new Set(msg.online);
        this.listeners.forEach(fn => fn(this.online));
      }
    };
  }

  onUpdate(fn: (online: Set<string>) => void) {
    this.listeners.push(fn);
  }

  isOnline(email: string) {
    return this.online.has(email);
  }
}

export const presenceService = new PresenceService();
