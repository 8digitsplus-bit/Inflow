import LegalDocument from '../components/LegalDocument';

// Termly Terms of Service UUID — Termly Dashboard → Documents → Terms → Embed
const TERMLY_TERMS_ID = 'd418110f-9ff8-4583-9d40-2cde4be2cfe0';

const Terms = () => (
  <LegalDocument
    policyId={TERMLY_TERMS_ID}
    title="Terms of Service"
    docLabel="terms"
    contactEmail="support@inflowft.com"
    testId="terms"
  />
);

export default Terms;
