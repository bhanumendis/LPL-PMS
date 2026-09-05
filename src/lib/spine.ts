/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
export type FieldType = "text" | "textarea" | "date" | "month" | "select" | "yesno" | "number" | "multiselect" | "checkbox";

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  sensitive?: boolean;
  hint?: string;
  showIf?: { field: string; equals: unknown };
  full?: boolean;
  studentEditable?: boolean;
}

export type Owner = "Counsellor" | "Student / parent" | "Team Leader" | "Finance" | "University" | "Counsellor / front desk";

export interface DocKind {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
}

export interface StepDef {
  n: number;
  stage: string;
  title: string;
  studentTitle: string;
  owner: Owner;
  fields: FieldDef[];
  optional?: boolean;
  unlockAfter?: number[];
  gate?: 16 | 19;
  decision?: boolean;
  docs?: DocKind[];
  studentAction?: boolean;
  sla?: string;
}

export interface StageDef {
  id: string;
  name: string;
  steps: number[];
  exit: string;
}

export const STAGES: StageDef[] = [
  { id: "S1", name: "Capture", steps: [1], exit: "Case created and owner assigned" },
  { id: "S2", name: "Qualify and profile", steps: [2, 3], exit: "Profile complete or alternative route chosen" },
  { id: "S3", name: "Match", steps: [4, 5, 6], exit: "Programme and destination fixed" },
  { id: "S4", name: "Feasibility gate", steps: [7, 8], exit: "Financial route validated" },
  { id: "S5", name: "Apply", steps: [9, 10, 11, 12], exit: "Applications lodged" },
  { id: "S6", name: "Offer management", steps: [13, 14], exit: "Firm choice against an offer" },
  { id: "S7", name: "Accept and pay", steps: [15, 16, 17, 18, 21], exit: "Enrolment confirmation received" },
  { id: "S8", name: "Visa", steps: [19, 22, 23, 24, 25, 27], exit: "Visa decision issued" },
  { id: "S9", name: "Depart and arrive", steps: [20, 26, 28, 29, 30], exit: "Student on campus" },
  { id: "X1", name: "Follow-up", steps: [31], exit: "Referral or repeat engagement" },
];

export const CHANNELS = ["Referral / recommendation", "Hotline", "Walk-in", "Events", "Webinars", "Social media", "Website"];

export const DESTINATIONS = ["Australia", "United Kingdom", "Canada", "New Zealand", "Ireland", "Hungary", "Malaysia", "United States", "Germany", "Netherlands", "Singapore", "Other"];

export const QUALIFICATIONS = [
  "A/L National", "A/L Edexcel", "A/L Cambridge",
  "O/L National", "O/L Edexcel", "O/L Cambridge",
  "Foundation", "Diploma", "OSSD", "Bachelors", "Masters",
];

export const EXIT_CODES = [
  "Financial requirement not met",
  "Not interested after gap advice",
  "Applied through another agent",
  "Fraudulent documents",
  "Visa refused, not re-applying",
  "Scholarship or place obtained elsewhere",
  "Withdrawn after deposit",
  "Unresponsive",
  "Other",
];

const ALT_ROUTES = ["Build profile and re-assess", "Alternate course", "Lyceum Campus referral", "ECU partner pathway referral", "Master's after UG completion in Sri Lanka"];

