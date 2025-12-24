export type DeliveryMode = 'EMAIL' | 'P2P';

export type Recipient = { email: string };

export type P2PFileStatus = {
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'sending' | 'delivered' | 'failed';
};
