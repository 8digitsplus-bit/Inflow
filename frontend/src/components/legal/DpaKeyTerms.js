import { LegalLink } from './LegalShell';

const ROWS = [
  ['Controller', <>The customer: the business that holds an InFlow account. Address: as recorded in the customer’s account or billing settings. Contact: the account owner, at the email address associated with the account.</>],
  ['Processor', <>Amaan Bashar, trading as InFlow, Office 7205, 58 Peregrine Road, Ilford, Greater London IG6 3SZ, United Kingdom. Contact: <LegalLink href="mailto:support@inflowft.com" testId="dpa-processor-email">support@inflowft.com</LegalLink></>],
  ['Parties', <>The Controller and the Processor together are the “Parties”, and each a “Party”.</>],
  ['Processing Purpose', <>
    The Processor processes Customer Personal Data only to provide the InFlow revenue intelligence service to the Controller. This means:
    (a) importing and syncing data from the business tools the Controller connects (CRMs, payment and accounting systems, e-commerce and analytics platforms);
    (b) storing, organising and analysing that data to provide pipeline management, pricing optimisation, revenue attribution, forecasting, revenue leak detection and upsell recommendations;
    (c) generating AI-assisted insights and drafts using that data;
    (d) writing updates back to the Controller’s connected tools when the Controller or its users instruct it to;
    (e) sending emails and notifications on the Controller’s behalf;
    (f) providing customer support; and
    (g) keeping the service secure and reliable, including error monitoring and backups.
    The Processor will not use Customer Personal Data for its own purposes or sell it.
  </>],
  ['Duration of Processing', <>Only as long as necessary for the Processing Purpose, which is the term of the Base Agreement, followed by deletion in accordance with Clause 4.3.</>],
  ['Categories of Data Subjects', [
    'Customers of the Controller',
    'Potential clients (leads and prospects) of the Controller',
    'Employees of the Controller',
    'Visitors to the Controller’s websites where the InFlow tracking snippet is installed',
    'Business contacts at the Controller’s customers’ and prospects’ organisations',
    'Any other authorised users of the Controller’s InFlow account (such as contractors or consultants)',
  ]],
  ['Categories of Personal Data', [
    'Name',
    'Contact data (email address, phone number)',
    'Financial data (deal values, invoices, payments, subscriptions and transaction history)',
    'Business details from connected CRMs (company, job title, deals, pipeline stage, notes and activity history)',
    'Purchase, subscription and renewal history',
    'Product usage and engagement data from connected analytics tools',
    'Website browsing activity collected by the InFlow tracking snippet (visitor ID, pages viewed and email addresses submitted in forms)',
    'Login and account details of the Controller’s InFlow users',
  ]],
  ['Special categories of data', <>None. The processing does not involve special categories of personal data or personal data relating to criminal convictions and offences.</>],
  ['Place of storage & processing', <>On the infrastructure of the Processor’s approved Sub-processors in Ireland, the Netherlands and the United States, as listed on the Sub-processors page. Customer Personal Data is not stored at the Processor’s business address.</>],
  ['On-premise audits', <>No</>],
  ['Sub-processors', <>Listed at <LegalLink href="/subprocessors" testId="dpa-subprocessors-link">https://www.inflowft.com/subprocessors</LegalLink></>],
  ['Transfers outside the UK, EU/EEA and Switzerland', <>Permitted only to the countries listed for the approved Sub-processors on the Sub-processors page, and only with the safeguards described in Clause 4.7.</>],
  ['Supervisory authority', <>For the United Kingdom, the Information Commissioner’s Office (ICO). Otherwise, the competent supervisory authority under the applicable Data Protection Law.</>],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const DpaKeyTerms = () => (
  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" data-testid="dpa-key-terms">
    {ROWS.map(([label, value]) => (
      <div key={label} className="grid gap-1 sm:grid-cols-[200px_1fr] sm:gap-6 border-t border-white/[0.06] first:border-t-0 px-4 py-4" data-testid={`dpa-key-${slug(label)}`}>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-sm text-zinc-400">
          {Array.isArray(value)
            ? <ul className="list-disc pl-5 space-y-1 marker:text-zinc-600">{value.map((v) => <li key={v}>{v}</li>)}</ul>
            : value}
        </div>
      </div>
    ))}
  </div>
);
