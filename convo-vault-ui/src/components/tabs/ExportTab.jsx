import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { exportAPI } from '../../api/export';
import { DatePicker, Select, Input } from 'antd';
import dayjs from 'dayjs';

export default function ExportTab() {
  const { location } = useAuth();
  const [filters, setFilters] = useState({
    channel: '',
    startDate: '',
    endDate: '',
    contactId: ''
  });
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleExport = async (format) => {
    try {
      setExporting(true);
      setResult(null);

      if (format === 'csv') {
        exportAPI.downloadCSV(location.id, filters);
        setResult({
          success: true,
          message: 'CSV download started!'
        });
      } else {
        const data = await exportAPI.exportAll(location.id, filters);
        setResult({
          success: true,
          message: `Exported ${data.data?.messages?.length || 0} messages`,
          data: data.data
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error.message
      });
    } finally {
      setExporting(false);
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
          <h2 className="text-2xl font-bold text-gray-900">Export Messages</h2>
          <p className="text-sm text-gray-500">Download conversations in CSV or JSON format</p>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white border-1 border-solid border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Export Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            onChange={(date) => setFilters({ ...filters, startDate: date ? date.format('YYYY-MM-DD') : '' })}
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
            onChange={(date) => setFilters({ ...filters, endDate: date ? date.format('YYYY-MM-DD') : '' })}
            className="w-full"
            size="large"
            placeholder="Select end date"
            format="YYYY-MM-DD"
          />
        </div>
      </div>
      </div>

      {/* Export Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl px-8 py-4 hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        >
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="font-semibold text-lg">
              {exporting ? 'Exporting...' : 'Export as CSV'}
            </span>
          </div>
          <div className="text-xs mt-1 opacity-90">Excel compatible format</div>
        </button>
        
        <button
          onClick={() => handleExport('json')}
          disabled={exporting}
          className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl px-8 py-4 hover:from-indigo-700 hover:to-indigo-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        >
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="font-semibold text-lg">
              {exporting ? 'Exporting...' : 'Export as JSON'}
            </span>
          </div>
          <div className="text-xs mt-1 opacity-90">Developer friendly format</div>
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-6 shadow-md ${
          result.success 
            ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-1 border-solid border-green-300' 
            : 'bg-gradient-to-br from-red-50 to-red-100 border-1 border-solid border-red-300'
        }`}>
          <div className="font-medium mb-2">
            {result.success ? '✅ Success' : '❌ Error'}
          </div>
          <div>{result.message}</div>
          {result.data && (
            <div className="mt-4 text-sm">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `messages_${Date.now()}.json`;
                  a.click();
                }}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
              >
                💾 Download JSON
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-1 border-solid border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-lg mb-3">Export Features</h3>
            <ul className="space-y-2.5 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Export includes conversationId for each message</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Advanced filtering by channel, date range, and contact</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>CSV format compatible with Excel and Google Sheets</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>JSON format perfect for developers and automation</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

