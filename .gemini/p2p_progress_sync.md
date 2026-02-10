## Bidirectional P2P Progress Sync

USER requested both sender and receiver see synchronized transfer progress with more detail.

### Implementation:
1. **Receiver** sends actual `receivedChunks` count and progress % in `chunk-ack`
2. **Sender** displays receiver's actual progress (more accurate than ack count)
3. **Both sides** now show same numbers: chunks, bytes, %, speed, ETA

### Code changes:
- Modified `chunk-ack` payload to include `receiverStats: { progress, receivedChunks, speedBps, etaSeconds }`
- Updated sender's `chunk-ack` handler to use receiver's numbers for UI
- Both UIs now show identical progress

### Testing:
1. Start P2P transfer
2. Observer both sender & receiver progress displays
3. Verify numbers match perfectly
