import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/auth';

export default function Header() {
  const { location, ghlContext } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

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

          {/* Sub-Account Name */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-6 py-3 border-1 border-solid border-white/20 flex items-baseline gap-2">
            <div className="text-lg text-blue-100 font-medium mb-1">Sub Account -</div>
            <div className="text-white font-bold text-lg">
              {location?.name || 'Loading...'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

