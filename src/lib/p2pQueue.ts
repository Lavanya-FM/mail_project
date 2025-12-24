export function enqueueP2P(job: any) {
  const q = JSON.parse(localStorage.getItem('p2p-queue') || '[]');
  q.push(job);
  localStorage.setItem('p2p-queue', JSON.stringify(q));
}

export async function flushP2PQueue(p2pService: any) {
  const q = JSON.parse(localStorage.getItem('p2p-queue') || '[]');
  const remaining = [];

  for (const job of q) {
    try {
      await p2pService.sendStrictEmail(job.to, job.data);
    } catch {
      remaining.push(job);
    }
  }

  localStorage.setItem('p2p-queue', JSON.stringify(remaining));
}
