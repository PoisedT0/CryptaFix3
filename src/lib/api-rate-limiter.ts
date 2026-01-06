/**
 * Client-side API Rate Limiter with Queue System
 * - Throttle: max 4 requests/sec with 600ms delay
 * - Exponential backoff retry on 429 errors
 * - Request queue for sequential processing
 */

export type RateLimitConfig = {
  maxRequestsPerSecond: number;
  delayMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerSecond: 4,
  delayMs: 600,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
};

// Request queue
type QueuedRequest = {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
};

class ApiRateLimiter {
  private config: RateLimitConfig;
  private queue: QueuedRequest[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsInWindow: number[] = [];
  private listeners: Set<(status: RateLimiterStatus) => void> = new Set();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a request to the queue with rate limiting
   */
  async enqueue<T>(
    id: string,
    request: () => Promise<T>,
    options?: { skipQueue?: boolean }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id,
        execute: request,
        resolve,
        reject,
        retryCount: 0,
      };

      if (options?.skipQueue) {
        // Execute immediately with throttle only
        this.executeWithThrottle(queuedRequest);
      } else {
        this.queue.push(queuedRequest);
        this.notifyListeners();
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    this.notifyListeners();

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      await this.executeWithThrottle(request);
    }

    this.processing = false;
    this.notifyListeners();
  }

  /**
   * Execute a request with throttle and retry logic
   */
  private async executeWithThrottle(request: QueuedRequest): Promise<void> {
    // NOTE: throttling must always re-check time after any await.
    // We loop until we're allowed to send the request.
    // This avoids the classic bug where `now` is captured before an await.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();

      // Clean old requests from the 1s rolling window
      this.requestsInWindow = this.requestsInWindow.filter((time) => now - time < 1000);

      // Wait if we're at the rate limit (rolling window)
      if (this.requestsInWindow.length >= this.config.maxRequestsPerSecond) {
        const oldestRequest = Math.min(...this.requestsInWindow);
        const waitTime = Math.max(0, 1000 - (now - oldestRequest) + 50); // 50ms buffer
        await this.delay(waitTime);
        continue;
      }

      // Ensure minimum delay between requests
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.config.delayMs) {
        await this.delay(this.config.delayMs - timeSinceLastRequest);
        continue;
      }

      // Allowed to proceed
      break;
    }

    try {
      this.lastRequestTime = Date.now();
      this.requestsInWindow.push(Date.now());
      
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      const isRateLimitError = this.isRateLimitError(error);

      if (isRateLimitError && request.retryCount < this.config.maxRetries) {
        // Exponential backoff retry
        const retryDelayBase = this.config.baseRetryDelayMs * Math.pow(2, request.retryCount);
        // Add jitter to avoid synchronized retries
        const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8x .. 1.2x
        const retryDelay = Math.round(retryDelayBase * jitterFactor);
        console.log(
          `[RateLimiter] Rate limit hit, retrying in ${retryDelay}ms (attempt ${request.retryCount + 1}/${this.config.maxRetries})`
        );
        
        request.retryCount++;
        await this.delay(retryDelay);
        
        // Re-add to front of queue for retry
        this.queue.unshift(request);
        this.notifyListeners();
      } else {
        request.reject(error);
      }
    }
  }

  /**
   * Check if error is a rate limit error (429)
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;
    
    const errorStr = String(error?.message || error).toLowerCase();
    return (
      errorStr.includes('429') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('max calls per sec') ||
      errorStr.includes('too many requests')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue status
   */
  getStatus(): RateLimiterStatus {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentRequestId: this.queue[0]?.id || null,
    };
  }

  /**
   * Subscribe to status changes
   */
  subscribe(listener: (status: RateLimiterStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue.forEach((request) => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    this.notifyListeners();
  }
}

export type RateLimiterStatus = {
  queueLength: number;
  processing: boolean;
  currentRequestId: string | null;
};

// Singleton instances for different API types
export const etherscanLimiter = new ApiRateLimiter({
  maxRequestsPerSecond: 3,
  delayMs: 600,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
});

export const coingeckoLimiter = new ApiRateLimiter({
  maxRequestsPerSecond: 4,
  delayMs: 500,
  maxRetries: 3,
  baseRetryDelayMs: 2000,
});

export const infuraLimiter = new ApiRateLimiter({
  maxRequestsPerSecond: 10,
  delayMs: 200,
  maxRetries: 2,
  baseRetryDelayMs: 500,
});

// Generic limiter for other APIs
export const genericLimiter = new ApiRateLimiter();

/**
 * Rate-limited fetch wrapper with automatic retry
 */
export async function rateLimitedFetch<T>(
  url: string,
  options?: RequestInit,
  limiter: ApiRateLimiter = genericLimiter
): Promise<T> {
  return limiter.enqueue(url, async () => {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (429)');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  });
}

export { ApiRateLimiter };
export default etherscanLimiter;
