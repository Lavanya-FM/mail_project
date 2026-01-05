// Enhanced P2P Service with single-download tracking
// Tracks which files have been downloaded to enforce single-download policy

interface DownloadRecord {
  messageId: string;
  fileName: string;
  downloadedAt: number;
  userId: string;
}

class EnhancedP2PService {
  private downloadRecords: Map<string, DownloadRecord> = new Map();
  private readonly STORAGE_KEY = 'p2p-download-records';

  constructor() {
    this.loadDownloadRecords();
  }

  private loadDownloadRecords() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const records: DownloadRecord[] = JSON.parse(stored);
        records.forEach(record => {
          this.downloadRecords.set(record.messageId, record);
        });
      }
    } catch (error) {
      console.error('[EnhancedP2P] Failed to load download records:', error);
    }
  }

  private saveDownloadRecords() {
    try {
      const records = Array.from(this.downloadRecords.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.error('[EnhancedP2P] Failed to save download records:', error);
    }
  }

  /**
   * Check if a file has already been downloaded
   */
  hasBeenDownloaded(messageId: string): boolean {
    return this.downloadRecords.has(messageId);
  }

  /**
   * Record that a file has been downloaded
   */
  recordDownload(messageId: string, fileName: string, userId: string): void {
    const record: DownloadRecord = {
      messageId,
      fileName,
      downloadedAt: Date.now(),
      userId
    };
    
    this.downloadRecords.set(messageId, record);
    this.saveDownloadRecords();

    // Emit event for UI updates
    window.dispatchEvent(new CustomEvent('p2p-download-recorded', {
      detail: { messageId, fileName }
    }));
  }

  /**
   * Get download record for a file
   */
  getDownloadRecord(messageId: string): DownloadRecord | null {
    return this.downloadRecords.get(messageId) || null;
  }

  /**
   * Clear all download records (for testing/admin purposes)
   */
  clearAllRecords(): void {
    this.downloadRecords.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Get all download records
   */
  getAllRecords(): DownloadRecord[] {
    return Array.from(this.downloadRecords.values());
  }
}

export const enhancedP2PService = new EnhancedP2PService();
