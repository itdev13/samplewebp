import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/auth';

export default function Header() {
  const { location, ghlContext } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showApiTooltip, setShowApiTooltip] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const response = await authAPI.getLocations();
      setLocations(response.locations || []);
    } catch (error) {
      console.error('Failed to load locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationChange = (e) => {
    const newLocationId = e.target.value;
    window.location.href = `${window.location.pathname}?location_id=${newLocationId}&company_id=${ghlContext.companyId}&user_id=${ghlContext.userId}`;
  };

  const openApiDocs = () => {
    const token = localStorage.getItem('sessionToken');
    window.open(`https://convoapi.vaultsuite.store/api/docs?token=${token}`, '_blank');
  };

  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
      <div className="max-w-full px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
              <img 
                src="/assets/app-icon-marketplace.svg" 
                alt="ConvoVault" 
                className="w-12 h-12 object-contain rounded-full"
              />
            <div>
              <h1 className="text-2xl font-bold text-white">ConvoVault</h1>
              <p className="text-sm text-blue-100">Conversation Management Dashboard</p>
            </div>
          </div>

          {/* API Docs & Sub-Account */}
          <div className="flex items-center gap-4">
            {/* API Docs Button with Tooltip */}
            <div className="relative">
              <button
                onClick={openApiDocs}
                onMouseEnter={() => setShowApiTooltip(true)}
                onMouseLeave={() => setShowApiTooltip(false)}
                className="group bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-lg px-4 py-2 border border-white/20 transition-all flex items-center gap-2"
              >
                <span className="text-lg">📚</span>
                <span className="text-white font-semibold text-sm hidden sm:inline">API Docs</span>
                <svg className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              {/* Tooltip */}
              {showApiTooltip && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50 animate-fade-in">
                  <div className="font-semibold mb-1">📖 API Documentation</div>
                  <div className="text-gray-300">
                    Access complete API reference with your personal token. Use these APIs to integrate ConvoVault with your website or other applications.
                  </div>
                  <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                </div>
              )}
            </div>

            {/* Sub-Account Name */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-6 py-3 border border-white/20 flex items-baseline gap-2">
              <div className="text-lg text-blue-100 font-medium mb-1">Sub Account -</div>
              <div className="text-white font-bold text-lg">
                {location?.name || 'Loading...'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

