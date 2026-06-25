import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';

export default function LicenseRenewalModal({ open, onClose, licenseInfo, onLicenseUpdated, user }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [validDetails, setValidDetails] = useState(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  const machineIdVal = licenseInfo?.machineId || 'FETCHING-MACHINE-ID...';

  // Live validate the key as the user types
  useEffect(() => {
    if (!key.trim()) {
      setValidDetails(null);
      setError('');
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setValidating(true);
      setError('');
      try {
        const res = await api.licenseValidateKey(key.trim());
        if (res.valid) {
          setValidDetails(res);
          setError('');
        } else {
          setValidDetails(null);
          setError(res.error || 'Invalid key.');
        }
      } catch (err) {
        setValidDetails(null);
        setError('Error validating key.');
      } finally {
        setValidating(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [key]);

  const handleCopy = () => {
    navigator.clipboard.writeText(machineIdVal);
    toast('Machine ID copied to clipboard!', 'success');
  };

  const handleSave = async () => {
    if (!key.trim() || error || !validDetails) return;
    setSaving(true);
    try {
      const ok = await api.licenseRenew(key.trim());
      if (ok) {
        toast('License updated successfully!', 'success');
        
        // Fetch updated license info to propagate state changes
        const info = await api.licenseCheck();
        onLicenseUpdated(info);
        
        setKey('');
        onClose();
      } else {
        setError('Activation failed. Key might have already been used.');
      }
    } catch (err) {
      setError('An error occurred during renewal.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Software License Renewal & Management" size="lg">
      <div className="space-y-6 select-none font-['Outfit']">
        
        {/* Machine details card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-deep/40 border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-2.5">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline">Active Machine Signature</span>
              <p className="text-body-sm font-mono text-primary font-bold tracking-widest break-all mt-1">{machineIdVal}</p>
            </div>
            <button 
              type="button"
              className="flex items-center gap-1.5 self-start text-xs font-bold text-electric-blue hover:opacity-85 transition-opacity"
              onClick={handleCopy}
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              <span>Copy Machine ID</span>
            </button>
          </div>

          <div className="bg-surface-deep/40 border border-border-subtle rounded-xl p-4 grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline-variant">Status</span>
              <p className="font-bold text-sm text-on-surface uppercase mt-0.5">
                {user?.role === 'developer' ? 'Valid' : (licenseInfo?.status || 'Unknown')}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline-variant">License Type</span>
              <p className="font-bold text-sm text-on-surface uppercase mt-0.5">
                {user?.role === 'developer' ? 'Full' : (licenseInfo?.licenseType || 'Unknown')}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline-variant">Remaining Days</span>
              <p className="font-bold text-sm text-on-surface mt-0.5">
                {user?.role === 'developer' ? 'Unlimited' : (licenseInfo?.daysLeft !== undefined ? `${licenseInfo.daysLeft} Days` : '—')}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline-variant">Expiry Date</span>
              <p className="font-bold text-sm text-on-surface mt-0.5">
                {user?.role === 'developer' ? 'Unlimited' : formatDate(licenseInfo?.expiryTs)}
              </p>
            </div>
          </div>
        </div>

        {/* Key Input */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-on-surface-variant" htmlFor="license-key-input">Enter Renewal Activation Key</label>
          <div className="relative">
            <input
              id="license-key-input"
              className={`w-full h-12 bg-surface-deep border rounded-lg px-4 pr-12 text-body-md text-on-surface focus:outline-none transition-all placeholder:text-outline-variant font-mono ${
                error ? 'border-error focus:border-error' : validDetails ? 'border-success focus:border-success' : 'border-border-subtle focus:border-primary'
              }`}
              placeholder="PASTE-YOUR-ACTIVATION-KEY-HERE..."
              type="text"
              value={key}
              onChange={e => setKey(e.target.value)}
              disabled={saving}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center text-outline pointer-events-none">
              {validating ? (
                <span className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              ) : validDetails ? (
                <span className="material-symbols-outlined text-success">check_circle</span>
              ) : error ? (
                <span className="material-symbols-outlined text-error">cancel</span>
              ) : (
                <span className="material-symbols-outlined">vpn_key</span>
              )}
            </div>
          </div>
        </div>

        {/* Live validation details */}
        {validDetails && (
          <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-2 animate-fadeIn">
            <h4 className="text-xs font-bold text-success flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Valid License Key Detected</span>
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
              <div>
                <span className="text-on-surface-variant opacity-70">Key License Type:</span>
                <span className="text-on-surface ml-1.5 uppercase">{validDetails.licenseType}</span>
              </div>
              <div>
                <span className="text-on-surface-variant opacity-70">Duration Added:</span>
                <span className="text-on-surface ml-1.5">{validDetails.durationDays} Days</span>
              </div>
              <div className="col-span-2 border-t border-success/10 pt-2 flex items-center justify-between">
                <span className="text-on-surface-variant opacity-70">New License Expiry Date (Carried Forward):</span>
                <span className="text-success font-bold text-sm font-mono">{formatDate(validDetails.newExpiryTs)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {error && (
          <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3 text-xs font-bold text-error animate-fadeIn">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* WhatsApp support card */}
        <div className="border-t border-border-subtle pt-4 flex flex-wrap gap-4 justify-between items-center">
          <button 
            type="button"
            className="text-xs font-bold text-on-surface-variant hover:text-electric-blue flex items-center gap-1.5 transition-colors"
            onClick={() => {
              const clientName = user?.name || 'Client';
              const msg = `Assalam o Alaikum Developer, I am ${clientName}. Please send the activation key for my system. My Machine ID is: ${machineIdVal}`;
              api.openWhatsAppAlert(msg);
            }}
          >
            <span className="material-symbols-outlined text-[18px]">support_agent</span>
            <span>Get Activation Key via WhatsApp</span>
          </button>
          
          <div className="flex gap-2">
            <button 
              className="px-4 py-2 border border-border-subtle hover:bg-surface-variant text-on-surface rounded font-bold text-xs uppercase transition-colors"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              className="px-6 py-2 bg-primary hover:brightness-110 disabled:opacity-50 text-on-primary font-bold rounded text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
              onClick={handleSave}
              disabled={saving || !validDetails || !!error}
            >
              {saving ? 'Activating...' : 'Activate License'}
              <span className="material-symbols-outlined text-sm font-bold">bolt</span>
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
}
