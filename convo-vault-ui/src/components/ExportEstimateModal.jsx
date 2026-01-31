import React, { useState } from 'react';
import { Modal, Button, Spin, Alert, Input, Collapse } from 'antd';

const { Panel } = Collapse;

export default function ExportEstimateModal({
  visible,
  onCancel,
  onConfirm,
  loading = false,
  estimating = false,
  estimate = null,
  error = null,
  exportType = 'messages'
}) {
  console.log("estimates: ", estimate);
  const [email, setEmail] = useState('');

  // Format currency (value is in dollars)
  const formatCurrency = (value) => {
    const num = Number(value) || 0;
    return `$${num.toFixed(2)}`;
  };

  // Format large numbers
  const formatNumber = (num) => {
    return (Number(num) || 0).toLocaleString();
  };

  // Format unit price for display (price is in dollars, e.g., 0.05 = $0.05)
  const formatUnitPrice = (price) => {
    const num = Number(price) || 0;
    return `$${num.toFixed(2)}`;
  };

  // Validate email format
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email.trim());
  };

  const handleConfirm = () => {
    if (!isValidEmail(email)) {
      return; // Button should be disabled anyway
    }
    onConfirm(email.trim());
  };

  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Export Estimate</h3>
            <p className="text-sm text-gray-500">Review your export cost</p>
          </div>
        </div>
      }
      footer={null}
      width={520}
      centered
    >
      {/* Loading State */}
      {estimating && (
        <div className="flex flex-col justify-center items-center py-12">
          <Spin size="large" />
          <span className="mt-4 text-gray-600">Calculating estimate...</span>
        </div>
      )}

      {/* Error State */}
      {error && !estimating && (
        <Alert
          type="error"
          message="Error"
          description={error}
          className="mb-4"
          showIcon
        />
      )}

      {/* No Data State */}
      {estimate && !estimating && (!estimate.itemCounts?.total || estimate.itemCounts?.total === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-700 mb-2">No Data Available to Export</h4>
          <p className="text-sm text-gray-500 max-w-xs">
            There are no {exportType} matching your current filters. Try adjusting your date range or filters.
          </p>
          <Button onClick={onCancel} className="mt-6">
            Close
          </Button>
        </div>
      )}

      {/* Estimate Content */}
      {estimate && !estimating && estimate.itemCounts?.total > 0 && (
        <div className="space-y-5 py-2">
          {/* Export Summary */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Summary
            </h4>
            <div className="space-y-2 text-sm">
              {/* Conversations */}
              {estimate.breakdown?.conversations?.count > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <span className="text-gray-700 font-medium">Conversations</span>
                    <div className="text-xs text-gray-500">{formatUnitPrice(estimate.breakdown.conversations.unitPrice)}/conversation</div>
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatNumber(estimate.breakdown.conversations.count)} × {formatUnitPrice(estimate.breakdown.conversations.unitPrice)} = {formatCurrency(estimate.breakdown.conversations.subtotal)}
                  </span>
                </div>
              )}

              {/* Text Messages (SMS, WhatsApp, etc.) */}
              {estimate.breakdown?.smsWhatsapp?.count > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <span className="text-gray-700 font-medium">Text Messages</span>
                    <div className="text-xs text-gray-500">{formatUnitPrice(estimate.breakdown.smsWhatsapp.unitPrice)}/message</div>
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatNumber(estimate.breakdown.smsWhatsapp.count)} × {formatUnitPrice(estimate.breakdown.smsWhatsapp.unitPrice)} = {formatCurrency(estimate.breakdown.smsWhatsapp.subtotal)}
                  </span>
                </div>
              )}

              {/* Email Messages */}
              {estimate.breakdown?.email?.count > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <span className="text-gray-700 font-medium">Email Messages</span>
                    <div className="text-xs text-gray-500">{formatUnitPrice(estimate.breakdown.email.unitPrice)}/email</div>
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatNumber(estimate.breakdown.email.count)} × {formatUnitPrice(estimate.breakdown.email.unitPrice)} = {formatCurrency(estimate.breakdown.email.subtotal)}
                  </span>
                </div>
              )}

              {/* Total Items */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-gray-700">
                <span className="font-medium">Total Items</span>
                <span className="font-semibold">{formatNumber(estimate.itemCounts?.total)}</span>
              </div>
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Subtotal</span>
                <span className="font-medium">{formatCurrency(estimate.baseAmount)}</span>
              </div>

              {estimate.discountPercent > 0 && (
                <div className="flex justify-between items-center text-green-600">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Volume Discount ({estimate.discountPercent}%)
                  </span>
                  <span className="font-medium">-{formatCurrency(estimate.discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-blue-200">
                <span className="text-lg font-bold text-gray-800">Total</span>
                <span className="text-xl font-bold text-green-600">{formatCurrency(estimate.finalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Savings Banner - Show prominently when discount applied */}
          {estimate.discountPercent > 0 && (
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium opacity-90">Volume Discount Applied!</div>
                    <div className="text-2xl font-bold">You're saving {formatCurrency(estimate.discountAmount)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{estimate.discountPercent}%</div>
                  <div className="text-xs opacity-80">OFF</div>
                </div>
              </div>
            </div>
          )}

          {/* Volume Discount Tiers - Show applied tier highlighted */}
          <Collapse ghost className="bg-gray-50 rounded-lg" defaultActiveKey={estimate.discountPercent > 0 ? [] : []}>
            <Panel
              header={
                <span className="text-xs text-gray-600 font-medium flex items-center gap-2">
                  {estimate.discountPercent > 0 ? (
                    <>
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Your Tier: <strong className="text-green-600">{estimate.discountPercent}% Discount</strong></span>
                    </>
                  ) : (
                    'View Volume Discount Tiers'
                  )}
                </span>
              }
              key="1"
            >
              <div className="text-xs space-y-1">
                {[
                  { range: '1 - 1,000 items', discount: 0 },
                  { range: '1,000 - 2,000 items', discount: 20 },
                  { range: '2,000 - 5,000 items', discount: 40 },
                  { range: '5,000 - 30,000 items', discount: 50 },
                  { range: '30,000+ items', discount: 60 }
                ].map((tier) => (
                  <div
                    key={tier.discount}
                    className={`flex justify-between p-1.5 rounded ${
                      estimate.discountPercent === tier.discount
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'text-gray-500'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {estimate.discountPercent === tier.discount && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {tier.range}
                    </span>
                    <span>{tier.discount}% discount</span>
                  </div>
                ))}
              </div>
            </Panel>
          </Collapse>

          {/* Email Notification - Required */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Address
              <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="large"
              className="rounded-lg"
              status={email && !isValidEmail(email) ? 'error' : ''}
              style={{
                backgroundColor: 'white',
                borderColor: email && !isValidEmail(email) ? '#ef4444' : '#d1d5db',
                fontSize: '14px'
              }}
            />
            {email && !isValidEmail(email) && (
              <p className="text-xs text-red-500 mt-1">
                Please enter a valid email address
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              We'll send you the download link when your export is ready. Download links expire after 1 week.
            </p>
          </div>

          {/* Payment Info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm text-yellow-800">
              Payment will be deducted from your <strong>wallet balance</strong>. No card required.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onCancel}
              className="flex-1 h-11"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleConfirm}
              loading={loading}
              disabled={!isValidEmail(email)}
              className="flex-1 h-11 bg-green-600 hover:bg-green-700 border-green-600 hover:border-green-700 disabled:bg-gray-400 disabled:border-gray-400"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              }
            >
              {loading ? 'Processing...' : `Export`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