export const STEPS: StepDef[] = [
  {
    n: 1, stage: "S1", title: "Incoming enquiry", studentTitle: "Enquiry received", owner: "Counsellor / front desk",
    fields: [
      { id: "source", label: "Enquiry source", type: "select", options: CHANNELS, required: true },
      { id: "enquiryDate", label: "Enquiry date", type: "date", required: true },
      { id: "interestedArea", label: "Interested area of study", type: "text" },
      { id: "preferredDestination", label: "Preferred destination", type: "select", options: DESTINATIONS },
      { id: "note", label: "Enquiry note", type: "textarea", full: true },
    ],
  },
  {
    n: 2, stage: "S2", title: "Assess student profile", studentTitle: "Profile", owner: "Counsellor", studentAction: true,
    fields: [
      { id: "fullName", label: "Full name (as per passport)", type: "text", required: true, studentEditable: true },
      { id: "dob", label: "Date of birth", type: "date", required: true, studentEditable: true },
      { id: "maritalStatus", label: "Marital status", type: "select", options: ["Never married", "Married", "Divorced", "Widowed"], required: true, studentEditable: true, sensitive: true },
      { id: "marriageDuration", label: "Duration of marriage", type: "text", showIf: { field: "maritalStatus", equals: "Married" }, studentEditable: true, sensitive: true },
      { id: "dependants", label: "Dependent children (number and ages)", type: "text", studentEditable: true, sensitive: true },
      { id: "school", label: "School", type: "text", required: true, studentEditable: true },
      { id: "lastQualification", label: "Last education qualification", type: "select", options: QUALIFICATIONS, required: true, studentEditable: true },
      { id: "subjects", label: "Subjects", type: "text", studentEditable: true },
      { id: "results", label: "Results / GPA", type: "text", required: true, studentEditable: true },
      { id: "employmentStatus", label: "Employment status", type: "select", options: ["Student", "Employed", "Self-employed", "Unemployed"], studentEditable: true },
      { id: "interestedArea", label: "Interested area of study", type: "text", required: true, studentEditable: true },
      { id: "destinations", label: "Destinations of interest", type: "multiselect", options: DESTINATIONS, required: true, studentEditable: true },
      { id: "priorRefusal", label: "Prior visa refusals", type: "yesno", required: true, studentEditable: true },
      { id: "priorRefusalDetail", label: "Refusal details", type: "textarea", showIf: { field: "priorRefusal", equals: "Yes" }, studentEditable: true, full: true },
      { id: "disability", label: "Disability or health condition requiring support", type: "yesno", required: true, studentEditable: true, sensitive: true },
      { id: "sponsorBackground", label: "Sponsor background", type: "textarea", required: true, studentEditable: true, sensitive: true, full: true },
      { id: "englishTest", label: "English proficiency test taken", type: "yesno", required: true, studentEditable: true },
      { id: "testType", label: "Test", type: "select", options: ["IELTS", "PTE", "TOEFL", "Duolingo", "OET", "Other"], showIf: { field: "englishTest", equals: "Yes" }, studentEditable: true },
      { id: "testDate", label: "Test date", type: "date", showIf: { field: "englishTest", equals: "Yes" }, studentEditable: true },
      { id: "testRef", label: "Test reference number", type: "text", showIf: { field: "englishTest", equals: "Yes" }, studentEditable: true },
      { id: "testOverall", label: "Overall score", type: "text", showIf: { field: "englishTest", equals: "Yes" }, studentEditable: true },
      { id: "testBands", label: "Band scores (L / R / W / S)", type: "text", showIf: { field: "englishTest", equals: "Yes" }, studentEditable: true },
      { id: "testVerified", label: "Test result verified", type: "yesno", showIf: { field: "englishTest", equals: "Yes" } },
      { id: "consent", label: "Data processing consent recorded", type: "yesno", required: true, studentEditable: true, hint: "Required before the profile is processed. Covers personal, family, financial and health data supplied to Lyceum Placements." },
      { id: "consentDate", label: "Consent date", type: "date", required: true, studentEditable: true, showIf: { field: "consent", equals: "Yes" } },
    ],
  },
  {
    n: 3, stage: "S2", title: "Profile complete?", studentTitle: "Profile confirmed", owner: "Counsellor", decision: true,
    fields: [
      { id: "outcome", label: "Outcome", type: "select", options: ["Profile complete — proceed", "Profile incomplete — alternative route"], required: true },
      { id: "altRoute", label: "Alternative route", type: "select", options: ALT_ROUTES, showIf: { field: "outcome", equals: "Profile incomplete — alternative route" }, required: true },
      { id: "recommendation", label: "Recommendation to student", type: "textarea", showIf: { field: "outcome", equals: "Profile incomplete — alternative route" }, full: true },
      { id: "interest", label: "Student response", type: "select", options: ["Interested — follow up and develop profile", "Not interested — exit"], showIf: { field: "outcome", equals: "Profile incomplete — alternative route" }, required: true },
    ],
  },
  {
    n: 4, stage: "S3", title: "Develop and send Course Information Sheet", studentTitle: "Course Information Sheet sent", owner: "Counsellor", sla: "Within 7 days of profile confirmation",
    fields: [
      { id: "cisSentDate", label: "CIS sent date", type: "date", required: true },
      { id: "destinationsCovered", label: "Destinations covered", type: "multiselect", options: DESTINATIONS, required: true },
      { id: "programmesCovered", label: "Programmes covered", type: "textarea", full: true },
    ],
  },
  {
    n: 5, stage: "S3", title: "Additional programme recommendations", studentTitle: "Additional options provided", owner: "Counsellor", optional: true, sla: "Within 7 days of request",
    fields: [
      { id: "requestedDate", label: "Additional options requested on", type: "date", required: true },
      { id: "cisSentDate", label: "Additional CIS sent date", type: "date", required: true },
      { id: "detail", label: "Options provided", type: "textarea", full: true },
    ],
  },
  {
    n: 6, stage: "S3", title: "Programme and destination selected", studentTitle: "Programme and destination selected", owner: "Counsellor",
    fields: [
      { id: "countries", label: "Countries", type: "multiselect", options: DESTINATIONS, required: true },
      { id: "programmes", label: "Programmes", type: "textarea", required: true, full: true },
    ],
  },
  {
    n: 7, stage: "S4", title: "Visa process information", studentTitle: "Visa route and costs explained", owner: "Counsellor",
    fields: [
      { id: "financialRequirements", label: "Financial requirements explained", type: "textarea", required: true, full: true },
      { id: "financialBackground", label: "Client financial background", type: "textarea", required: true, full: true, sensitive: true },
      { id: "fundingSource", label: "Primary funding source", type: "select", options: ["Own funds", "Parent / sponsor funds", "Co-sponsor", "Education loan", "Third-party funds", "Mixed"], required: true, sensitive: true },
    ],
  },
  {
    n: 8, stage: "S4", title: "Financial analysis", studentTitle: "Funding assessed", owner: "Counsellor", decision: true,
    fields: [
      { id: "outcome", label: "Outcome", type: "select", options: ["Meets requirements", "Does not meet — exit", "Does not meet — alternative route", "Does not meet — hold and build"], required: true },
      { id: "explanation", label: "Detailed explanation", type: "textarea", showIf: { field: "outcome", equals: "Does not meet — exit" }, required: true, full: true },
      { id: "altCountry", label: "Country", type: "select", options: DESTINATIONS, showIf: { field: "outcome", equals: "Does not meet — alternative route" }, required: true },
      { id: "altIntake", label: "Intake", type: "month", showIf: { field: "outcome", equals: "Does not meet — alternative route" }, required: true },
      { id: "altProgramme", label: "Programme", type: "text", showIf: { field: "outcome", equals: "Does not meet — alternative route" }, required: true },
      { id: "holdCountry", label: "Country", type: "select", options: DESTINATIONS, showIf: { field: "outcome", equals: "Does not meet — hold and build" }, required: true },
      { id: "holdIntake", label: "Target intake", type: "month", showIf: { field: "outcome", equals: "Does not meet — hold and build" }, required: true },
      { id: "holdProgramme", label: "Programme", type: "text", showIf: { field: "outcome", equals: "Does not meet — hold and build" }, required: true },
      { id: "holdReviewDate", label: "Review date", type: "date", showIf: { field: "outcome", equals: "Does not meet — hold and build" }, required: true, hint: "Funds are typically seasoned 6 to 12 months." },
    ],
  },
  {
    n: 9, stage: "S5", title: "Provide document checklist", studentTitle: "Checklists and agreement issued", owner: "Counsellor",
    fields: [
      { id: "issuedDate", label: "Issued date", type: "date", required: true },
      { id: "d_info", label: "LPL Information Sheet", type: "checkbox" },
      { id: "d_uni", label: "University Document Checklist", type: "checkbox" },
      { id: "d_visa", label: "Visa Checklist", type: "checkbox" },
      { id: "d_sponsor", label: "Sample Sponsorship Letter", type: "checkbox" },
      { id: "d_gs", label: "GS Guideline", type: "checkbox" },
      { id: "d_tc", label: "Lyceum Placements Agreement — Terms and Conditions", type: "checkbox" },
      { id: "d_nda", label: "Non-Disclosure Agreement (if required)", type: "checkbox" },
      { id: "d_u18", label: "Under-18 documentation (if applicable)", type: "checkbox" },
      { id: "d_platform", label: "Platform Declaration Form (if applicable)", type: "checkbox" },
    ],
  },
  {
    n: 10, stage: "S5", title: "Document upload and review", studentTitle: "Upload your application documents", owner: "Student / parent", studentAction: true,
    docs: [
      { id: "passport", label: "Passport (photo page)", required: true },
      { id: "certificates", label: "Academic certificates", required: true },
      { id: "transcripts", label: "Academic transcripts", required: true },
      { id: "english", label: "English proficiency test report", hint: "Where a test has been taken" },
      { id: "photo", label: "Passport photograph", required: true },
      { id: "agreement", label: "Signed Lyceum Placements Agreement", required: true },
      { id: "u18", label: "Under-18 documentation", hint: "If applicable" },
      { id: "platform", label: "Platform Declaration Form", hint: "If applicable" },
    ],
    fields: [
      { id: "reviewNote", label: "Review note", type: "textarea", full: true },
    ],
  },
  {
    n: 11, stage: "S5", title: "Submit applications", studentTitle: "Applications submitted", owner: "Counsellor",
    fields: [
      { id: "tcSigned", label: "Lyceum Placements Agreement signed", type: "yesno", required: true },
      { id: "tcSignedDate", label: "Signature date", type: "date", showIf: { field: "tcSigned", equals: "Yes" }, required: true },
      { id: "tcVersion", label: "Agreement version", type: "text", showIf: { field: "tcSigned", equals: "Yes" }, required: true },
      { id: "route", label: "Submission route", type: "select", options: ["Direct", "Platform", "Partner agent"], required: true },
      { id: "platform", label: "Platform", type: "select", options: ["KC", "Adventus", "ApplyBoard"], showIf: { field: "route", equals: "Platform" }, required: true },
      { id: "agentName", label: "Partner agent", type: "text", showIf: { field: "route", equals: "Partner agent" }, required: true },
      { id: "agentApproved", label: "Agent on approved list", type: "yesno", showIf: { field: "route", equals: "Partner agent" }, required: true },
      { id: "country", label: "Country", type: "select", options: DESTINATIONS, required: true },
      { id: "universities", label: "Universities", type: "textarea", required: true, full: true },
      { id: "programmes", label: "Programmes", type: "textarea", required: true, full: true },
      { id: "intake", label: "Intake", type: "month", required: true },
      { id: "passportNumber", label: "Passport number", type: "text", required: true, sensitive: true },
      { id: "submittedDate", label: "Submitted date", type: "date", required: true },
      { id: "transferLogged", label: "Cross-border transfer logged", type: "yesno", required: true, hint: "Identity and education data leaves Sri Lanka at this step." },
    ],
  },
  {
    n: 12, stage: "S5", title: "Additional information to university", studentTitle: "Additional information supplied", owner: "Counsellor", optional: true,
    fields: [
      { id: "detail", label: "Information supplied", type: "textarea", required: true, full: true },
      { id: "sentDate", label: "Sent date", type: "date", required: true },
    ],
  },
  {
    n: 13, stage: "S6", title: "Receive offers", studentTitle: "Offers received", owner: "University", sla: "Three reminders from 21 days before the lapse date",
    fields: [
      { id: "conditionalDate", label: "Conditional offer received", type: "date" },
      { id: "conditions", label: "Conditions", type: "textarea", full: true },
      { id: "gsRequired", label: "GS clearance required before unconditional offer", type: "yesno" },
      { id: "unconditionalDate", label: "Unconditional offer received", type: "date" },
      { id: "offerLapseDate", label: "Offer lapse date", type: "date", required: true },
      { id: "commencementDate", label: "Commencement date", type: "date", required: true },
      { id: "orientationDate", label: "Orientation date", type: "date" },
    ],
  },
  {
    n: 14, stage: "S6", title: "Finalise destination and offer", studentTitle: "Offer chosen", owner: "Counsellor",
    fields: [
      { id: "country", label: "Country", type: "select", options: DESTINATIONS, required: true },
      { id: "university", label: "University", type: "text", required: true },
      { id: "programme", label: "Programme", type: "text", required: true },
      { id: "acceptedDate", label: "Decision date", type: "date", required: true },
    ],
  },
  {
    n: 15, stage: "S7", title: "Visa file preparation", studentTitle: "Upload your visa documents", owner: "Student / parent", studentAction: true, unlockAfter: [13],
    docs: [
      { id: "bank", label: "Bank statements / proof of funds", hint: "Six to twelve months", required: true },
      { id: "sponsorLetter", label: "Sponsorship letter", required: true },
      { id: "sponsorId", label: "Sponsor identity document", required: true },
      { id: "income", label: "Employment and income evidence", required: true },
      { id: "gs", label: "Genuine Student statement", hint: "Australia" },
      { id: "medical", label: "Medical examination report", hint: "Where applicable" },
      { id: "u18", label: "Under-18 guardianship and welfare forms", hint: "If applicable" },
    ],
    fields: [{ id: "reviewNote", label: "Review note", type: "textarea", full: true }],
  },
  {
    n: 16, stage: "S7", title: "Verify financials for acceptance", studentTitle: "Financial documents under review", owner: "Team Leader", gate: 16, unlockAfter: [14, 15],
    fields: [
      { id: "summary", label: "Financial verification summary", type: "textarea", required: true, full: true, sensitive: true },
      { id: "depositInformedDate", label: "Parent informed of deposit payment", type: "date" },
    ],
  },
  {
    n: 17, stage: "S7", title: "Generate invoice", studentTitle: "Deposit invoice issued", owner: "Finance",
    fields: [
      { id: "invoiceNumber", label: "Invoice number", type: "text", required: true },
      { id: "invoiceDate", label: "Invoice date", type: "date", required: true },
      { id: "amount", label: "Amount", type: "text", required: true },
      { id: "currency", label: "Currency", type: "select", options: ["LKR", "AUD", "GBP", "CAD", "NZD", "EUR", "USD", "MYR"], required: true },
      { id: "proofReceived", label: "Proof of payment received", type: "yesno", required: true },
      { id: "proofDate", label: "Proof received date", type: "date", showIf: { field: "proofReceived", equals: "Yes" } },
    ],
  },
  {
    n: 18, stage: "S7", title: "Share acceptance with university", studentTitle: "Acceptance sent to university", owner: "Counsellor",
    fields: [
      { id: "sentDate", label: "Sent date", type: "date", required: true },
      { id: "acceptanceForm", label: "Acceptance form", type: "checkbox" },
      { id: "proofOfPayment", label: "Proof of payment", type: "checkbox" },
      { id: "passportCopy", label: "Current passport", type: "checkbox" },
    ],
  },
  {
    n: 19, stage: "S8", title: "Finalise visa file", studentTitle: "Visa file in final review", owner: "Team Leader", gate: 19, unlockAfter: [16],
    fields: [{ id: "summary", label: "File completeness summary", type: "textarea", required: true, full: true }],
  },
  {
    n: 20, stage: "S9", title: "Share accommodation options", studentTitle: "Accommodation options shared", owner: "Counsellor", unlockAfter: [14],
    fields: [
      { id: "sharedDate", label: "Shared date", type: "date", required: true },
      { id: "options", label: "Options shared", type: "textarea", full: true },
    ],
  },
  {
    n: 21, stage: "S7", title: "Enrolment confirmation issued", studentTitle: "Enrolment confirmation issued", owner: "University", unlockAfter: [18],
    fields: [
      { id: "docType", label: "Document", type: "select", options: ["CoE", "CAS", "LoA", "eVAL", "Other"], required: true },
      { id: "reference", label: "Reference", type: "text", required: true },
      { id: "receivedDate", label: "Received date", type: "date", required: true },
    ],
  },
  {
    n: 22, stage: "S8", title: "Visa application draft", studentTitle: "Review your visa application draft", owner: "Counsellor", unlockAfter: [19, 21],
    fields: [
      { id: "draftSentDate", label: "Draft sent to student", type: "date", required: true },
      { id: "amendments", label: "Amendments recorded", type: "textarea", full: true },
    ],
  },
  {
    n: 23, stage: "S8", title: "Visa submission", studentTitle: "Visa application lodged", owner: "Counsellor",
    fields: [
      { id: "mode", label: "Lodgement mode", type: "select", options: ["Online", "Paper", "University-initiated"], required: true },
      { id: "submittedDate", label: "Submitted date", type: "date", required: true },
      { id: "feeMode", label: "Fee paid", type: "select", options: ["Online", "In person", "Not applicable"], required: true },
      { id: "reference", label: "Application reference", type: "text" },
    ],
  },
  {
    n: 24, stage: "S8", title: "Medicals", studentTitle: "Medical examination", owner: "Student / parent", optional: true, unlockAfter: [22],
    fields: [
      { id: "appointmentDate", label: "Appointment date", type: "date", required: true },
      { id: "timing", label: "Timing", type: "select", options: ["Before submission", "After submission"], required: true },
      { id: "physician", label: "Panel physician", type: "text" },
    ],
  },
  {
    n: 25, stage: "S8", title: "Biometrics", studentTitle: "Biometrics appointment", owner: "Student / parent", optional: true, unlockAfter: [22],
    fields: [
      { id: "vfsDate", label: "VFS appointment date", type: "date", required: true },
      { id: "location", label: "Location", type: "text" },
    ],
  },
  {
    n: 26, stage: "S9", title: "Unit enrolment", studentTitle: "Enrol for your units", owner: "Student / parent", studentAction: true, unlockAfter: [21],
    fields: [
      { id: "enrolledDate", label: "Enrolled date", type: "date", required: true, studentEditable: true },
      { id: "note", label: "Units enrolled", type: "textarea", full: true, studentEditable: true },
    ],
  },
  {
    n: 27, stage: "S8", title: "Visa outcome", studentTitle: "Visa decision", owner: "University", decision: true, unlockAfter: [23],
    fields: [
      { id: "outcome", label: "Outcome", type: "select", options: ["Granted", "Refused"], required: true },
      { id: "decisionDate", label: "Decision date", type: "date", required: true },
      { id: "remedy", label: "Remedy", type: "select", options: ["Approach university regarding re-application", "Appeal or reapply within the stipulated window", "No further action — exit"], showIf: { field: "outcome", equals: "Refused" }, required: true },
      { id: "refusalGrounds", label: "Refusal grounds", type: "textarea", showIf: { field: "outcome", equals: "Refused" }, full: true },
    ],
  },
  {
    n: 28, stage: "S9", title: "Visa and ticketing", studentTitle: "Ticketing and travel", owner: "Counsellor", unlockAfter: [27],
    fields: [
      { id: "jbdSharedDate", label: "Journey By Design details shared", type: "date", required: true },
      { id: "parentVisitVisa", label: "Parent visit visa required", type: "yesno" },
      { id: "travelDate", label: "Travel date", type: "date" },
    ],
  },
  {
    n: 29, stage: "S9", title: "Confirm accommodation", studentTitle: "Confirm your accommodation", owner: "Student / parent", studentAction: true, unlockAfter: [20],
    fields: [
      { id: "confirmedDate", label: "Confirmed date", type: "date", required: true, studentEditable: true },
      { id: "detail", label: "Accommodation confirmed", type: "textarea", required: true, full: true, studentEditable: true },
    ],
  },
  {
    n: 30, stage: "S9", title: "Pre-departure briefing", studentTitle: "Pre-departure briefing", owner: "Counsellor", unlockAfter: [28],
    fields: [
      { id: "briefingDate", label: "Briefing date", type: "date", required: true },
      { id: "reviewLinksSent", label: "Review links sent", type: "yesno" },
      { id: "testimonial", label: "Video testimonial agreed", type: "yesno" },
      { id: "testimonialDate", label: "Testimonial date", type: "date", showIf: { field: "testimonial", equals: "Yes" } },
      { id: "arrivalDate", label: "Arrival date", type: "date", required: true },
    ],
  },
  {
    n: 31, stage: "X1", title: "Three-month follow-up", studentTitle: "Three-month check-in", owner: "Counsellor", unlockAfter: [30], sla: "Three months after arrival",
    fields: [
      { id: "contactedDate", label: "Contacted date", type: "date", required: true },
      { id: "feedback", label: "Feedback on the university", type: "textarea", full: true },
      { id: "referral", label: "Referral or repeat engagement", type: "select", options: ["None", "Sibling", "Master's study", "Referred a known party"] },
    ],
  },
];

