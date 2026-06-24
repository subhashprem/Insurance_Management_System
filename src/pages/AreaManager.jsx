import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmDialog } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../lib/api.js';
import {
  formatCNIC,
  validateCNIC,
  formatPhone,
  validatePhone,
  formatDateInput,
  toDbDate,
  toDisplayDate,
  validateDate,
  validateDOBAge,
  formatName,
  validateName,
  formatCode,
  validateCode,
  trimSpaces
} from '../lib/validation.js';


const EMPTY = { am_code: '', am_name: '', relation: '', address: '', cnic: '', contact_1: '', contact_2: '', registration_no: '', status: 'active', registration_date: '', dob: '' };

export default function AreaManager({ searchFilter, clearSearchFilter }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, mode: 'create', data: EMPTY });
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (searchFilter) {
      setSearch(searchFilter);
      clearSearchFilter?.();
    }
  }, [searchFilter, clearSearchFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try { 
      setRows(await api.listAM()); 
    } catch { 
      toast('Failed to load Area Managers', 'error'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter(r =>
    !search ||
    r.am_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.am_code?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleAddNew = (e) => {
      if (e.detail?.page === 'areamanager') {
        openCreate();
      }
    };
    window.addEventListener('trigger-add-new', handleAddNew);
    return () => window.removeEventListener('trigger-add-new', handleAddNew);
  }, []);

  const validate = (d) => {
    const e = {};
    const codeErr = validateCode(d.am_code); if (codeErr) e.am_code = codeErr;
    const nameErr = validateName(d.am_name); if (nameErr) e.am_name = nameErr;
    const cnicErr = validateCNIC(d.cnic); if (cnicErr) e.cnic = cnicErr;
    const phone1Err = validatePhone(d.contact_1); if (phone1Err) e.contact_1 = phone1Err;
    const phone2Err = validatePhone(d.contact_2); if (phone2Err) e.contact_2 = phone2Err;
    const regDateErr = validateDate(d.registration_date); if (regDateErr) e.registration_date = regDateErr;
    const dobErr = validateDOBAge(d.dob); if (dobErr) e.dob = dobErr;
    return e;
  };

  const openCreate = () => setModal({ open: true, mode: 'create', data: { ...EMPTY } });
  const openEdit = (row) => {
    const editData = { ...row };
    editData.registration_date = toDisplayDate(editData.registration_date);
    editData.dob = toDisplayDate(editData.dob);
    setModal({ open: true, mode: 'edit', data: editData });
  };

  const handleSave = async () => {
    const trimmedData = {
      ...modal.data,
      am_code: trimSpaces(modal.data.am_code).toUpperCase(),
      am_name: trimSpaces(modal.data.am_name),
      cnic: trimSpaces(modal.data.cnic),
      contact_1: trimSpaces(modal.data.contact_1),
      contact_2: trimSpaces(modal.data.contact_2),
      relation: trimSpaces(modal.data.relation),
      registration_no: trimSpaces(modal.data.registration_no).toUpperCase(),
      address: trimSpaces(modal.data.address)
    };
    const e = validate(trimmedData);
    if (Object.keys(e).length) {
      setErrors(e);
      setTimeout(() => {
        const errEl = document.querySelector('.border-error, [class*="border-error"]');
        if (errEl) errEl.focus();
      }, 50);
      toast('Please correct the validation errors before saving.', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      ...trimmedData,
      registration_date: toDbDate(trimmedData.registration_date),
      dob: toDbDate(trimmedData.dob)
    };
    try {
      const res = modal.mode === 'create'
        ? await api.createAM(payload)
        : await api.updateAM(payload);
      if (res.ok) { 
        toast(`Area Manager ${modal.mode === 'create' ? 'created' : 'updated'}`, 'success'); 
        setModal(m => ({ ...m, open: false })); 
        load(); 
      } else {
        toast(res.error || 'Save failed', 'error');
      }
    } finally { 
      setSaving(false); 
    }
  };

  const handleDelete = async () => {
    const res = await api.deleteAM(confirm.id);
    if (res.ok) { 
      toast('Area Manager deleted', 'success'); 
      load(); 
    } else {
      toast(res.error || 'Delete failed', 'error');
    }
    setConfirm({ open: false, id: null });
  };

  const set = (k, v) => { 
    setModal(m => ({ ...m, data: { ...m.data, [k]: v } })); 
    setErrors(e => ({ ...e, [k]: undefined })); 
  };

  const handleExportExcel = async () => {
    toast('Generating Excel export of AM records...', 'info');
    try {
      const latest = await api.listAM();
      const latestFiltered = latest.filter(r => {
        if (!search) return true;
        const s = search.toLowerCase();
        return r.am_name?.toLowerCase().includes(s) ||
               r.am_code?.toLowerCase().includes(s) ||
               r.cnic?.toLowerCase().includes(s) ||
               r.contact_1?.toLowerCase().includes(s);
      });
      const res = await api.exportAMExcel(latestFiltered);
      setRows(latest);
      if (res?.ok) {
        toast(`Excel saved to: ${res.path}`, 'success');
      } else if (res?.ok === false && res?.canceled) {
        toast('Export cancelled', 'info');
      } else {
        toast(res?.error || 'Excel export failed', 'error');
      }
    } catch {
      toast('Excel export failed', 'error');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const columns = [
    { key: 'id', label: 'Serial No', render: (v, row) => <span className="font-mono-data">{filtered.indexOf(row) + 1}</span> },
    { key: 'am_code', label: 'AM code', render: v => <span className="font-mono-data text-primary">{v}</span> },
    { key: 'am_name', label: 'Name' },
    { key: 'relation', label: 'Son/Daughter/Wife of' },
    { key: 'cnic', label: 'CNIC', render: v => <span className="font-mono-data">{v}</span> },
    { key: 'dob', label: 'Date of Birth', render: v => formatDate(v) },
    { key: 'contact_1', label: 'Contact 1', render: v => <span className="font-mono-data">{v || '—'}</span> },
    { key: 'contact_2', label: 'Contact 2', render: v => <span className="font-mono-data">{v || '—'}</span> },
    { key: 'address', label: 'Address' },
    { key: 'registration_no', label: 'Registration No' },
    { key: 'registration_date', label: 'Registration Date', render: v => formatDate(v) },
    { key: 'no_of_srs', label: "No of SR's", render: v => <span className="font-mono-data">{v}</span> },
    { key: 'no_of_sms', label: "No of SM's", render: v => <span className="font-mono-data">{v}</span> },
    { key: 'no_of_ssms', label: "No of SSM's", render: v => <span className="font-mono-data">{v}</span> },
    { key: 'total_business', label: 'Total Business', render: v => <span className="font-mono-data text-primary">{`Rs. ${Number(v || 0).toLocaleString()}`}</span> },
    { key: 'second_year_premium', label: '2nd year premium', render: v => <span className="font-mono-data text-primary">{`Rs. ${Number(v || 0).toLocaleString()}`}</span> },
    { 
      key: 'status', 
      label: 'Status', 
      render: v => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
          v === 'active' ? 'bg-success/15 text-success' : 'bg-outline-variant/20 text-outline'
        }`}>
          {v}
        </span>
      ) 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-actions toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
          <input
            id="am-search"
            className="w-full bg-surface-container border border-border-subtle rounded-lg pl-9 pr-4 py-1.5 text-body-md text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:outline-none"
            placeholder="Search Area Manager..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            id="btn-export-am-excel"
            className="flex items-center gap-1.5 bg-green-600 hover:brightness-110 active:scale-[0.98] text-white font-bold px-4 py-2 rounded shadow-md text-xs uppercase tracking-wider transition-all"
            onClick={handleExportExcel}
          >
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
            Export Excel
          </button>
          <button
            id="btn-create-am"
            className="flex items-center gap-1.5 bg-primary text-on-primary font-bold px-4 py-2 rounded hover:opacity-90 transition-opacity"
            onClick={openCreate}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add AM
          </button>
        </div>
      </div>

      <DataTable 
        columns={columns} 
        rows={filtered} 
        loading={loading}
        highlightId={new URLSearchParams(window.location.search).get('highlight')}
        actions={row => (
          <div className="flex items-center gap-2">
            <button
              className="hover:text-primary transition-colors p-1 hover:bg-surface-variant/40 rounded"
              onClick={() => openEdit(row)}
              title="Edit AM"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              className="hover:text-error transition-colors p-1 hover:bg-surface-variant/40 rounded"
              onClick={() => setConfirm({ open: true, id: row.id })}
              title="Delete AM"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        )}
      />

      {/* Form Modal */}
      <Modal 
        open={modal.open} 
        onClose={() => setModal(m => ({ ...m, open: false }))} 
        title={modal.mode === 'create' ? 'Add Area Manager' : 'Edit Area Manager'} 
        size="lg"
        footer={null}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label required">AM Code</label>
              <input 
                autoFocus
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${errors.am_code ? 'border-error focus:border-error' : ''}`}
                value={modal.data.am_code || ''} 
                onChange={e => set('am_code', e.target.value)} 
              />
              {errors.am_code && <span className="text-error text-xs mt-1">{errors.am_code}</span>}
            </div>

            <div className="form-group">
              <label className="form-label required">AM Name</label>
              <input 
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${errors.am_name ? 'border-error focus:border-error' : ''}`}
                value={modal.data.am_name || ''} 
                onChange={e => set('am_name', e.target.value)} 
              />
              {errors.am_name && <span className="text-error text-xs mt-1">{errors.am_name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Son/Daughter/Wife of</label>
              <input 
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm"
                value={modal.data.relation || ''} 
                onChange={e => set('relation', e.target.value)} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label required">CNIC</label>
              <input 
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${errors.cnic ? 'border-error focus:border-error' : ''}`}
                value={modal.data.cnic || ''} 
                placeholder="35201-XXXXXXX-X"
                onChange={e => set('cnic', e.target.value)} 
              />
              {errors.cnic && <span className="text-error text-xs mt-1">{errors.cnic}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Contact 1</label>
              <input 
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm"
                value={modal.data.contact_1 || ''} 
                onChange={e => set('contact_1', e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contact 2</label>
              <input 
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm"
                value={modal.data.contact_2 || ''} 
                onChange={e => set('contact_2', e.target.value)} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Registration No</label>
              <input 
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm"
                value={modal.data.registration_no || ''} 
                onChange={e => set('registration_no', e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select 
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none cursor-pointer transition-all font-body-md text-sm"
                value={modal.data.status} 
                onChange={e => set('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Registration Date</label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="DD/MM/YYYY"
                  className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 pr-10 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${errors.registration_date ? 'border-error focus:border-error' : ''}`}
                  value={modal.data.registration_date || ''} 
                  onChange={e => set('registration_date', formatDateInput(e.target.value))} 
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center w-6 h-6 z-10">
                  <span className="material-symbols-outlined text-outline text-[18px] pointer-events-none">calendar_month</span>
                  <input 
                    type="date"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={toDbDate(modal.data.registration_date) || ''}
                    onChange={e => {
                      if (e.target.value) {
                        set('registration_date', toDisplayDate(e.target.value));
                      }
                    }}
                  />
                </div>
              </div>
              {errors.registration_date && <span className="text-error text-xs mt-1">{errors.registration_date}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="DD/MM/YYYY"
                  className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 pr-10 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${errors.dob ? 'border-error focus:border-error' : ''}`}
                  value={modal.data.dob || ''} 
                  onChange={e => set('dob', formatDateInput(e.target.value))} 
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center w-6 h-6 z-10">
                  <span className="material-symbols-outlined text-outline text-[18px] pointer-events-none">calendar_month</span>
                  <input 
                    type="date"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={toDbDate(modal.data.dob) || ''}
                    onChange={e => {
                      if (e.target.value) {
                        set('dob', toDisplayDate(e.target.value));
                      }
                    }}
                  />
                </div>
              </div>
              {errors.dob && <span className="text-error text-xs mt-1">{errors.dob}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea 
              className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:outline-none transition-all placeholder:text-outline-variant font-body-md text-sm resize-none"
              value={modal.data.address || ''} 
              onChange={e => set('address', e.target.value)} 
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
            <button 
              className="flex items-center gap-1.5 bg-surface-variant hover:bg-surface-container-highest text-on-surface transition-colors px-4 py-2 rounded" 
              onClick={() => setModal(m => ({ ...m, open: false }))}
            >
              Cancel
            </button>
            <button 
              className="flex items-center gap-1.5 bg-primary text-on-primary font-bold px-5 py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? <span className="animate-spin h-4 w-4 border-2 border-on-primary border-t-transparent rounded-full" /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog 
        open={confirm.open} 
        onClose={() => setConfirm({ open: false, id: null })} 
        onConfirm={handleDelete}
        title="Delete Area Manager Record" 
        message="Are you sure you want to delete this Area Manager? This action cannot be undone." 
      />
    </div>
  );
}
