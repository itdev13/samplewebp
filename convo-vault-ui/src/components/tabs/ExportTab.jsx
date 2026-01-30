import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { billingAPI } from '../../api/billing';
import { DatePicker, Select, Input, Radio, Alert, Tabs, Empty } from 'antd';
import dayjs from 'dayjs';
import ExportEstimateModal from '../ExportEstimateModal';
import ExportProgress from '../ExportProgress';

export default function ExportTab() {
  const { location } = useAuth();

  // Export job state
  const [exportHistory, setExportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Check if download URL is expired (for display purposes)
  const isUrlExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Load export history
  const loadExportHistory = useCallback(async () => {
    if (!location?.id) return;

    try {
      setHistoryLoading(true);
      const response = await billingAPI.getExportHistory(location.id, 10);
      if (response.success) {
        setExportHistory(response.data.jobs || []);

        // Check for active jobs
        const active = response.data.jobs?.find(
          job => ['pending', 'processing'].includes(job.status)
        );
        if (active) {
          setActiveJob(active);
        }
      }
    } catch (err) {
      console.error('Failed to load export history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [location?.id]);

  // Load history on mount
  useEffect(() => {
    loadExportHistory();
  }, [loadExportHistory]);

  return (
    <div>
      {/* Export History */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Export History
          </h3>
          <button
            onClick={loadExportHistory}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {historyLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : exportHistory.length === 0 ? (
          <Empty description="No exports yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="space-y-3">
            {exportHistory.map((job) => {
              const urlExpired = job.status === 'completed' && isUrlExpired(job.downloadUrlExpiresAt);

              return (
                <div
                  key={job.jobId}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 capitalize">
                          {job.exportType} Export
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded uppercase">
                          {job.format || 'csv'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(job.createdAt).toLocaleDateString()} at {new Date(job.createdAt).toLocaleTimeString()} • {job.totalItems?.toLocaleString()} items
                      </div>

                      {/* Progress bar for processing jobs */}
                      {job.status === 'processing' && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-xs text-blue-600 mb-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                          </div>
                        </div>
                      )}

                      {/* Error message for failed jobs */}
                      {job.status === 'failed' && job.errorMessage && (
                        <div className="text-xs text-red-600 mt-1">
                          Error: {job.errorMessage}
                        </div>
                      )}

                      {/* Expiration warning */}
                      {job.status === 'completed' && urlExpired && (
                        <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Download link expired
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {job.billing && (
                        <span className="text-xs text-gray-500">${job.billing.amount}</span>
                      )}

                      {job.status === 'completed' ? (
                        urlExpired ? (
                          <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">
                            Expired
                          </span>
                        ) : job.downloadUrl ? (
                          <button
                            onClick={() => window.open(job.downloadUrl, '_blank')}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </button>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                            completed
                          </span>
                        )
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded ${
                          job.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          job.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          job.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {job.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