export const STEP_BY_N: Record<number, StepDef> = Object.fromEntries(STEPS.map((s) => [s.n, s]));
export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export function stageOfStep(n: number): StageDef {
  return STAGE_BY_ID[STEP_BY_N[n].stage];
}

export const ORDERED_STEP_NUMBERS: number[] = STAGES.flatMap((s) => s.steps);

// ---------------------------------------------------------------------------
// Pipeline: the nine major stages users see
// ---------------------------------------------------------------------------

/**
 * The 31 steps are the system of record, but nobody works with 31 items on screen. The
 * pipeline groups them into the nine historical stages of process document
 * LGH/IMS/PROC/LPL/001 §5. The cross-cutting follow-up (X1, step 31) is presented inside
 * the ninth stage so the journey ends where the student does — on campus and settled.
 */
export interface PipelineStage {
  /** 1-based position in the pipeline. */
  n: number;
  id: string;
  name: string;
  /** Student-facing wording. */
  studentName: string;
  summary: string;
  /** The stage ids from STAGES that this pipeline stage presents. */
  stageIds: string[];
  steps: number[];
  exit: string;
}

const P = (n: number, id: string, name: string, studentName: string, summary: string, stageIds: string[], exit: string): PipelineStage => ({
  n, id, name, studentName, summary, stageIds, exit,
  steps: stageIds.flatMap((s) => STAGE_BY_ID[s].steps),
});

