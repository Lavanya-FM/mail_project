import toast from 'react-hot-toast';

export const p2pToast = {
  started: (name: string) =>
    toast.success(`Sending: ${name}`, { 
      id: `p2p-started-${name}`,
      duration: 2000,
      icon: '📤'
    }),

  sending: (name: string, pct: number) =>
    toast.loading(`Sending ${name} — ${pct}%`, { id: `p2p-sending-${name}` }),

  sent: (name: string) =>
    toast.success(`✓ File sent: ${name}`, { 
      id: `p2p-sent-${name}`,
      duration: 4000,
      icon: '✅'
    }),

  receiving: (name: string) =>
    toast(`Receiving: ${name}`, { 
      id: `p2p-receiving-${name}`,
      duration: 3000,
      icon: '📥'
    }),

  progress: (name: string, pct: number) =>
    toast.loading(`Receiving ${name} — ${pct}%`, { id: `p2p-progress-${name}` }),

  delivered: (name: string) =>
    toast.success(`✓ Received: ${name}`, { 
      id: `p2p-delivered-${name}`,
      duration: 3000,
      icon: '✓'
    }),

  failed: (name: string, reason?: string) =>
    toast.error(`Failed: ${name}${reason ? ` (${reason})` : ''}`, {
      duration: 4000
    }),

  resumed: (name: string) =>
    toast(`Resuming: ${name}`, { 
      id: `p2p-resumed-${name}`,
      duration: 3000,
      icon: '▶️'
    }),

  rejected: (name: string) =>
    toast(`Rejected: ${name}`, { 
      icon: '⛔',
      duration: 3000
    }),

  paused: (name: string) =>
    toast(`Paused: ${name}`, {
      id: `p2p-paused-${name}`,
      duration: 3000,
      icon: '⏸️'
    }),

  cancelled: (name: string) =>
    toast(`Cancelled: ${name}`, {
      duration: 3000,
      icon: '❌'
    }),

  backgroundComplete: (name: string) =>
    toast.success(`✅ Background transfer complete: ${name}`, {
      id: `p2p-bg-complete-${name}`,
      duration: 5000,
      icon: '🎉'
    })
};
