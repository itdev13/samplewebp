import apiClient from './client';

export const importAPI = {
  /**
   * Upload CSV/Excel file
   */
  upload: async (file, locationId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', locationId);

    const response = await apiClient.post('/import/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 30000 // 30 second timeout for upload
    });
    return response;
  },

  /**
   * Get import job status
   */
  getStatus: async (jobId) => {
    const response = await apiClient.get(`/import/status/${jobId}`);
    return response;
  },

  /**
   * Get recent import jobs
   */
  getJobs: async (locationId) => {
    const response = await apiClient.get('/import/jobs', {
      params: { locationId }
    });
    return response;
  },

  /**
   * Download CSV template
   */
  downloadTemplate: () => {
    window.open('/api/import/template', '_blank');
  }
};

