import { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  FileSpreadsheet, Upload, X, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2, ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const INFLOW_FIELDS = [
  { key: 'name', label: 'Deal Name', required: true },
  { key: 'company', label: 'Company', required: true },
  { key: 'value', label: 'Value ($)', required: true },
  { key: 'stage', label: 'Stage', required: false },
  { key: 'probability', label: 'Probability (%)', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'expected_close_date', label: 'Close Date', required: false },
];

const CsvImportModal = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1); // 1=upload, 2=map, 3=confirm
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [data, setData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [sourceName, setSourceName] = useState('');
  const [stageMapping, setStageMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setSourceName(file.name.replace(/\.csv$/i, ''));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data || result.data.length === 0) {
          setError('No data found in the CSV file');
          return;
        }
        if (result.data.length > 5000) {
          setError('Maximum 5000 rows allowed. Please split your file.');
          return;
        }
        setHeaders(result.meta.fields || []);
        setData(result.data);
        // Auto-map columns by fuzzy matching
        const autoMap = {};
        const fields = result.meta.fields || [];
        INFLOW_FIELDS.forEach(({ key }) => {
          const match = fields.find(f => f.toLowerCase().replace(/[_\s-]/g, '').includes(key.replace(/_/g, '')));
          if (match) autoMap[key] = match;
        });
        setMapping(autoMap);
        setStep(2);
      },
      error: () => setError('Failed to parse CSV file'),
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
    else setError('Please upload a .csv file');
  };

  const uniqueStages = () => {
    if (!mapping.stage) return [];
    const vals = new Set(data.map(r => r[mapping.stage]).filter(Boolean));
    return [...vals].slice(0, 20);
  };

  const handleImport = async () => {
    const required = INFLOW_FIELDS.filter(f => f.required);
    const missing = required.filter(f => !mapping[f.key]);
    if (missing.length > 0) {
      setError(`Please map required fields: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setImporting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/business/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_name: sourceName || 'CSV Import',
          mapping,
          stage_mapping: Object.keys(stageMapping).length > 0 ? stageMapping : null,
          data,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        onSuccess(result);
      } else {
        setError(result.detail || 'Import failed');
      }
    } catch {
      setError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" data-testid="csv-import-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Import CSV</h3>
              <p className="text-xs text-zinc-500">Step {step} of 3</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" data-testid="csv-modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="csv-error">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 hover:border-slate-500/50 rounded-xl p-12 text-center cursor-pointer transition-colors"
              data-testid="csv-drop-zone"
            >
              <Upload className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
              <p className="text-white font-medium mb-1">Drop your CSV file here</p>
              <p className="text-zinc-500 text-sm">or click to browse (max 5,000 rows)</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
                data-testid="csv-file-input"
              />
            </div>
          )}

          {/* Step 2: Map Columns */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Source Name</label>
                <input
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                  placeholder="e.g., My CRM Export"
                  data-testid="csv-source-name"
                />
              </div>

              <div>
                <h4 className="text-sm font-medium text-white mb-3">Map your columns to InFlow fields</h4>
                <div className="space-y-2">
                  {INFLOW_FIELDS.map(({ key, label, required }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400 w-32 shrink-0">
                        {label} {required && <span className="text-red-400">*</span>}
                      </span>
                      <div className="relative flex-1">
                        <select
                          value={mapping[key] || ''}
                          onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value || null }))}
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-slate-500"
                          data-testid={`csv-map-${key}`}
                        >
                          <option value="">-- Skip --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage Mapping */}
              {mapping.stage && uniqueStages().length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Map stage values <span className="text-zinc-500 text-xs">(optional)</span></h4>
                  <p className="text-xs text-zinc-500 mb-3">Map your stage values to InFlow stages. Unmapped values default to "Lead".</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {uniqueStages().map(val => (
                      <div key={val} className="flex items-center gap-3">
                        <span className="text-sm text-zinc-400 w-40 shrink-0 truncate" title={val}>{val}</span>
                        <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                        <div className="relative flex-1">
                          <select
                            value={stageMapping[val.toLowerCase()] || ''}
                            onChange={(e) => setStageMapping(m => ({ ...m, [val.toLowerCase()]: e.target.value }))}
                            className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs appearance-none focus:outline-none focus:border-slate-500"
                          >
                            <option value="">Auto-detect</option>
                            <option value="lead">Lead</option>
                            <option value="qualified">Qualified</option>
                            <option value="proposal">Proposal</option>
                            <option value="negotiation">Negotiation</option>
                            <option value="closed_won">Closed Win</option>
                            <option value="closed_lost">Closed Lost</option>
                          </select>
                          <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              <div>
                <h4 className="text-sm font-medium text-white mb-2">Preview ({data.length} rows)</h4>
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-800/50">
                        {headers.slice(0, 5).map(h => (
                          <th key={h} className="px-3 py-2 text-left text-zinc-400 font-medium truncate max-w-[120px]">{h}</th>
                        ))}
                        {headers.length > 5 && <th className="px-3 py-2 text-zinc-500">+{headers.length - 5} more</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-zinc-800/50">
                          {headers.slice(0, 5).map(h => (
                            <td key={h} className="px-3 py-2 text-zinc-300 truncate max-w-[120px]">{row[h]}</td>
                          ))}
                          {headers.length > 5 && <td className="px-3 py-2 text-zinc-600">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-xl p-5 space-y-3">
                <h4 className="text-white font-medium">Import Summary</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-zinc-500">Source:</span> <span className="text-white ml-2">{sourceName}</span></div>
                  <div><span className="text-zinc-500">Rows:</span> <span className="text-white ml-2">{data.length}</span></div>
                  <div><span className="text-zinc-500">File:</span> <span className="text-white ml-2">{fileName}</span></div>
                  <div><span className="text-zinc-500">Columns mapped:</span> <span className="text-white ml-2">{Object.values(mapping).filter(Boolean).length}</span></div>
                </div>
                <div className="pt-2 border-t border-zinc-700">
                  <p className="text-xs text-zinc-500">Field Mapping:</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {INFLOW_FIELDS.filter(f => mapping[f.key]).map(f => (
                      <span key={f.key} className="px-2 py-0.5 rounded-full text-[11px] bg-slate-500/10 text-slate-400">
                        {f.label} → {mapping[f.key]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-zinc-800 shrink-0">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" data-testid="csv-back-btn">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            {step === 2 && (
              <Button onClick={() => { setError(''); setStep(3); }} className="bg-white/10 hover:bg-white/20" data-testid="csv-next-btn">
                Review <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-500" data-testid="csv-import-btn">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Importing...</> : <><Check className="w-4 h-4 mr-1.5" />Import {data.length} Records</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CsvImportModal;
