const ORGANISATIONAL = [
  ['Security responsibility', 'InFlow is operated by its founder, who is responsible for information security and data protection. Security and privacy questions can be sent to support@inflowft.com.'],
  ['Need-to-know access', 'Access to production systems and Customer Personal Data is limited to the founder and is used only where needed to provide, support, secure or troubleshoot the Services. Anyone given access in future will be bound by written confidentiality obligations and given access only to what their role requires.'],
  ['Sub-processor management', 'Sub-processors are selected with regard to their security practices, are bound by written data protection terms, and are listed publicly on the Sub-processors page.'],
  ['Incident response', 'Application errors and unusual activity are monitored continuously. Suspected personal data breaches are investigated promptly and notified to the Controller in accordance with Clause 4.4.'],
  ['Data minimisation and retention', 'InFlow processes only the data needed for the Processing Purpose. Closed accounts are permanently deleted after a 30-day grace period, and inactive accounts without an active plan are deleted after 12 months, following a warning email.'],
];

const TECHNICAL = [
  ['Encryption in transit', 'All connections to InFlow, and between InFlow and its Sub-processors, are encrypted using HTTPS/TLS.'],
  ['Encryption at rest', 'Customer Personal Data is stored in MongoDB Atlas, which encrypts data at rest. Credentials for connected integrations (API keys and OAuth tokens) are additionally encrypted by InFlow before they are stored.'],
  ['Authentication', 'Passwords are hashed with bcrypt and never stored in plain text, and must be at least 8 characters long. Users can turn on email-based two-factor authentication or sign in with Google. Sign-in sessions use secure, HTTP-only cookies that expire after 7 days. Deleting an account requires a one-time code sent by email.'],
  ['Access control in the product', 'Each customer’s data is kept logically separate within its own account or workspace. Workspace owners control who is invited, and billing, account and workspace management actions are restricted to the owner.'],
  ['Abuse protection', 'Rate limits apply to sign-in, sign-up, verification and other sensitive actions to protect against brute-force attacks.'],
  ['Logging and monitoring', 'Application errors and performance are monitored in real time, and hosting providers maintain infrastructure and access logs.'],
  ['Physical security', 'InFlow does not operate its own servers or data centres. Customer Personal Data is hosted in the data centres of its Sub-processors, which are responsible for physical security, and is not kept on paper.'],
  ['Backups', 'The database is backed up automatically every day through MongoDB Atlas’s managed backup service. The last 8 daily backups are kept, and older backups are deleted automatically.'],
  ['Administrator access', 'Two-factor authentication or passkeys are enabled on the administrator accounts for InFlow’s database, website hosting, source code and payment providers.'],
  ['Secure development', 'Code changes are version-controlled and tested before being deployed.'],
];

const Group = ({ n, title, items, testId }) => (
  <section className="mt-8 space-y-4" data-testid={testId}>
    <h3 className="text-base font-semibold text-white">{n}. {title}</h3>
    {items.map(([label, text], i) => (
      <div key={label} className="flex gap-3">
        <span className="shrink-0 w-8 text-zinc-500 tabular-nums">{n}.{i + 1}</span>
        <p><span className="font-medium text-white">{label}:</span> {text}</p>
      </div>
    ))}
  </section>
);

export const DpaSecurityMeasures = () => (
  <>
    <p>Description of the technical and organisational security measures implemented by the Processor:</p>
    <Group n={1} title="Organisational security measures" items={ORGANISATIONAL} testId="dpa-toms-organisational" />
    <Group n={2} title="Technical security measures" items={TECHNICAL} testId="dpa-toms-technical" />
  </>
);
