import { DELIVERY_POLICY } from '../../config/deliveryPolicy';
import { DeliveryMode } from './types';

export function decideDeliveryMode(params: {
  totalBytes: number;
  fileCount: number;
  recipientOnline: boolean;
  p2pConnected: boolean;
}): DeliveryMode {
  const { totalBytes, fileCount, recipientOnline, p2pConnected } = params;

  if (fileCount === 0) return 'EMAIL';
  if (!recipientOnline || !p2pConnected) return 'EMAIL';

  if (totalBytes >= DELIVERY_POLICY.P2P_MIN_BYTES &&
      totalBytes > DELIVERY_POLICY.SMTP_SAFE_RAW_BYTES) {
    return 'P2P';
  }

  return 'EMAIL';
}
