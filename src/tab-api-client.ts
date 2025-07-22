interface TabInfo {
  id: string;
  url: string;
  title: string;
  cdpTargetId: string;
  isActive: boolean;
  createdAt: string;
  lastAccessedAt?: string;
}

interface TabApiResponse {
  tabs?: TabInfo[];
  activeTabId?: string;
  success?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

class TabApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'TabApiError';
  }
}

export class TabApiClient {
  private baseUrl: string = 'http://localhost:9223/api';
  
  async listTabs(): Promise<TabInfo[]> {
    const response = await fetch(`${this.baseUrl}/tabs`);
    const data: TabApiResponse = await response.json();
    return data.tabs || [];
  }
  
  async createTab(url?: string, activate = true): Promise<TabInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, activate })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new TabApiError(
          data.error?.code || 'UNKNOWN_ERROR',
          data.error?.message || 'Failed to create tab',
          response.status
        );
      }
      
      return response.json();
    } catch (error) {
      if (error instanceof TabApiError) throw error;
      
      // Network or other errors
      throw new TabApiError(
        'API_UNAVAILABLE',
        'Tab API is not available',
        503
      );
    }
  }
  
  async switchTab(tabId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tabs/${tabId}/activate`, {
      method: 'PUT'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to switch tab');
    }
  }
  
  async closeTab(tabId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tabs/${tabId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to close tab');
    }
  }
  
  async getCdpTargets(): Promise<Record<string, { cdpTargetId: string; type: string; url: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/tabs/cdp-targets`);
      if (!response.ok) {
        console.error('[TabApiClient] Failed to get CDP targets:', response.status, response.statusText);
        return {};
      }
      const data = await response.json();
      return data.targets || {};
    } catch (error) {
      console.error('[TabApiClient] Error getting CDP targets:', error);
      return {};
    }
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/tabs`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(1000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}