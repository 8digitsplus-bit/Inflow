import { Clause, Para, Lettered } from './LegalShell';

const LAW = 'the UK GDPR and the EU GDPR';

const MISC = [
  ['Confidentiality', 'The Parties shall keep confidential any non-public information exchanged under this DPA, unless agreed otherwise between the Parties. This DPA itself is published and is not confidential.'],
  ['Entire agreement', 'This DPA, together with the Base Agreement, is the entire agreement between the Parties relating to the scope of this DPA and supersedes all prior agreements between the Parties on that subject.'],
  ['Amendments', 'The Processor may update this DPA from time to time, for example to reflect changes in law or in the Services. The Processor will notify the Controller in text form of material changes at least 30 days before they take effect. Changes to the list of Sub-processors follow Clause 4.6. Any other amendment or supplement to this DPA must be agreed in writing (including non-qualified e-signature solutions).'],
  ['Notices', 'Any notice “in writing” needs to be delivered by physical mail. Any notice “in text form” includes any electronic message, including email and in-app notifications, each to the last communicated or available address. If the form is not stated, text form is sufficient.'],
  ['Assignment', 'Neither Party may assign any of its rights, obligations or claims under this DPA unless agreed otherwise, except that the Processor may assign this DPA, together with the Base Agreement, to a successor to the InFlow business (for example, a company formed to carry on that business), provided the successor is bound by this DPA.'],
  ['Severability', 'If any provision of this DPA (in whole or in part) is held to be illegal, invalid or otherwise unenforceable, the other provisions will remain in full force and effect, with the necessary changes made.'],
  ['Governing law & jurisdiction', 'As set out in the Base Agreement.'],
];

export const DpaClauses5to8 = () => (
  <>
    <Clause n={5} title="Data subject rights">
      <Para n="5.1">The Processor shall promptly notify the Controller about any request received directly from a data subject. It shall not respond to that request itself, unless and until it has been authorised to do so by the Controller.</Para>
      <Para n="5.2">
        <p>The Processor shall assist the Controller in fulfilling its obligations to respond to data subjects’ requests for the exercise of their rights in accordance with Chapter III of {LAW} and Chapter 4 FADP, as applicable, namely:</p>
        <Lettered items={[
          'the right to be informed when personal data are collected from the data subject;',
          'the right to be informed when personal data have not been obtained from the data subject;',
          'the right of access by the data subject;',
          'the right to rectification;',
          'the right to erasure (“the right to be forgotten”);',
          'the right to restriction of processing;',
          'the notification obligation regarding rectification or erasure of personal data or restriction of processing;',
          'the right to data portability;',
          'the right to object;',
          'the right not to be subject to a decision based solely on automated processing, including profiling; and',
          'the right to withdraw consent.',
        ]} />
      </Para>
      <Para n="5.3">The Processor shall assist the Controller in case a data subject has lodged a complaint with the competent supervisory authority that concerns data processed on the basis of this DPA.</Para>
      <Para n="5.4">
        <p>In addition to the Processor’s obligation to assist the Controller pursuant to Clause 5.2, the Processor shall furthermore assist the Controller in ensuring compliance with the following obligations, taking into account the nature of the processing and the information available to the Processor:</p>
        <Lettered items={[
          `the obligation to notify a personal data breach to the competent supervisory authority without undue delay after having become aware of it (unless the personal data breach is unlikely to result in a risk to the rights and freedoms of natural persons), in accordance with Article 33 of ${LAW} and Article 24(1) to (3) FADP;`,
          `the obligation to communicate the personal data breach to the data subject without undue delay, when the personal data breach is likely to result in a high risk to the rights and freedoms of natural persons, in accordance with Article 34 of ${LAW} and Article 24(4) FADP;`,
          `the obligation to carry out an assessment of the impact of the envisaged processing operations on the protection of personal data (a “data protection impact assessment”) where a type of processing is likely to result in a high risk to the rights and freedoms of natural persons, in accordance with Article 35 of ${LAW} and Article 22 FADP;`,
          `the obligation to consult the competent supervisory authority prior to processing where a data protection impact assessment indicates that the processing would result in a high risk in the absence of measures taken by the Controller to mitigate the risk, in accordance with Article 36 of ${LAW} and Article 23 FADP.`,
        ]} />
      </Para>
      <Para n="5.5">The appropriate technical and organisational measures by which the Processor assists the Controller in the application of this Clause are set out in Section C.</Para>
    </Clause>

    <Clause n={6} title="Notification of personal data breaches">
      <Para n="6.1">In the event of a personal data breach, the Processor shall cooperate in good faith with and assist the Controller in any way necessary for the Controller to comply with its obligations under Articles 33 and 34 of {LAW} and Article 24 FADP, as applicable, taking into account the nature of processing and the information available to the Processor.</Para>
      <Para n="6.2">
        <p>The Processor shall assist the Controller in notifying the personal data breach to the competent supervisory authority, where relevant. The Processor shall be required to assist in obtaining in particular the following information which, pursuant to Article 33(3) of {LAW} or Article 24(2) FADP, as applicable, shall be stated in the Controller’s notification:</p>
        <Lettered items={[
          'the nature of the personal data breach including, where possible, the categories and approximate number of data subjects concerned, and the categories and approximate number of personal data records concerned;',
          'the likely consequences of the personal data breach;',
          'the measures taken or proposed to be taken by the Controller to address the personal data breach, including, where appropriate, measures to mitigate its possible adverse effects.',
        ]} />
      </Para>
    </Clause>

    <Clause n={7} title="Termination">
      <Para n="7.1">Without prejudice to any provisions of Data Protection Law, in the event that the Processor is in breach of its obligations under this DPA, the Controller may instruct the Processor to temporarily suspend the processing of personal data until the Processor complies with this DPA or the Base Agreement is terminated. The Processor shall promptly inform the Controller in case it is unable to comply with this DPA, for whatever reason.</Para>
      <Para n="7.2">
        <p>The Controller may terminate this DPA where:</p>
        <Lettered items={[
          'the processing of personal data by the Processor has been temporarily suspended by the Controller pursuant to Clause 7.1, the Processor’s breach is material, and compliance with this DPA is not restored within a reasonable time and in any event within one month;',
          'the Processor is in substantial or persistent breach of this DPA or its obligations under Data Protection Law, and such breach cannot reasonably be expected to be remedied;',
          'the Processor fails to comply with a binding decision of a competent court or the competent supervisory authority regarding its obligations under this DPA or under Data Protection Law.',
        ]} />
      </Para>
    </Clause>

    <Clause n={8} title="Miscellaneous">
      {MISC.map(([label, text]) => (
        <p key={label}><span className="font-medium text-white">{label}:</span> {text}</p>
      ))}
    </Clause>
  </>
);
