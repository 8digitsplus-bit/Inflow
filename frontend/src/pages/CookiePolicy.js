import LegalDocument from '../components/LegalDocument';

// Termly Cookie Policy UUID — Termly Dashboard → Documents → Cookie Policy → Embed
const TERMLY_COOKIE_POLICY_ID = '9d85a543-e935-413d-b946-0dfab9170b2a';

const CookiePolicy = () => (
  <LegalDocument
    policyId={TERMLY_COOKIE_POLICY_ID}
    title="Cookie Policy"
    docLabel="cookie policy"
    contactEmail="support@inflowft.com"
    testId="cookie"
  />
);

export default CookiePolicy;
