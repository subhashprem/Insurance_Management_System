import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmDialog } from '../components/Modal.jsx';
import SearchableDropdown from '../components/SearchableDropdown.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../lib/api.js';

const EMPTY = { proposal_no:'', holder_name:'', premium:'', pr_no:'', pr_date:'', amount_type:'cash', requirements:'', sr_id:null, sm_id:null, ssm_id:null, status:'not_ok', contact_1:'', contact_2:'' };
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
  formatAmount,
  validateAmount,
  trimSpaces
} from '../lib/validation.js';

export default function ProposerRegister({ onNavigate, searchFilter, clearSearchFilter }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [srs,  setSRs]  = useState([]);
  const [sms,  setSMs]  = useState([]);
  const [ssms, setSSMs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState({ open:false, mode:'create', data:EMPTY });
  const [confirm, setConfirm] = useState({ open:false, id:null, type:'delete' });
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});
  const [convertId, setConvertId] = useState(null);

  useEffect(() => {
    if (searchFilter) {
      setSearch(searchFilter);
      clearSearchFilter?.();
    }
  }, [searchFilter, clearSearchFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, sr, sm, ssm] = await Promise.all([api.listProposers(), api.listSR(), api.listSM(), api.listSSM()]);
      setRows(r); setSRs(sr); setSMs(sm); setSSMs(ssm);
    } catch { toast('Failed to load proposals','error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleAddNew = (e) => {
      if (e.detail?.page === 'proposer') {
        setModal({ open: true, mode: 'create', data: { ...EMPTY } });
      }
    };
    window.addEventListener('trigger-add-new', handleAddNew);
    return () => window.removeEventListener('trigger-add-new', handleAddNew);
  }, []);

  const srOpts  = srs.map(s  => ({ value:s.id, label:`${s.sr_code} — ${s.sr_name}`   }));
  const smOpts  = sms.map(s  => ({ value:s.id, label:`${s.sm_code} — ${s.sm_name}`   }));
  const ssmOpts = ssms.map(s => ({ value:s.id, label:`${s.ssm_code} — ${s.ssm_name}` }));

  const filtered = rows.filter(r =>
    !search ||
    r.holder_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.proposal_no?.toLowerCase().includes(search.toLowerCase()) ||
    r.sr_code?.toLowerCase().includes(search.toLowerCase()) ||
    r.sm_code?.toLowerCase().includes(search.toLowerCase()) ||
    r.ssm_code?.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_1?.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_2?.toLowerCase().includes(search.toLowerCase())
  );

  const validate = (d) => {
    const e = {};
    const proposalErr = validateCode(d.proposal_no); if (proposalErr) e.proposal_no = proposalErr;
    const nameErr = validateName(d.holder_name); if (nameErr) e.holder_name = nameErr;
    const premiumErr = validateAmount(d.premium); if (premiumErr) e.premium = premiumErr;
    if (d.pr_no) {
      const prNoErr = validateCode(d.pr_no); if (prNoErr) e.pr_no = prNoErr;
    }
    if (d.pr_date) {
      const dbDate = toDbDate(d.pr_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dbDate) || isNaN(Date.parse(dbDate))) {
        e.pr_date = 'Invalid date (use DD/MM/YYYY)';
      }
    }
    const phone1Err = validatePhone(d.contact_1); if (phone1Err) e.contact_1 = phone1Err;
    const phone2Err = validatePhone(d.contact_2); if (phone2Err) e.contact_2 = phone2Err;
    if (!d.sr_id)  e.sr_id  = 'Required';
    if (!d.sm_id)  e.sm_id  = 'Required';
    if (!d.ssm_id) e.ssm_id = 'Required';
    return e;
  };

  const set = (k, v) => { setModal(m=>({...m, data:{...m.data,[k]:v}})); setErrors(e=>({...e,[k]:undefined})); };

  const handleSRChange = (srId) => {
    setModal(m => {
      const updatedData = { ...m.data, sr_id: srId };
      if (srId) {
        const selectedSR = srs.find(s => s.id === srId);
        if (selectedSR) {
          updatedData.sm_id = selectedSR.sm_id || null;
          updatedData.ssm_id = selectedSR.ssm_id || null;
        }
      }
      return { ...m, data: updatedData };
    });
    setErrors(e => ({ ...e, sr_id: undefined, sm_id: undefined, ssm_id: undefined }));
  };

  const handleSMChange = (smId) => {
    if (modal.data.sr_id) {
      const selectedSR = srs.find(s => s.id === modal.data.sr_id);
      if (selectedSR && selectedSR.sm_id !== smId) {
        const ok = window.confirm("Are you sure you want to change the SM? This deviates from the selected SR's default hierarchy.");
        if (!ok) return;
      }
    }
    set('sm_id', smId);
  };

  const handleSSMChange = (ssmId) => {
    if (modal.data.sr_id) {
      const selectedSR = srs.find(s => s.id === modal.data.sr_id);
      if (selectedSR && selectedSR.ssm_id !== ssmId) {
        const ok = window.confirm("Are you sure you want to change the SSM? This deviates from the selected SR's default hierarchy.");
        if (!ok) return;
      }
    }
    set('ssm_id', ssmId);
  };

  const handleSave = async () => {
    const trimmedData = {
      ...modal.data,
      proposal_no: trimSpaces(modal.data.proposal_no).toUpperCase(),
      holder_name: trimSpaces(modal.data.holder_name),
      premium: trimSpaces(modal.data.premium),
      pr_no: trimSpaces(modal.data.pr_no).toUpperCase(),
      contact_1: trimSpaces(modal.data.contact_1),
      contact_2: trimSpaces(modal.data.contact_2),
      requirements: trimSpaces(modal.data.requirements)
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
    const willConvert = trimmedData.status === 'ok' && modal.mode === 'edit';
    const payload = {
      ...trimmedData,
      pr_date: toDbDate(trimmedData.pr_date)
    };
    try {
      const res = modal.mode==='create' ? await api.createProposer(payload) : await api.updateProposer(payload);
      if (res.ok) {
        toast(`Proposal ${modal.mode==='create'?'created':'updated'}`, 'success');
        setModal(m=>({...m,open:false}));
        load();
        if (willConvert && !trimmedData.converted_to_policy) setConvertId(trimmedData.id);
      } else toast(res.error||'Save failed','error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const res = await api.deleteProposer(confirm.id);
    if (res.ok) { toast('Proposal deleted successfully','success'); load(); }
    else toast(res.error||'Delete failed','error');
    setConfirm({open:false,id:null,type:'delete'});
  };

  const handleConvert = async () => {
    const res = await api.convertProposerToPolicy(convertId);
    if (res.ok) {
      toast('Proposal converted successfully. Complete the policy record.','success');
      setConvertId(null);
      if (res.policyId) {
        window.history.pushState(null, '', `?highlight=${res.policyId}`);
      }
      onNavigate('policy');
    } else {
      toast(res.error||'Conversion failed','error');
      setConvertId(null);
    }
  };

  const handleExportExcel = async () => {
    toast('Generating Excel export of proposal records...', 'info');
    try {
      const latest = await api.listProposers();
      const latestFiltered = latest.filter(r =>
        !search ||
        r.holder_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.proposal_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.sr_code?.toLowerCase().includes(search.toLowerCase()) ||
        r.sm_code?.toLowerCase().includes(search.toLowerCase()) ||
        r.ssm_code?.toLowerCase().includes(search.toLowerCase()) ||
        r.contact_1?.toLowerCase().includes(search.toLowerCase()) ||
        r.contact_2?.toLowerCase().includes(search.toLowerCase())
      );
      const res = await api.exportProposerExcel(latestFiltered);
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
    { key:'serial_no',    label:'Serial No', render: (v, row) => <span className="font-mono-data">{filtered.indexOf(row) + 1}</span> },
    { key:'proposal_no',  label:'Proposal No' },
    { key:'holder_name',  label:'Name' },
    { key:'contact_1',    label:'Contact 1' },
    { key:'contact_2',    label:'Contact 2' },
    { key:'premium',      label:'Premium', render: v=>`Rs. ${Number(v).toLocaleString()}` },
    { key:'amount_type',  label:'Premium Type', render: v=><span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">{v}</span> },
    { key:'pr_no',        label:'PR No' },
    { key:'pr_date',      label:'PR Date', render: v => formatDate(v) },
    { key:'sr_code',      label:'SR code' },
    { key:'sm_code',      label:'SM code' },
    { key:'ssm_code',     label:'SSM code' },
    { key:'requirements', label:'Requirements' },
    { key:'status',       label:'Status', render: v=><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${v==='ok'?'bg-success/10 text-success':'bg-warning/10 text-warning'}`}>{v==='not_ok'?'Not OK':'OK'}</span> },
    { key:'converted_to_policy', label:'Converted', render: v=><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${v?'bg-success/15 text-success':'bg-surface-variant/40 text-outline'}`}>{v?'Yes':'No'}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Page Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none mb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">search</span>
          <input
            id="prop-search"
            className="bg-surface-deep border border-border-subtle text-on-surface rounded-full pl-9 pr-4 py-1.5 w-64 focus:ring-1 focus:ring-primary focus:border-primary text-body-md placeholder:text-outline-variant outline-none transition-all"
            placeholder="Search by name, proposal no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            id="btn-export-proposers-excel"
            className="px-4 py-2 bg-green-600 hover:brightness-110 active:scale-[0.98] text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 outline-none shadow-md"
            onClick={handleExportExcel}
          >
            <span className="material-symbols-outlined text-sm font-bold">table_chart</span>
            <span>Export Excel</span>
          </button>
          <button
            id="btn-create-proposer"
            className="px-4 py-2 bg-primary hover:brightness-110 active:scale-[0.98] text-on-primary font-bold rounded-lg text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 outline-none shadow-md shadow-primary/10"
            onClick={() => setModal({ open: true, mode: 'create', data: { ...EMPTY } })}
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            <span>Add Proposal</span>
          </button>
        </div>
      </div>

      <DataTable columns={columns} rows={filtered} loading={loading}
        highlightId={new URLSearchParams(window.location.search).get('highlight')}
        actions={row=><>
          <button
            className="p-1.5 hover:text-primary transition-colors material-symbols-outlined text-[18px]"
            onClick={() => {
              const editData = { ...row };
              editData.pr_date = toDisplayDate(editData.pr_date);
              setModal({ open: true, mode: 'edit', data: editData });
            }}
            title="Edit Proposal"
          >
            edit
          </button>
          <button
            className="p-1.5 hover:text-error transition-colors material-symbols-outlined text-[18px]"
            onClick={() => setConfirm({ open: true, id: row.id, type: 'delete' })}
            title="Delete Proposal"
          >
            delete
          </button>
          {!row.converted_to_policy && row.status==='ok' && (
            <button
              className="p-1.5 hover:text-success transition-colors material-symbols-outlined text-[18px]"
              onClick={() => setConvertId(row.id)}
              title="Convert to Policy"
            >
              check_circle
            </button>
          )}
        </>}
      />

      {/* Form Modal */}
      <Modal open={modal.open} onClose={()=>setModal(m=>({...m,open:false}))}
        title={modal.mode==='create'?'Add Proposal Record':'Edit Proposal Record'} size="lg"
        footer={<>
          <button
            className="px-4 py-2 border border-border-subtle hover:bg-surface-variant/30 text-on-surface rounded font-body-md text-body-md transition-colors outline-none"
            onClick={() => setModal(m => ({ ...m, open: false }))}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-primary text-on-primary hover:brightness-110 font-bold rounded transition-colors outline-none active:scale-95"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Record'}
          </button>
        </>}
      >
        <div className="space-y-6 select-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Proposal No <span className="text-error">*</span></label>
              <input
                autoFocus
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                  errors.proposal_no ? 'border-error focus:border-error' : ''
                }`}
                placeholder="PR-XXXX-XXXX"
                value={modal.data.proposal_no}
                onChange={e=>set('proposal_no',formatCode(e.target.value))}
              />
              {errors.proposal_no&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.proposal_no}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Holder Name <span className="text-error">*</span></label>
              <input
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                  errors.holder_name ? 'border-error focus:border-error' : ''
                }`}
                placeholder="Full legal name"
                value={modal.data.holder_name}
                onChange={e=>set('holder_name',formatName(e.target.value))}
              />
              {errors.holder_name&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.holder_name}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Contact No 1</label>
              <input
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                  errors.contact_1 ? 'border-error focus:border-error' : ''
                }`}
                placeholder="03XXXXXXXXX"
                value={modal.data.contact_1 || ''}
                onChange={e=>set('contact_1',formatPhone(e.target.value))}
              />
              {errors.contact_1&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.contact_1}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Contact No 2</label>
              <input
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                  errors.contact_2 ? 'border-error focus:border-error' : ''
                }`}
                placeholder="03XXXXXXXXX"
                value={modal.data.contact_2 || ''}
                onChange={e=>set('contact_2',formatPhone(e.target.value))}
              />
              {errors.contact_2&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.contact_2}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Amount / Premium (PKR) <span className="text-error">*</span></label>
              <input
                type="text"
                className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                  errors.premium ? 'border-error focus:border-error' : ''
                }`}
                placeholder="50,000"
                value={modal.data.premium}
                onChange={e=>set('premium',formatAmount(e.target.value))}
              />
              {errors.premium&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.premium}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">PR No</label>
              <input
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm"
                placeholder="PR Number"
                value={modal.data.pr_no}
                onChange={e=>set('pr_no',formatCode(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">PR Date</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  className={`w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 pr-10 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm ${
                    errors.pr_date ? 'border-error focus:border-error' : ''
                  }`}
                  value={modal.data.pr_date || ''}
                  onChange={e=>set('pr_date',formatDateInput(e.target.value))}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center w-6 h-6 z-10">
                  <span className="material-symbols-outlined text-outline text-[18px] pointer-events-none">calendar_month</span>
                  <input 
                    type="date"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={toDbDate(modal.data.pr_date) || ''}
                    onChange={e => {
                      if (e.target.value) {
                        set('pr_date', toDisplayDate(e.target.value));
                      }
                    }}
                  />
                </div>
              </div>
              {errors.pr_date&&<span className="text-[11px] text-error font-semibold mt-0.5">{errors.pr_date}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Amount Type</label>
              <select
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all font-body-md text-sm"
                value={modal.data.amount_type}
                onChange={e=>set('amount_type',e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Status</label>
              <select
                className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all font-body-md text-sm"
                value={modal.data.status}
                onChange={e=>set('status',e.target.value)}
              >
                <option value="not_ok">Not OK</option>
                <option value="ok">OK</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border-subtle/50 pt-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Assigned SR <span className="text-error">*</span></label>
              <SearchableDropdown id="prop-sr" options={srOpts} value={modal.data.sr_id} onChange={handleSRChange} placeholder="Select SR…"/>
              {errors.sr_id && <span className="text-[11px] text-error font-semibold mt-0.5">{errors.sr_id}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Assigned SM <span className="text-error">*</span></label>
              <SearchableDropdown id="prop-sm" options={smOpts} value={modal.data.sm_id} onChange={handleSMChange} placeholder="Select SM…"/>
              {errors.sm_id && <span className="text-[11px] text-error font-semibold mt-0.5">{errors.sm_id}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Assigned SSM <span className="text-error">*</span></label>
              <SearchableDropdown id="prop-ssm" options={ssmOpts} value={modal.data.ssm_id} onChange={handleSSMChange} placeholder="Select SSM…"/>
              {errors.ssm_id && <span className="text-[11px] text-error font-semibold mt-0.5">{errors.ssm_id}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border-subtle/50 pt-4">
            <label className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider block">Requirements / Notes</label>
            <textarea
              className="w-full bg-surface-deep border border-border-subtle rounded px-4 py-2.5 text-on-surface focus:border-primary focus:ring-0 outline-none transition-all placeholder:text-outline-variant font-body-md text-sm resize-none"
              value={modal.data.requirements}
              onChange={e=>set('requirements',e.target.value)}
              placeholder="List specific guidelines or underwriting requirements..."
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Convert to Policy confirm */}
      <ConfirmDialog open={!!convertId} onClose={()=>setConvertId(null)} onConfirm={handleConvert} danger={false}
        title="Convert to Policy?" message="Convert this proposal to a Policy Record? You will be taken to the Policy Register to complete the remaining fields." />

      <ConfirmDialog open={confirm.open&&confirm.type==='delete'} onClose={()=>setConfirm({open:false,id:null,type:'delete'})} onConfirm={handleDelete}
        title="Delete Proposal" message="Are you sure you want to delete this proposal record? This action cannot be undone." />
    </div>
  );
}

