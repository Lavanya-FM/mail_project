import { normalizeEmail } from '../utils/normalizeEmail';

let onlinePeers = new Set<string>();
const listeners = new Set<(online: Set<string>) => void>();

export function setOnlinePeers(list: string[]) {
    onlinePeers = new Set(list.map(normalizeEmail));
    notifyListeners();
}

export function updatePeerStatus(email: string, online: boolean) {
    const normalized = normalizeEmail(email);
    if (online) {
        onlinePeers.add(normalized);
    } else {
        onlinePeers.delete(normalized);
    }
    notifyListeners();
}

export function isPeerOnline(email: string) {
    return onlinePeers.has(normalizeEmail(email));
}

export function getOnlinePeersSnapshot() {
    return new Set(onlinePeers);
}

export function subscribePresence(cb: (online: Set<string>) => void) {
    listeners.add(cb);
    // Call immediately with current state
    cb(new Set(onlinePeers));
    return () => listeners.delete(cb);
}

function notifyListeners() {
    listeners.forEach(l => l(new Set(onlinePeers)));
}
