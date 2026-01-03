import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { messagesAPI } from '../api/messages';
import { exportAPI } from '../api/export';
import { Button, Select } from 'antd';
import { useErrorModal } from './ErrorModal';

export default function ConversationMessages({ conversation, onBack }) {
  const { location } = useAuth();
  const [pageSize, setPageSize] = useState(20);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const { showError, ErrorModalComponent } = useErrorModal();

  const { data, isLoading, error } = useQuery({
    queryKey: ['conversation-messages', conversation?.id, location?.id, pageSize, lastMessageId],
    queryFn: async () => {
      const response = await messagesAPI.get(conversation.id, location.id, {
        limit: pageSize,
        lastMessageId: lastMessageId
      });
      return response;
    },
    enabled: !!conversation && !!location?.id,
    cacheTime: 0, // Don't cache - always fetch fresh
    staleTime: 0, // Data is immediately stale
    refetchOnMount: 'always' // Always refetch on mount
  });

  const messages = data?.data?.messages || [];
  const hasMore = data?.data?.pagination?.hasMore || false;
  const nextCursor = data?.data?.pagination?.nextCursor;

  // Download ALL messages for this conversation as CSV (fetch in batches, limit 500)
  const handleDownload = async () => {
    try {
      setDownloading(true);
      
      let allMessages = [];
      let cursor = null;
      let hasMore = true;
      const exportLimit = 500; // Use max limit for export
      let batchCount = 0;
      
      // Fetch all messages using export API with conversationId filter
      while (hasMore && batchCount < 20) { // Max 10,000 messages per conversation
        const response = await exportAPI.exportMessages(location.id, {
          conversationId: conversation.id, // Filter by this conversation
          limit: exportLimit,
          cursor: cursor || undefined
        });
        
        const batch = response.data.messages || [];
        allMessages = [...allMessages, ...batch];
        
        // Check for next cursor
        cursor = response.data.pagination?.nextCursor;
        hasMore = !!cursor && batch.length === exportLimit;
        batchCount++;
        
        // Small delay between requests
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Convert to CSV with formatted dates
      const csvHeaders = 'Message Date,Message ID,Conversation ID,Message Type,Direction,Status,Message Body,Contact ID\n';
      const csvRows = allMessages.map(msg => {
        const formattedDate = msg.dateAdded 
          ? new Date(msg.dateAdded).toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })
          : '';
        const message = (msg.body || '').replace(/"/g, '""').replace(/\n/g, ' ');
        return `"${formattedDate}","${msg.id}","${msg.conversationId || ''}","${msg.type || ''}","${msg.direction || ''}","${msg.status || ''}","${message}","${msg.contactId || ''}"`;
      }).join('\n');
      
      const csv = csvHeaders + csvRows;
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation_${conversation.contactName || 'messages'}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      showError('Export Failed', 'Failed to export messages from this conversation. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Conversation Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 shadow-lg text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl font-bold border-2 border-white/30">
              {(conversation.contactName || 'U')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {conversation.contactName || 'Unknown Contact'}
              </h2>
              <p className="text-blue-100 text-sm mt-1">
                Conversation ID: {conversation.id}
              </p>
            </div>
          </div>
          <Button
            onClick={handleDownload}
            loading={downloading}
            size="large"
            className="bg-white text-blue-600 hover:bg-blue-50"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            }
          >
            {downloading ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Export Progress */}
      {downloading && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            <span className="text-blue-700 font-medium">
              Fetching all messages from this conversation... This may take a moment.
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading messages...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-1 border-solid border-red-300 rounded-xl p-6">
          <p className="text-red-700">Error: {error.message}</p>
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !error && messages.length > 0 && (
        <div className="flex items-center justify-between bg-white border-1 border-solid border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Page Size:</span>
            <Select
              value={pageSize}
              onChange={(value) => {
                setPageSize(value);
                setLastMessageId(null);
              }}
              size="large"
              style={{ width: 100 }}
              options={[
                { value: 20, label: '20' },
                { value: 50, label: '50' },
                { value: 100, label: '100' }
              ]}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setLastMessageId(null)} disabled={!lastMessageId} size="large">
              Previous
            </Button>
            <Button onClick={() => setLastMessageId(nextCursor)} disabled={!hasMore} type="primary" size="large">
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      {!isLoading && !error && messages.length > 0 && (
        <div className="bg-white rounded-xl border-1 border-solid border-gray-200 p-6 min-h-[400px] space-y-4">
          {messages.map((message) => {
            const isOutbound = message.direction === 'outbound';
            return (
              <div key={message.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${
                    isOutbound
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className={`text-xs mb-1 ${isOutbound ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.type || 'SMS'} • {new Date(message.dateAdded).toLocaleString()}
                  </div>
                  <div className="text-sm">{message.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Messages State */}
      {!isLoading && !error && messages.length === 0 && (
        <div className="bg-white rounded-xl border-1 border-solid border-gray-200 p-12 min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Messages Found</h3>
            <p className="text-gray-500 mb-6">This conversation doesn't have any messages yet</p>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Conversations
            </button>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      {messages.length > 0 && (
        <div className="bg-gray-50 border-1 border-solid border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-600">
            💬 {messages.length} messages • {messages.filter(m => m.direction === 'inbound').length} received • {messages.filter(m => m.direction === 'outbound').length} sent
            {hasMore && <span className="ml-4 text-blue-600">• More available</span>}
          </div>
        </div>
      )}
    </div>
  );
}

