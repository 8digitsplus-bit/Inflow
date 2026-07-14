import LegalDocument from '../components/LegalDocument';

// Termly Privacy Policy UUID — Termly Dashboard → Documents → Privacy Policy → Embed
const TERMLY_PRIVACY_POLICY_ID = 'b2bacd1c-c041-49b6-ae03-a0e8c57fea3e';

const PrivacyPolicy = () => (
  <LegalDocument
    policyId={TERMLY_PRIVACY_POLICY_ID}
    title="Privacy Policy"
    docLabel="policy"
    contactEmail="privacy@inflowft.com"
    testId="privacy"
  />
);

export default PrivacyPolicy;
