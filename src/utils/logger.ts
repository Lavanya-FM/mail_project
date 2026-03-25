// src/utils/logger.ts
import { isSuperadminAuthenticated } from '../lib/superadminService';
import { authService } from '../lib/authService';

const isDev = process.env.NODE_ENV === 'development';
const API_URL = '/api/logs/error';

/**
 * A sophisticated logging utility for Jeemail
 * - Suppresses sensitive logs for regular users
 * - Reports errors to the backend for admin monitoring
 * - Implements Gmail-style developer warnings
 */
class Logger {
  private static instance: Logger;
  private warned = false;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Print a large "STOP!" warning in the console like Gmail
   */
  public init() {
    if (this.warned) return;
    this.warned = true;

    console.log(
      '%cStop!',
      'color: #d93025; font-family: system-ui, sans-serif; font-size: 50px; font-weight: bold; text-shadow: 1px 1px 0 #000;'
    );
    console.log(
      '%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to enable a "feature" or "hack" someone\'s account, it is a scam and will give them access to your Jeemail account.',
      'font-family: system-ui, sans-serif; font-size: 18px;'
    );
    console.log(
      '%cSee https://en.wikipedia.org/wiki/Self-XSS for more information.',
      'font-family: system-ui, sans-serif; font-size: 18px;'
    );
  }

  private shouldLog(): boolean {
    return isDev || isSuperadminAuthenticated();
  }

  public log(message: string, ...args: any[]) {
    if (this.shouldLog()) {
      console.log(`%c[Jeemail] ${message}`, 'color: #1a73e8; font-weight: bold;', ...args);
    }
  }

  public warn(message: string, ...args: any[]) {
    if (this.shouldLog()) {
      console.warn(`%c[Jeemail] ${message}`, 'color: #fbbc04; font-weight: bold;', ...args);
    }
  }

  public info(message: string, ...args: any[]) {
    if (this.shouldLog()) {
      console.info(`%c[Jeemail] ${message}`, 'color: #10b981; font-weight: bold;', ...args);
    }
  }

  public async error(message: string, error?: any, context: any = {}) {
    // 1. Always show error in console for developers/admins
    if (this.shouldLog()) {
      console.error(`%c[Jeemail ERROR] ${message}`, 'color: #d93025; font-weight: bold;', error, context);
    }

    // 2. Report to backend
    try {
      const user = authService.getCurrentUser();
      const payload = {
        user_id: user?.id || null,
        message,
        stack: error instanceof Error ? error.stack : (typeof error === 'string' ? error : JSON.stringify(error)),
        context: {
          ...context,
          url: window.location.href,
          timestamp: new Date().toISOString()
        },
        level: 'error'
      };

      await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(payload)
      });
    } catch (reportErr) {
      // Fail silently to avoid infinite error loops
    }
  }

  /**
   * P2P specific logs - these are often high-volume and sensitive
   */
  public p2p(message: string, ...args: any[]) {
    if (this.shouldLog()) {
      console.log(`%c[P2P] ${message}`, 'color: #8ab4f8;', ...args);
    }
  }
}

export const logger = Logger.getInstance();
