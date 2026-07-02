import { useState } from 'react';
import {
  Globe, X, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2, ChevronDown, Zap, CheckCircle2,
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
];

const AUTH_TYPES = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'header', label: 'API Key (Header)' },
  { value: 'query', label: 'API Key (Query Param)' },
  { value: 'none', label: 'No Auth' },
];

const CustomApiModal = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1); // 1=config, 2=test+map, 3=confirm
  const [config, setConfig] = useState({
    name: '', endpoint: '', method: 'GET', auth_type: 'bearer', api_key: '', auth_key_name: '', data_path: '',
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [mapping, setMapping] = useState({});
  const [stageMapping, setStageMapping] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const updateConfig = (key, value) => setConfig(c => ({ ...c, [key]: value }));

  const handleTest = async () => {
    if (!config.endpoint) { setError('API endpoint is required'); return; }
    setTesting(true);
    setError('');
    setTestResult(null);
    try {
      const body = {
        endpoint: config.endpoint,
        method: config.method,
        auth_type: config.auth_type,
        api_key: config.auth_type !== 'none' ? config.api_key : null,
        auth_key_name: config.auth_key_name || null,
      };
      const res = await fetch(`${API_URL}/api/business/custom-api/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult(data);
      if (!data.success) setError(data.error || 'Connection test failed');
    } catch {
      setError('Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    const required = INFLOW_FIELDS.filter(f => f.required);
    const missing = required.filter(f => !mapping[f.key]);
    if (missing.length > 0) {
      setError(`Map required fields: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const body = {
        name: config.name || 'Custom API',
        endpoint: config.endpoint,
        method: config.method,
        auth_type: config.auth_type,
        api_key: config.auth_type !== 'none' ? config.api_key : null,
        auth_key_name: config.auth_key_name || null,
        data_path: config.data_path || null,
        mapping,
        stage_mapping: Object.keys(stageMapping).length > 0 ? stageMapping : null,
      };
      const res = await fetch(`${API_URL}/api/business/custom-api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess(data);
      } else {
        setError(data.detail || 'Connection failed');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const fields = testResult?.fields || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" data-testid="custom-api-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-500/15 flex items-center justify-center">
              <Globe className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Connect Custom API</h3>
              <p className="text-xs text-zinc-500">Step {step} of 3</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" data-testid="api-modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="api-error">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Step 1: Config */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Connection Name</label>
                <input value={config.name} onChange={e => updateConfig('name', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                  placeholder="e.g., My CRM API" data-testid="api-name-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">API Endpoint</label>
                <input value={config.endpoint} onChange={e => updateConfig('endpoint', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                  placeholder="https://api.example.com/v1/data" data-testid="api-endpoint-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Method</label>
                  <div className="relative">
                    <select value={config.method} onChange={e => updateConfig('method', e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-slate-500"
                      data-testid="api-method-select">
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Authentication</label>
                  <div className="relative">
                    <select value={config.auth_type} onChange={e => updateConfig('auth_type', e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-slate-500"
                      data-testid="api-auth-select">
                      {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
              {config.auth_type !== 'none' && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">API Key / Token</label>
                  <input type="password" value={config.api_key} onChange={e => updateConfig('api_key', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                    placeholder="Your API key or token" data-testid="api-key-input" />
                </div>
              )}
              {(config.auth_type === 'header' || config.auth_type === 'query') && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                    {config.auth_type === 'header' ? 'Header Name' : 'Query Parameter Name'}
                  </label>
                  <input value={config.auth_key_name} onChange={e => updateConfig('auth_key_name', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                    placeholder={config.auth_type === 'header' ? 'X-API-Key' : 'api_key'} />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Test + Map */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Test Connection */}
              <div className="flex items-center gap-3">
                <Button onClick={handleTest} disabled={testing} className="bg-white/10 hover:bg-white/20" data-testid="api-test-btn">
                  {testing ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Testing...</> : <><Zap className="w-4 h-4 mr-1.5" />Test Connection</>}
                </Button>
                {testResult?.success && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Connected — {fields.length} fields found
                  </span>
                )}
              </div>

              {/* Sample Data */}
              {testResult?.success && testResult.sample_data && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Sample Response</h4>
                  <pre className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400 overflow-x-auto max-h-32">
                    {JSON.stringify(testResult.sample_data, null, 2).slice(0, 800)}
                  </pre>
                </div>
              )}

              {/* Data Path */}
              {testResult?.success && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                    Data Path <span className="text-zinc-600">(dot notation to the data array, e.g., "data.items")</span>
                  </label>
                  <input value={config.data_path} onChange={e => updateConfig('data_path', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-500"
                    placeholder="Leave blank if response is already an array" data-testid="api-data-path" />
                </div>
              )}

              {/* Field Mapping */}
              {testResult?.success && fields.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Map API fields to InFlow</h4>
                  <div className="space-y-2">
                    {INFLOW_FIELDS.map(({ key, label, required }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-sm text-zinc-400 w-32 shrink-0">
                          {label} {required && <span className="text-red-400">*</span>}
                        </span>
                        <div className="relative flex-1">
                          <select value={mapping[key] || ''} onChange={e => setMapping(m => ({ ...m, [key]: e.target.value || null }))}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-slate-500"
                            data-testid={`api-map-${key}`}>
                            <option value="">-- Skip --</option>
                            {fields.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                          <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="bg-zinc-800/50 rounded-xl p-5 space-y-3">
              <h4 className="text-white font-medium">Connection Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-zinc-500">Name:</span> <span className="text-white ml-2">{config.name || 'Custom API'}</span></div>
                <div><span className="text-zinc-500">Endpoint:</span> <span className="text-white ml-2 truncate">{config.endpoint}</span></div>
                <div><span className="text-zinc-500">Method:</span> <span className="text-white ml-2">{config.method}</span></div>
                <div><span className="text-zinc-500">Auth:</span> <span className="text-white ml-2">{AUTH_TYPES.find(a => a.value === config.auth_type)?.label}</span></div>
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-zinc-800 shrink-0">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" data-testid="api-back-btn">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            {step === 1 && (
              <Button onClick={() => { setError(''); setStep(2); }} disabled={!config.endpoint}
                className="bg-white/10 hover:bg-white/20" data-testid="api-next-btn">
                Test & Map <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
            {step === 2 && testResult?.success && (
              <Button onClick={() => { setError(''); setStep(3); }} className="bg-white/10 hover:bg-white/20" data-testid="api-review-btn">
                Review <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleConnect} disabled={connecting} className="bg-white/10 hover:bg-white/20" data-testid="api-connect-btn">
                {connecting ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Connecting...</> : <><Check className="w-4 h-4 mr-1.5" />Connect & Sync</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomApiModal;
