self.addEventListener('message', async (e) => {
  if (e.data?.type === 'P2P_RESUME') {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'P2P_RESUME_REQUEST',
          messageId: e.data.messageId
        });
      });
    });
  }
});
