'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, ShieldAlert, CheckCircle, AlertTriangle, Lock, Unlock, RefreshCw, Plus, Users, Trash2, X, History, Search, Volume2 } from 'lucide-react';

export default function Home() {
  const [items, setItems] = useState([]);
  const [activeTimers, setActiveTimers] = useState([]);
  const [timerHistory, setTimerHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [now, setNow] = useState(new Date());

  const alarmIntervalRef = useRef(null);

  // New Food Item Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('protein');
  const [newItemShelfLife, setNewItemShelfLife] = useState(120);

  // New Profile Form State
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePin, setNewProfilePin] = useState('');
  const [newProfileRole, setNewProfileRole] = useState('STAFF');

  // 1-Second Interval Ticker for Live Countdown Display
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  // Continuous Annoying Siren Loop when any active timer is expired
  useEffect(() => {
    const hasExpiredTimers = activeTimers.some((timer) => {
      const remainingSeconds = Math.max(0, Math.floor((new Date(timer.expiration_time) - now) / 1000));
      return remainingSeconds === 0;
    });

    if (hasExpiredTimers) {
      if (!alarmIntervalRef.current) {
        playAnnoyingAlarm();
        alarmIntervalRef.current = setInterval(() => {
          playAnnoyingAlarm();
        }, 3000); // Repeats every 3 seconds until discarded
      }
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [activeTimers, now]);

  useEffect(() => {
    fetchInitialData();
    
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_timers' }, () => {
        fetchTimers();
        if (showHistoryPanel) fetchTimerHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showHistoryPanel]);

  // High-Pitch Piercing Kitchen Siren
  const playAnnoyingAlarm = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const pulse = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth'; // Aggressive harsh waveform
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
        
        gain.gain.setValueAtTime(0.4, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
      };

      // Piercing rapid alternation: 2000Hz and 2800Hz
      pulse(2400, 0.0, 0.1);
      pulse(3000, 0.12, 0.1);
      pulse(2400, 0.24, 0.1);
      pulse(3000, 0.36, 0.1);
      pulse(2400, 0.48, 0.1);
      pulse(3000, 0.60, 0.2);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    await Promise.all([fetchItems(), fetchTimers()]);
    setLoading(false);
  };

  const fetchItems = async () => {
    const { data, error } = await supabase.from('food_items').select('*');
    if (error) console.error("Error fetching food items:", error);
    if (!error && data) setItems(data);
  };

  const fetchTimers = async () => {
    const { data, error } = await supabase
      .from('active_timers')
      .select('*, food_items(*)')
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });
    if (error) console.error("Error fetching timers:", error);
    if (!error && data) setActiveTimers(data);
  };

  const fetchTimerHistory = async () => {
    const { data, error } = await supabase
      .from('active_timers')
      .select('*, food_items(*)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) console.error("Error fetching timer history:", error);
    if (!error && data) setTimerHistory(data);
  };

  const toggleHistoryPanel = () => {
    const nextState = !showHistoryPanel;
    setShowHistoryPanel(nextState);
    if (nextState) {
      fetchTimerHistory();
    }
  };

  const handleManagerLogin = async (e) => {
    e.preventDefault();
    if (!pin) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('pin_hash', pin)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      alert('Invalid PIN');
      setPin('');
    } else {
      setIsAuthenticated(true);
      setCurrentProfile(data);
      setPin('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentProfile(null);
    setShowAdminPanel(false);
    setShowHistoryPanel(false);
  };

  // REQUIRES LOGIN TO START TIMER
  const startTimer = async (foodItemId) => {
    if (!isAuthenticated || !currentProfile) {
      alert('Please enter your PIN in the top right header to log in before starting a timer.');
      return;
    }

    const selectedItem = items.find((i) => i.id === foodItemId);
    if (!selectedItem) {
      alert("Error: Selected food item ID not found.");
      return;
    }

    const startTime = new Date();
    const shelfLife = selectedItem.preset_minutes || selectedItem.shelf_life_minutes || 120;
    const expirationTime = new Date(startTime.getTime() + shelfLife * 60000);
    const itemName = selectedItem.title || selectedItem.name || 'Food Item';
    const userIdentifier = currentProfile.name || currentProfile.full_name || 'Staff User';

    const insertPayload = {
      food_item_id: foodItemId,
      food_title: itemName,
      start_time: startTime.toISOString(),
      expiration_time: expirationTime.toISOString(),
      status: 'ACTIVE',
      started_by_user: userIdentifier,
      started_by: currentProfile.id,
    };

    const { error } = await supabase.from('active_timers').insert([insertPayload]);

    if (error) {
      console.error("Supabase Timer Insert Error:", error);
      alert(`Error starting timer: ${error.message}`);
    } else {
      fetchTimers();
      if (showHistoryPanel) fetchTimerHistory();
    }
  };

  // REQUIRES LOGIN TO CLEAR TIMER & LOGS WHO CLEARED IT
  const clearTimer = async (timerId) => {
    if (!isAuthenticated || !currentProfile) {
      alert('Please enter your PIN in the top right header to log in before stopping or clearing a timer.');
      return;
    }

    const userIdentifier = currentProfile.name || currentProfile.full_name || 'Staff User';

    const { error } = await supabase
      .from('active_timers')
      .update({ 
        status: 'DISCARDED',
        cleared_by_user: userIdentifier,
        cleared_by: currentProfile.id
      })
      .eq('id', timerId);

    if (error) {
      const { error: fallbackError } = await supabase
        .from('active_timers')
        .update({ status: 'DISCARDED' })
        .eq('id', timerId);

      if (fallbackError) {
        alert(`Error clearing timer: ${fallbackError.message}`);
      } else {
        fetchTimers();
        if (showHistoryPanel) fetchTimerHistory();
      }
    } else {
      fetchTimers();
      if (showHistoryPanel) fetchTimerHistory();
    }
  };

  const handleAddFoodItem = async (e) => {
    e.preventDefault();
    if (!newItemName || !newItemShelfLife) return;

    const minutes = parseInt(newItemShelfLife, 10);

    const itemData = {
      title: newItemName,
      name: newItemName,
      category: newItemCategory,
      preset_minutes: minutes,
      shelf_life_minutes: minutes,
      warning_window_minutes: 15,
    };

    const { error } = await supabase.from('food_items').insert([itemData]);

    if (!error) {
      setNewItemName('');
      setNewItemShelfLife(120);
      fetchItems();
      alert('New food item added successfully!');
    } else {
      alert('Error adding food item: ' + error.message);
    }
  };

  const handleAddProfile = async (e) => {
    e.preventDefault();
    if (!newProfileName || !newProfilePin) return;

    const profileData = {
      name: newProfileName,
      full_name: newProfileName,
      pin_hash: newProfilePin,
      role: newProfileRole,
      is_active: true,
    };

    const { error } = await supabase.from('profiles').insert([profileData]);

    if (!error) {
      setNewProfileName('');
      setNewProfilePin('');
      alert('New profile created successfully!');
    } else {
      alert('Error creating profile: ' + error.message);
    }
  };

  const calculateTimeRemaining = (expirationTime) => {
    const totalSeconds = Math.max(0, Math.floor((new Date(expirationTime) - now) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return {
      formatted: `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`,
      totalSeconds,
    };
  };

  // Filter items dynamically based on search query
  const filteredItems = items.filter((item) => {
    const nameStr = (item.title || item.name || '').toLowerCase();
    const categoryStr = (item.category || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return nameStr.includes(q) || categoryStr.includes(q);
  });

  const roleUpper = currentProfile?.role?.toUpperCase();
  const isAdmin = roleUpper === 'ADMIN';
  const isManagerOrAdmin = roleUpper === 'ADMIN' || roleUpper === 'MANAGER';

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-700 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-8 h-8 text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-wide">Kitchen Freshness Tracker</h1>
        </div>
        
        {/* Controls / Login */}
        <div>
          {isAuthenticated ? (
            <div className="flex gap-2">
              {/* History Access for Manager & Admin */}
              {isManagerOrAdmin && (
                <button
                  onClick={toggleHistoryPanel}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg text-sm font-medium transition"
                >
                  <History className="w-4 h-4" />
                  {showHistoryPanel ? 'Hide Logs' : 'Shift Logs'}
                </button>
              )}

              {/* Controls strictly for Admin */}
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
                >
                  {showAdminPanel ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {showAdminPanel ? 'Close Controls' : 'Admin Controls'}
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-400/30 px-3 py-1.5 rounded-lg text-sm font-medium transition"
              >
                <Unlock className="w-4 h-4" /> {currentProfile?.name || currentProfile?.full_name || 'User'} ({currentProfile?.role})
              </button>
            </div>
          ) : (
            <form onSubmit={handleManagerLogin} className="flex gap-2">
              <input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded text-sm w-32 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 px-3 py-1.5 rounded text-sm font-medium transition"
              >
                <Lock className="w-3.5 h-3.5" /> Login
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Admin Panel (Strictly accessible by ADMIN role) */}
      {isAuthenticated && isAdmin && showAdminPanel && (
        <section className="bg-slate-800 border border-emerald-500/40 rounded-xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Food Item */}
          <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700">
            <h3 className="text-md font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add New Kitchen Item
            </h3>
            <form onSubmit={handleAddFoodItem} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Item Name</label>
                <input
                  type="text"
                  placeholder="e.g., Steak"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none"
                  >
                    <option value="protein">Protein</option>
                    <option value="side">Side</option>
                    <option value="dairy">Dairy / Cheese</option>
                    <option value="sauce">Sauce</option>
                    <option value="bakery">Bakery</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Hold Time (Minutes)</label>
                  <input
                    type="number"
                    value={newItemShelfLife}
                    onChange={(e) => setNewItemShelfLife(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-1.5 rounded text-sm transition mt-2"
              >
                Add Item
              </button>
            </form>
          </div>

          {/* Add Profile */}
          <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700">
            <h3 className="text-md font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Create Profile
            </h3>
            <form onSubmit={handleAddProfile} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g., Alex Smith"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">4-Digit PIN</label>
                  <input
                    type="password"
                    placeholder="1234"
                    maxLength={4}
                    value={newProfilePin}
                    onChange={(e) => setNewProfilePin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Role</label>
                  <select
                    value={newProfileRole}
                    onChange={(e) => setNewProfileRole(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-1.5 rounded text-sm transition mt-2"
              >
                Create Profile
              </button>
            </form>
          </div>
        </section>
      )}

      {/* History Logs Panel (Accessible by Manager & Admin) */}
      {isAuthenticated && isManagerOrAdmin && showHistoryPanel && (
        <section className="bg-slate-800 border border-sky-500/40 rounded-xl p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-sky-400 flex items-center gap-2">
              <History className="w-5 h-5" /> Shift Timer Activity Log
            </h3>
            <button
              onClick={fetchTimerHistory}
              className="text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded text-slate-300 transition"
            >
              Refresh Logs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Started By</th>
                  <th className="px-4 py-2.5">Cleared / Ended By</th>
                  <th className="px-4 py-2.5">Start Time</th>
                  <th className="px-4 py-2.5">Expiration Time</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {timerHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-slate-500">
                      No logs available yet.
                    </td>
                  </tr>
                ) : (
                  timerHistory.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-slate-100">
                        {log.food_title || log.food_items?.title || log.food_items?.name || 'Food Item'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 font-medium">
                        {log.started_by_user || 'Kitchen Staff'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {log.cleared_by_user ? (
                          <span className="text-amber-300 font-medium">{log.cleared_by_user}</span>
                        ) : log.status === 'ACTIVE' ? (
                          <span className="text-slate-500 italic">Running...</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {log.start_time ? new Date(log.start_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {log.expiration_time ? new Date(log.expiration_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            log.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : log.status === 'DISCARDED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Prep Buttons */}
        <div className="lg:col-span-1 bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3 text-emerald-400 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" /> Start New Timer
          </h2>

          {/* Search Bar Input */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm">Loading items...</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-slate-500 text-sm py-2">
              {searchQuery ? `No items matching "${searchQuery}"` : 'No food items found.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => startTimer(item.id)}
                  className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 p-3.5 rounded-lg transition flex justify-between items-center group"
                >
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition">
                      {item.title || item.name}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">{item.category || 'general'}</div>
                  </div>
                  <span className="text-xs font-mono bg-slate-900 border border-slate-700 text-slate-300 px-2.5 py-1 rounded">
                    {item.preset_minutes || item.shelf_life_minutes || 120}m
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Active Timers */}
        <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
              <Clock className="w-5 h-5" /> Active Kitchen Hold Timers
            </h2>
            <button
              onClick={playAnnoyingAlarm}
              className="flex items-center gap-1.5 text-xs bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 px-2.5 py-1 rounded transition"
              title="Test Kitchen Siren Sound"
            >
              <Volume2 className="w-3.5 h-3.5 text-rose-400" /> Test Siren
            </button>
          </div>

          {activeTimers.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-700 rounded-lg">
              <CheckCircle className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No active timers running.</p>
              <p className="text-slate-500 text-xs mt-1">Select an item from the left panel to begin tracking hold times.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeTimers.map((timer) => {
                const { formatted, totalSeconds } = calculateTimeRemaining(timer.expiration_time);
                const isExpired = totalSeconds === 0;
                const warningWindow = timer.food_items?.warning_window_minutes || 15;
                const isWarning = totalSeconds > 0 && totalSeconds <= warningWindow * 60;
                const displayName = timer.food_title || timer.food_items?.title || timer.food_items?.name || 'Food Item';

                return (
                  <div
                    key={timer.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                      isExpired
                        ? 'bg-rose-950/60 border-rose-600 text-rose-200 animate-pulse ring-2 ring-rose-500'
                        : isWarning
                        ? 'bg-amber-950/40 border-amber-600/60 text-amber-200'
                        : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{displayName}</h3>
                        <p className="text-xs opacity-75">
                          Expires: {new Date(timer.expiration_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {isExpired ? (
                        <ShieldAlert className="w-6 h-6 text-rose-500 animate-bounce" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-6 h-6 text-amber-400 animate-bounce" />
                      ) : (
                        <Clock className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider block opacity-75">
                          {isExpired ? 'DISCARD IMMEDIATELY' : isWarning ? 'USE SOON' : 'FRESH'}
                        </span>
                        <span className="text-2xl font-mono font-bold tracking-tight">
                          {isExpired ? '0:00' : formatted}
                        </span>
                      </div>
                      
                      {isAuthenticated && (
                        <button
                          onClick={() => clearTimer(timer.id)}
                          className="bg-rose-900/80 hover:bg-rose-800 border border-rose-600 text-white p-2 rounded-lg transition"
                          title="Discard/Clear Timer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}