export const PIPELINE: PipelineStage[] = [
  P(1, "P1", "Capture", "Enquiry", "Enquiry received and the case opened.", ["S1"], "Case created and owner assigned"),
  P(2, "P2", "Qualify and profile", "Your profile", "Academic, family, sponsor and English test details assessed.", ["S2"], "Profile complete or alternative route chosen"),
  P(3, "P3", "Match", "Programme match", "Course Information Sheets and the final programme and destination.", ["S3"], "Programme and destination fixed"),
  P(4, "P4", "Feasibility gate", "Funding check", "Visa route explained and the financial position analysed.", ["S4"], "Financial route validated"),
  P(5, "P5", "Apply", "Applications", "Checklists issued, documents collected and applications lodged.", ["S5"], "Applications lodged"),
  P(6, "P6", "Offer management", "Offers", "Offers received and the firm choice recorded.", ["S6"], "Firm choice against an offer"),
  P(7, "P7", "Accept and pay", "Acceptance", "Visa file prepared, financials verified by the Team Leader, deposit paid, enrolment confirmed.", ["S7"], "Enrolment confirmation received"),
  P(8, "P8", "Visa", "Visa", "Visa file finalised by the Team Leader, application lodged, medicals, biometrics and the decision.", ["S8"], "Visa decision issued"),
  P(9, "P9", "Depart and arrive", "Departure and arrival", "Accommodation, unit enrolment, ticketing, pre-departure briefing and the three-month follow-up.", ["S9", "X1"], "Student on campus and settled"),
];

