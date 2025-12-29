import apiClient from './client';

export const exportAPI = {
  /**
   * Export messages with filters (paginated)
   */
  exportMessages: async (locationId, filters = {}) => {
    const params = {
      locationId,
      ...filters
    };
    const response = await apiClient.get('/export/messages', { params });
    return response;
  },

  /**
   * Export all messages (bulk)
   */
  exportAll: async (locationId, filters = {}) => {
    const params = {
      locationId,
      ...filters
    };
    const response = await apiClient.get('/export/messages/all', { params });
    return response;
  },

  /**
   * Download as CSV
   */
  downloadCSV: async (locationId, filters = {}) => {
    const params = new URLSearchParams({
      locationId,
      ...filters
    });
    
    // Get session token
    const token = localStorage.getItem('sessionToken');
    
    // Create download link
    const url = `/api/export/csv?${params}&token=${token}`;
    window.open(url, '_blank');
  }
};

