import { Clause, SubClause, Para, Lettered } from './LegalShell';

const LAW = 'the UK GDPR and the EU GDPR';

export const DpaClauses1to4 = () => (
  <>
    <Clause n={1} title="Purpose and scope">
      <Para n="1.1">The purpose of this data processing agreement (the “DPA”) is to ensure compliance with Article 28(3) and (4) of {LAW}, and Article 9 of the Swiss Federal Act on Data Protection (“FADP”), each only if and to the extent applicable to the respective processing activity.</Para>
      <Para n="1.2">This DPA applies with respect to the processing of personal data as specified in Section A.</Para>
      <Para n="1.3">This DPA forms part of the Base Agreement. If there is any conflict between this DPA and the Base Agreement concerning the processing of personal data, this DPA prevails.</Para>
    </Clause>

    <Clause n={2} title="Interpretation">
      <Para n="2.1">In this DPA, “Base Agreement” means the InFlow Terms of Service published at https://www.inflowft.com/terms, as updated from time to time; and “Data Protection Law” means (a) the UK GDPR (as defined in section 3(10) of the Data Protection Act 2018) and the Data Protection Act 2018, (b) Regulation (EU) 2016/679 (the “EU GDPR”), and (c) the FADP, each only if and to the extent it applies to the respective processing activity.</Para>
      <Para n="2.2">Where this DPA uses terms defined in Data Protection Law, those terms shall have the same meaning as in that law.</Para>
      <Para n="2.3">This DPA shall be read and interpreted in the light of the provisions of Data Protection Law.</Para>
      <Para n="2.4">This DPA shall not be interpreted in a way that conflicts with rights and obligations provided for in Data Protection Law, or prejudices the fundamental rights or freedoms of the data subjects.</Para>
    </Clause>

    <Clause n={3} title="Description of processing operations">
      <Para n="3.1">The details of the processing operations, and in particular the categories of personal data and the purposes of processing for which the personal data is processed on behalf of the Controller, are specified in Section A.</Para>
    </Clause>

    <Clause n={4} title="Obligations of the Parties">
      <SubClause n="4.1" title="General">
        <Lettered items={[
          'The Processor shall process personal data only on documented instructions from the Controller, unless required to do so by applicable law to which the Processor is subject (including the law of the United Kingdom, the European Union or its Member States, or Switzerland). Such instructions are specified in Section A and the Base Agreement. The Controller’s use and configuration of InFlow, such as connecting integrations or asking InFlow to update records in connected tools, also constitutes documented instructions. Where the Processor is required by law to process personal data otherwise, it shall inform the Controller of that legal requirement before processing, unless the law prohibits this on important grounds of public interest. Subsequent instructions may also be given by the Controller throughout the duration of the processing of personal data. Such instructions shall always be documented.',
          'The Processor shall immediately inform the Controller if instructions given by the Controller, in the opinion of the Processor, infringe Data Protection Law.',
        ]} />
      </SubClause>
      <SubClause n="4.2" title="Purpose limitation">
        <p>The Processor shall process the personal data only for the specific purpose(s) of the processing, as set out in Section A.</p>
      </SubClause>
      <SubClause n="4.3" title="Erasure or return of data">
        <Lettered items={[
          'Processing by the Processor shall only take place for the duration specified in Section A.',
          'Before its account is closed, the Controller may ask the Processor for a copy of the personal data processed on its behalf.',
          'Within 30 days of the termination of the Base Agreement, the closure of the Controller’s account, or termination pursuant to Clause 7, the Processor shall delete all personal data processed on behalf of the Controller, including existing copies, unless applicable law requires storage of the personal data. Any copies held in backups are deleted automatically as part of the normal backup cycle (currently within 8 days). On request, the Processor shall confirm the deletion to the Controller in text form.',
        ]} />
      </SubClause>
      <SubClause n="4.4" title="Security of processing">
        <Lettered items={[
          `The Processor shall implement the technical and organisational measures specified in Section C to ensure the security of the personal data, including protection against accidental or unlawful destruction, loss, alteration, unauthorised disclosure or access to that data (personal data breach), in accordance with Article 5, Article 28(3)(c) and Article 32 of ${LAW} and Article 8 FADP, as applicable. In assessing the appropriate level of security, the Parties shall in particular take due account of the risks involved in the processing, the nature of the personal data and the nature, scope, context and purposes of processing.`,
          'In the event of a personal data breach concerning data processed by the Processor, the Processor shall notify the Controller without undue delay and at the latest within 48 hours after having become aware of the breach. Such notification shall contain the details of a contact point where more information concerning the personal data breach can be obtained, a description of the nature of the breach (including, where possible, categories and approximate number of data subjects and data records concerned), its likely consequences and the measures taken or proposed to be taken to mitigate its possible adverse effects. Where, and insofar as, it is not possible to provide all information at the same time, the initial notification shall contain the information then available and further information shall be provided as it becomes available without undue delay.',
          'The Processor shall cooperate in good faith with and assist the Controller in any way necessary to enable the Controller to notify, where relevant, the competent supervisory authority and the affected data subjects, taking into account the nature of processing and the information available to the Processor.',
          'The Processor shall grant access to the data to members of its personnel only to the extent strictly necessary for the implementation, management and monitoring of the Base Agreement. The Processor shall ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.',
          'If the processing involves personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership, genetic or biometric data for the purpose of uniquely identifying a natural person, data concerning health or a person’s sex life or sexual orientation, or data relating to criminal convictions and offences (special categories of data), the Processor shall apply specific restrictions and/or additional safeguards as reasonably required by the Controller.',
        ]} />
      </SubClause>
      <SubClause n="4.5" title="Documentation and compliance">
        <Lettered items={[
          'The Parties shall be able to demonstrate compliance with this DPA.',
          'The Processor shall deal promptly and properly with all reasonable inquiries from the Controller that relate to the processing under this DPA.',
          'The Processor shall make available to the Controller all information necessary to demonstrate compliance with the obligations set out in this DPA and stemming directly from Data Protection Law and, at the Controller’s request, allow for and contribute to reviews of data files and documentation or of audits of the processing activities covered by this DPA, in particular if there are indications of non-compliance.',
          'The Controller may choose to conduct the audit by itself, to mandate, at its own cost, an independent auditor or to rely on an independent audit mandated by the Processor. Where the Processor mandates an audit, it has to bear the costs of the independent auditor. The Controller’s audit, access and inspection rights under this Clause are limited to the Processor’s records only (including, among others, the registers of personal data processing activities and the registers of recipients of personal data) and do not apply to the Processor’s physical premises. Any audit and request for information shall be limited to information necessary for the purposes of this DPA and shall give due regard to the Processor’s confidentiality obligations and legitimate interest to protect business secrets.',
          'The Processor and the Controller shall make the information referred to in this Clause, including the results of any audits, available to the competent supervisory authority on request if and to the extent required by Data Protection Law.',
        ]} />
      </SubClause>
      <SubClause n="4.6" title="Use of Sub-processors">
        <Lettered items={[
          'The Processor has the Controller’s general authorisation for the engagement of Sub-processors. The list of Sub-processors is available at the link in Section A. The Processor shall inform the Controller in text form of any intended changes to that list through the addition or replacement of Sub-processors at least 30 days in advance, thereby giving the Controller the opportunity to object to such changes prior to the engagement of the concerned Sub-processors. Such objection shall not be unreasonably raised. The Processor shall keep the list up to date.',
          `Where the Processor engages a Sub-processor for carrying out specific processing activities on behalf of the Controller, it shall do so by way of a contract which imposes on the Sub-processor the same obligations as the ones imposed on the Processor under this DPA. The Processor shall ensure that the Sub-processor complies with the obligations to which the Processor is subject pursuant to this DPA, Article 28(2) to (4) of ${LAW} and Article 9(3) FADP, as applicable.`,
          'The Processor shall provide, at the Controller’s request, a copy of such a Sub-processor agreement and subsequent amendments to the Controller.',
          'The Processor shall remain fully responsible to the Controller for the performance of the Sub-processor’s obligations under its contract with the Processor. The Processor shall notify the Controller of any failure by the Sub-processor to fulfil its obligations under that contract.',
        ]} />
      </SubClause>
      <SubClause n="4.7" title="International transfers">
        <Lettered items={[
          `Any transfer of personal data to a country outside the United Kingdom, the EU/EEA and Switzerland (a “Third Country”) or to an international organisation by the Processor shall be undertaken only if authorised in accordance with Section A and shall take place in compliance with Chapter V of ${LAW} and Articles 16 to 18 FADP, as applicable.`,
          'The Controller agrees that where the Processor engages a Sub-processor in accordance with Clause 4.6 for carrying out specific processing activities on behalf of the Controller in a Third Country, and those processing activities involve a transfer of personal data within the meaning of Data Protection Law, the Processor and the Sub-processor may rely on (i) adequacy regulations or decisions, including the EU–US Data Privacy Framework and its UK Extension where the Sub-processor is certified; or (ii) the standard contractual clauses adopted by the European Commission on the basis of Article 46(2) EU GDPR, together with the International Data Transfer Addendum issued by the UK Information Commissioner (or the UK International Data Transfer Agreement), provided the conditions for the use of those safeguards are met and an internal assessment has concluded that the transfer meets the level of protection required by Data Protection Law.',
        ]} />
      </SubClause>
    </Clause>
  </>
);