/** Pipeline stage that presents the given process step. */
export function pipelineOfStep(n: number): PipelineStage {
  const sid = STEP_BY_N[n].stage;
  return PIPELINE.find((p) => p.stageIds.includes(sid)) ?? PIPELINE[PIPELINE.length - 1];
}


// ---------------------------------------------------------------------------
// Data protection reference tables
// Process document LGH/IMS/PROC/LPL/001 §10 absences 2 and 3.
// ---------------------------------------------------------------------------

/** Categories used on transfer records and on the disposal notice. */
export const DATA_CATEGORIES = [
  "Identity",
  "Contact",
  "Education",
  "Passport and travel",
  "Financial",
  "Family and marital",
  "Health",
  "Immigration history",
];

/**
 * Field ids preserved when a case is disposed of. Anything absent from this set is
 * destroyed, so the default for a new field is destruction rather than retention.
 * The survivors are outcomes, dates, destinations and institution names — enough to
 * keep conversion, SLA and refusal analytics honest with no data subject behind them.
 */
export const RETAINED_FIELDS = new Set<string>([
  "source", "enquiryDate", "interestedArea", "preferredDestination", "destinations", "countries",
  "country", "altCountry", "holdCountry", "destinationsCovered",
  "programme", "programmes", "programmesCovered", "altProgramme", "holdProgramme",
  "university", "universities", "platform", "route", "agentApproved", "docType",
  "lastQualification", "employmentStatus", "englishTest", "testType", "testVerified",
  "fundingSource", "priorRefusal", "gsRequired", "timing", "mode", "feeMode", "currency",
  "outcome", "altRoute", "interest", "remedy", "referral",
  "intake", "altIntake", "holdIntake", "holdReviewDate",
  "consent", "consentDate", "tcSigned", "tcSignedDate", "tcVersion", "transferLogged",
  "proofReceived", "reviewLinksSent", "testimonial", "parentVisitVisa",
  "acceptanceForm", "proofOfPayment", "passportCopy",
  "cisSentDate", "requestedDate", "sentDate", "submittedDate", "receivedDate", "issuedDate",
  "conditionalDate", "unconditionalDate", "offerLapseDate", "commencementDate", "orientationDate",
  "decisionDate", "acceptedDate", "appointmentDate", "vfsDate", "draftSentDate", "enrolledDate",
  "invoiceDate", "proofDate", "travelDate", "arrivalDate", "briefingDate", "confirmedDate",
  "contactedDate", "depositInformedDate", "jbdSharedDate", "sharedDate", "testimonialDate",
]);

