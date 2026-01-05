import toast from 'react-hot-toast';

export const p2pToast = {
  started: (name: string) =>
    toast.loading(`P2P transfer started: ${name}`, { id: name }),

  progress: (name: string, pct: number) =>
    toast.loading(`Receiving ${name} — ${pct}%`, { id: name }),

  delivered: (name: string) =>
    toast.success(`P2P transfer completed: ${name}`, { id: name }),

  failed: (name: string, reason?: string) =>
    toast.error(`P2P failed: ${name}${reason ? ` (${reason})` : ''}`),

  resumed: (name: string) =>
    toast.loading(`Resuming P2P transfer: ${name}`, { id: name }),

  rejected: (name: string) =>
    toast(`P2P rejected: ${name}`, { icon: '⛔' })
};
