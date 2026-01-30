import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { billingAPI } from '../../api/billing';
import { DatePicker, Select, Input, Radio, Alert, Tabs, Empty } from 'antd';
import dayjs from 'dayjs';
import ExportEstimateModal from '../ExportEstimateModal';
import ExportProgress from '../ExportProgress';

export default function ExportTab() {
  const { location } = useAuth();

  // Export type and filters
  const [exportType, setExportType] = useState('messages'); // 'conversations' or 'messages'
  const [filters, setFilters] = useState({
    channel: '',
    startDate: '',
    endDate: '',
    contactId: ''
  });
  const [format, setFormat] = useState('csv');

  // Modal and estimate state
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [estimateError, setEstimateError] = useState(null);

  // Export job state
  const [processing, setProcessing] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [exportHistory, setExportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // Check if download URL is expired (for display purposes)
  const isUrlExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Date validation
  const validateDateRange = () => {
    if (filters.startDate && filters.endDate) {
      const start = dayjs(filters.startDate);
      const end = dayjs(filters.endDate);
      const diff = end.diff(start, 'day');

      if (diff > 31) {
        return 'Date range cannot exceed 1 month';
      }
      if (diff < 0) {
        return 'End date must be after start date';
      }
    }
    return null;
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

  // Poll active job status
  useEffect(() => {
    if (!activeJob || !['pending', 'processing'].includes(activeJob.status)) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await billingAPI.getExportStatus(activeJob.jobId, location?.id);
        if (response.success) {
          setActiveJob(response.data);

          // Stop polling if completed or failed
          if (['completed', 'failed'].includes(response.data.status)) {
            loadExportHistory();
          }
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [activeJob?.jobId, activeJob?.status, location?.id, loadExportHistory]);

  // Load history on mount
  useEffect(() => {
    loadExportHistory();
  }, [loadExportHistory]);

  // Handle get estimate
  const handleGetEstimate = async () => {
    const dateError = validateDateRange();
    if (dateError) {
      setError(dateError);
      return;
    }

    setError(null);
    setShowEstimateModal(true);
    setEstimating(true);
    setEstimate(null);
    setEstimateError(null);

    try {
      const response = await billingAPI.getEstimate(location.id, exportType, filters);
      if (response.success) {
        setEstimate(response.data.estimate);
      } else {
        setEstimateError(response.error || 'Failed to calculate estimate');
      }
    } catch (err) {
      setEstimateError(err.message || 'Failed to calculate estimate');
    } finally {
      setEstimating(false);
    }
  };

  // Handle pay and export
  const handlePayAndExport = async (notificationEmail) => {
    setProcessing(true);
    setError(null);

    try {
      const response = await billingAPI.chargeAndExport(
        location.id,
        exportType,
        format,
        filters,
        notificationEmail
      );

      if (response.success) {
        // Set active job for tracking
        setActiveJob({
          jobId: response.data.jobId,
          status: response.data.status,
          totalItems: response.data.totalItems,
          progress: { total: response.data.totalItems, processed: 0, percent: 0 }
        });

        setShowEstimateModal(false);
        setEstimate(null);

        // Reload history
        loadExportHistory();
      } else {
        setEstimateError(response.error || 'Export failed');
      }
    } catch (err) {
      setEstimateError(err.message || 'Export failed');
    } finally {
      setProcessing(false);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    if (!processing) {
      setShowEstimateModal(false);
      setEstimate(null);
      setEstimateError(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Export Data</h2>
          <p className="text-sm text-gray-500">Export conversations or messages with pay-per-use billing</p>
        </div>
      </div>

      {/* Active Job Progress */}
      {activeJob && ['pending', 'processing'].includes(activeJob.status) && (
        <ExportProgress
          job={activeJob}
          onRefresh={() => {
            billingAPI.getExportStatus(activeJob.jobId, location?.id)
              .then(res => res.success && setActiveJob(res.data))
              .catch(console.error);
          }}
        />
      )}

      {/* Completed Job Download */}
      {activeJob && activeJob.status === 'completed' && activeJob.downloadUrl && (
        <ExportProgress job={activeJob} />
      )}

      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Export Type Selection */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Export Type</h3>
        <Radio.Group
          value={exportType}
          onChange={(e) => setExportType(e.target.value)}
          className="w-full"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Radio.Button
              value="conversations"
              className="h-auto p-4 flex items-start text-left rounded-lg"
              style={{ height: 'auto' }}
            >
              <div>
                <div className="font-semibold text-gray-800">Conversations</div>
                <div className="text-xs text-gray-500 mt-1">Export conversation list with metadata</div>
                <div className="text-xs text-green-600 mt-1 font-medium">1¢ per conversation</div>
              </div>
            </Radio.Button>
            <Radio.Button
              value="messages"
              className="h-auto p-4 flex items-start text-left rounded-lg"
              style={{ height: 'auto' }}
            >
              <div>
                <div className="font-semibold text-gray-800">Messages</div>
                <div className="text-xs text-gray-500 mt-1">Export message content with full details</div>
                <div className="text-xs text-green-600 mt-1 font-medium">1¢ SMS/WhatsApp, 3¢ Email</div>
              </div>
            </Radio.Button>
          </div>
        </Radio.Group>
      </div>

      {/* Filters Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Export Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exportType === 'messages' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
              <Select
                value={filters.channel}
                onChange={(value) => setFilters({ ...filters, channel: value })}
                className="w-full"
                size="large"
                placeholder="All Channels"
                options={[
                  { value: '', label: 'All Channels' },
                  { value: 'SMS', label: 'SMS' },
                  { value: 'Email', label: 'Email' },
                  { value: 'WhatsApp', label: 'WhatsApp' },
                  { value: 'FB', label: 'Facebook' },
                  { value: 'GMB', label: 'Google My Business' }
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contact ID</label>
            <Input
              value={filters.contactId}
              onChange={(e) => setFilters({ ...filters, contactId: e.target.value })}
              placeholder="Optional - Filter by specific contact"
              size="large"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <DatePicker
              value={filters.startDate ? dayjs(filters.startDate) : null}
              onChange={(date) => setFilters({ ...filters, startDate: date ? date.valueOf() : '' })}
              className="w-full"
              size="large"
              placeholder="Select start date"
              format="YYYY-MM-DD"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <DatePicker
              value={filters.endDate ? dayjs(filters.endDate) : null}
              onChange={(date) => setFilters({ ...filters, endDate: date ? date.valueOf() : '' })}
              className="w-full"
              size="large"
              placeholder="Select end date"
              format="YYYY-MM-DD"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <Select
              value={format}
              onChange={(value) => setFormat(value)}
              className="w-full"
              size="large"
              options={[
                { value: 'csv', label: 'CSV (Excel compatible)' },
                { value: 'json', label: 'JSON (Developer friendly)' }
              ]}
            />
          </div>
        </div>

        {/* Date Range Warning */}
        <div className="mt-4 text-xs text-gray-500 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Maximum date range: 1 month
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={handleGetEstimate}
        disabled={activeJob && ['pending', 'processing'].includes(activeJob.status)}
        className="w-full group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl px-8 py-4 hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.01]"
      >
        <div className="flex items-center justify-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="font-semibold text-lg">Get Export Estimate</span>
        </div>
        <div className="text-xs mt-1 opacity-90">Calculate cost before exporting</div>
      </button>

      {/* Pricing Info */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-lg mb-3">Pay-Per-Use Pricing</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-gray-600 text-xs">Conversations</div>
                <div className="font-bold text-blue-800">1¢ each</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-gray-600 text-xs">SMS/WhatsApp</div>
                <div className="font-bold text-blue-800">1¢ each</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-gray-600 text-xs">Email</div>
                <div className="font-bold text-blue-800">3¢ each</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-gray-600 text-xs">Volume Discount</div>
                <div className="font-bold text-green-600">Up to 70%</div>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-3">
              Payment is deducted from your GHL wallet balance. No credit card required.
            </p>
          </div>
        </div>
      </div>

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
                            Processing... {job.processedItems?.toLocaleString() || 0} / {job.totalItems?.toLocaleString()}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${job.totalItems > 0 ? Math.round((job.processedItems / job.totalItems) * 100) : 0}%` }}
                            ></div>
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

      {/* Estimate Modal */}
      <ExportEstimateModal
        visible={showEstimateModal}
        onCancel={handleModalClose}
        onConfirm={handlePayAndExport}
        loading={processing}
        estimating={estimating}
        estimate={estimate}
        error={estimateError}
        exportType={exportType}
      />
    </div>
  );
}