export const LAWFUL_BASES = [
  "Contract with the data subject",
  "Consent of the data subject",
  "Legitimate interest",
  "Legal obligation",
];

export const SAFEGUARDS = [
  "Processor agreement",
  "Data processing addendum",
  "Standard contractual clauses",
  "Consent of the data subject",
  "None recorded",
];

/** Jurisdiction each named platform processes in, so the register does not depend on recall. */
export const PLATFORM_COUNTRY: Record<string, string> = {
  KC: "United Kingdom",
  Adventus: "Singapore",
  ApplyBoard: "Canada",
};

/**
 * Steps at which personal data leaves Sri Lanka. Step 11 is the one the process
 * document names (§10.3); 18 and 23 are the same disclosure to different recipients
 * and are logged on the same terms.
 */
export const TRANSFER_STEPS: Record<number, { categories: string[]; basis: string }> = {
  11: {
    categories: ["Identity", "Contact", "Education", "Passport and travel"],
    basis: "Contract with the data subject",
  },
  18: {
    categories: ["Identity", "Passport and travel", "Financial"],
    basis: "Contract with the data subject",
  },
  23: {
    categories: ["Identity", "Contact", "Education", "Passport and travel", "Financial", "Family and marital", "Health", "Immigration history"],
    basis: "Legal obligation",
  },
};
