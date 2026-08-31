export interface DisplayColumn {
  key: string;
  label: string;
}

export interface NormalizedMasterRow {
  businessKey: string;
  label: string;
  active: boolean | null;
  payload: Record<string, string | number | boolean | null>;
}

export interface MasterDatasetDefinition {
  type: string;
  label: string;
  description: string;
  sourceFileHint: string;
  privacy: "internal" | "restricted";
  requiredHeaders: readonly string[];
  expectedHeaders?: readonly string[];
  ignoredHeaders?: readonly string[];
  displayColumns: readonly DisplayColumn[];
  normalize: (row: Record<string, string>, rowNumber: number) => NormalizedMasterRow;
}

function clean(value: string | undefined) {
  return (value ?? "").trim();
}
function required(row: Record<string, string>, header: string, rowNumber: number) {
  const value = clean(row[header]);
  if (!value) throw new Error(`Row ${rowNumber}: ${header} is required`);
  return value;
}
function key(...values: Array<string | number | null>) {
  return values.map((value) => String(value ?? "").trim().toLowerCase()).join("::");
}
function bool(value: string | undefined, label: string, rowNumber: number) {
  const normalized = clean(value).toLowerCase();
  if (["yes", "true", "active", "1", "enabled"].includes(normalized)) return true;
  if (["no", "false", "inactive", "0", "disabled"].includes(normalized)) return false;
  throw new Error(`Row ${rowNumber}: ${label} must be Yes/No, true/false, or Active/Inactive`);
}
function nullableBool(value: string | undefined, label: string, rowNumber: number) {
  return clean(value) ? bool(value, label, rowNumber) : null;
}
function numberValue(value: string | undefined, label: string, rowNumber: number, nullable = false) {
  const raw = clean(value).replace(/,/g, "");
  if (!raw && nullable) return null;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) throw new Error(`Row ${rowNumber}: ${label} must be numeric`);
  return parsed;
}
function payloadSearch(row: Record<string, string | number | boolean | null>) {
  return Object.values(row).filter((value) => value !== null && value !== "").join(" ");
}
export function searchText(normalized: NormalizedMasterRow) {
  return `${normalized.businessKey} ${normalized.label} ${payloadSearch(normalized.payload)}`.slice(0, 20_000);
}
function mapPayload(row: Record<string, string>, mapping: Record<string, string>) {
  return Object.fromEntries(Object.entries(mapping).map(([header, field]) => [field, clean(row[header]) || null])) as Record<string, string | null>;
}

const chargeHeaders = ["Charge Code", "Charge Description", "Charge Stage", "Charge Nature", "Active", "Created Date", "Modified Date"] as const;
const deliverableSettingHeaders = ["Id", "Deliverable Type", "Product", "Is Enabled"] as const;
const insuranceTypeHeaders = ["Insurance Type", "Code", "Description", "Nominee Required", "Computed On", "Status", "Created Date", "Modified Date"] as const;
const visitHeaders = ["Visit Code", "Visit Label", "Workflow Status Code", "Photo Required", "Enable Photo Capturing", "Video Required", "Enable Video Capturing", "Created Date", "Modified Date"] as const;
const insuranceProviderHeaders = ["Insurance Company", "Code", "Insurance Type", "Stage", "Status", "Created Date", "Modified Date"] as const;
const leadChannelHeaders = ["Channel Code", "Channel Name", "Is Dropdown", "Is Active", "Is Branch Mapping Enable", "Vendor Type"] as const;
const lmsDeliverableHeaders = ["Id", "Deliverable Name", "Deliverable Label"] as const;
const rateHeaders = ["Insurance Type", "Insurance Provider", "Age", "Tenure", "Rate"] as const;
const repaymentHeaders = ["Scheme Code", "Scheme Name", "From Date", "To Date", "Add Value", "Type", "Day Logic", "Day Value", "Month Logic", "Month Value", "Year Logic", "Year Value", "Created Date", "Modified Date", "Created By", "Modified By"] as const;
const sanctionHeaders = ["Condition Code", "Condition Name", "Type", "Sub Type", "TAT (hr)", "Schemes", "Scope", "Re-sanction", "Active", "Created Date", "Modified Date"] as const;
const branchSchemeHeaders = ["Branch Code", "Branch Name", "Scheme Code", "Scheme Name", "Is Active"] as const;
const quickLinkHeaders = ["Quick Link Name", "Quick Link", "Description", "Is Active", "Created Date", "Modified Date"] as const;
const knockoffHeaders = ["SN", "Scheme Code", "Charge Knockoff Policies", "Created Date", "Created By", "Modified Date", "Modified By"] as const;
const propertyHeaders = ["State Code", "State Name", "Property Title", "Registration Status", "Supplementary Documents", "Last Title Document", "Is Active", "Created Date", "Modified Date"] as const;

const staffRequiredHeaders = ["id", "employeeName", "email", "employeeUserName", "employeeCode", "joiningDate", "active"] as const;
const staffIgnoredHeaders = ["alternateMobileNumber", "address", "createdBy", "deactivatedBy", "modifiedBy", "categoryCode"] as const;

const collectionAllowedHeaders = [
  "Source Application Number", "Loan Account Number", "Loan Id", "Global Cust Id", "Product Code", "Product Name", "Scheme Code", "Scheme Name", "Marking", "Dealer Code", "Dealer Name", "Collateral Type", "Model Name", "Model Year", "Registration", "Make", "Engine No", "Chasis No", "Asset Cost", "Repayment Start Date", "Maturity Date", "Sanction Date", "Sanctioned Amount", "Disbursal Date", "Disbursal Month", "Loan Amount Group", "Disbursed Amount", "Total Interest Amount", "Adjusted Amount", "Net Disbursed Amount", "Disbursal During Month", "Part Payment", "Disbursal Status", "Original Tenure", "Current Tenure", "Tenor Group", "Tenor Completed Flag", "Interest Rate", "Roi Group", "Irr", "Irr Group", "Customer Irr", "Ltv", "Ltv Group", "Installment Frequency", "Repayment Mode", "Restructure", "Sourcing Rm Id", "Branch Name", "Branch State", "Branch Zone", "Loan Status", "Seizure Date", "Seizure Status", "Total Pending Installments", "Total Billed Installments", "Total Paid Installments", "Number Of Bounce Count Against Installments", "Total Overdue Installments", "Installment Amount", "Opening Receivable", "Opening Received", "Opening Overdue", "Opening Principal Overdue", "Opening Interest Overdue", "Opening Future Principal", "Opening Future Interest", "Opening Pos", "Opening Dpd", "Opening Bucket", "Opening Dpd Wise", "Emi Due Date", "Emi Day", "Emi Month", "Emi Year", "Billed Installment Number", "Billed Installment Amount", "Billed Principal Amount", "Billed Interest Amount", "Emi Status", "Delay Days", "Current Month Emi Received Date", "Last Receipt Date", "Total Receipt Amount Via Cash", "Total Receipt Amount Other Than Cash", "Current Month Receipt Amount", "Total Knockoff Amount", "Principal Knockoff Amount", "Interest Knockoff Amount", "Total Collection", "Current Month Collection", "Current Month Principal Collection", "Current Month Interest Collection", "Overdue Collections", "Overdue Principal Collections", "Overdue Interest Collections", "Total Collection Percentage", "Current Month Collection Percentage", "Closing Receivable", "Closing Received Installment", "Closing Received Principal", "Closing Received Interest", "Closing Overdue", "Closing Principal Overdue", "Closing Interest Overdue", "Closing Future Principal", "Closing Future Interest", "Closing Pos", "Closing Excess", "Closing Dpd", "Closing Bucket", "Dpd Movement", "Closing Dpd Wise", "Closing Dpd Bucket Wise", "Unrelize Amount", "Bounce Charge Billed Amount", "Bounce Charge Received Amount", "Bounce Charge Overdue Amount", "Lpp Charge Billed Amount", "Lpp Charge Received Amount", "Lpp Charge Overdue Amount", "Other Charges Billed Amount", "Other Charge Received Amount", "Other Charge Overdue Amount", "Total Charges And Emi Overdue", "Advance Emi", "Asset Classification", "Accounting Writeoff", "Customer Id", "Mob", "Mob Range",
] as const;
const collectionRequiredHeaders = ["Source Application Number", "Loan Account Number", "Loan Id", "Global Cust Id", "Scheme Code", "Loan Status", "Closing Overdue", "Closing Pos", "Closing Dpd", "Customer Id"] as const;
const collectionIgnoredHeaders = ["Customer Name", "Sourcing Rm Name", "Date Of Birth", "Gender", "Caste", "Cibil Score", "Cibil Group", "Pan Number", "Aadhar Number", "Voter Id Number", "Drivering License Number", "Mobile No", "Alternate Number", "Marital Status", "Father Name", "Mother Name", "Spouse Name", "Education Qualification", "Permanent Address", "Permanent Address District", "Permanent Address City", "Permanent Address State", "Permanent Address Pincode", "Current Address", "Current Address District", "Current Address City", "Current Address State", "Current Address Pincode", "Occupation Type", "Last Receipt Maker", "Last Receipt Bank", "Is Deceased"] as const;

function camel(header: string) {
  const parts = header.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  return parts.map((part, index) => index === 0 ? part.toLowerCase() : part[0]!.toUpperCase() + part.slice(1).toLowerCase()).join("");
}
function collectionScalar(header: string, value: string) {
  const raw = clean(value);
  if (!raw) return null;
  const identifier = /(application|account number|loan id|global cust|customer id|code|registration|engine|chasis|receipt number)/i.test(header);
  const metric = /(amount|cost|tenure|interest rate|\birr\b|\bltv\b|installment|receivable|received|overdue|principal|interest|collection|\bpos\b|\bdpd\b|bucket$|count|delay days|percentage|excess|model year|emi day|emi month|emi year|\bmob\b|writeoff|unrelize|advance emi)/i.test(header);
  if (!identifier && metric && /^-?\d+(?:\.\d+)?$/.test(raw.replace(/,/g, ""))) return Number(raw.replace(/,/g, ""));
  if (["Yes", "No"].includes(raw) && /(flag|restructure|part payment)/i.test(header)) return raw === "Yes";
  return raw;
}

export const masterDatasetDefinitions: Record<string, MasterDatasetDefinition> = {
  staff_directory: {
    type: "staff_directory", label: "Staff Directory", description: "Imported employee directory only. Records never create administrator accounts.", sourceFileHint: "users.csv", privacy: "restricted", requiredHeaders: staffRequiredHeaders, ignoredHeaders: staffIgnoredHeaders,
    displayColumns: [{ key: "employeeCode", label: "Employee Code" }, { key: "employeeName", label: "Employee" }, { key: "email", label: "Email" }, { key: "departmentCode", label: "Department" }, { key: "designationCode", label: "Designation" }, { key: "reportingBranchCode", label: "Branch" }, { key: "active", label: "Active" }],
    normalize(row, rowNumber) {
      const employeeCode = required(row, "employeeCode", rowNumber); const employeeName = required(row, "employeeName", rowNumber); const active = bool(row.active, "active", rowNumber);
      const payload = {
        sourceEmployeeId: required(row, "id", rowNumber), employeeName, email: clean(row.email) || null, mobileNumber: clean(row.mobileNumber) || null, city: clean(row.city) || null, state: clean(row.state) || null, joiningDate: required(row, "joiningDate", rowNumber), reportingManagerCode: clean(row.reportingManagerCode) || null, waiverUser: nullableBool(row.waiverUser, "waiverUser", rowNumber), sourcingRM: nullableBool(row.sourcingRM, "sourcingRM", rowNumber), employeeUserName: required(row, "employeeUserName", rowNumber), employeeCode, designationCode: clean(row.designationCode) || null, departmentCode: clean(row.departmentCode) || null, isCollectionAgencyUser: nullableBool(row.isCollectionAgencyUser, "isCollectionAgencyUser", rowNumber), collectionAgencyCode: clean(row.collectionAgencyCode) || null, reportingBranchCode: clean(row.reportingBranchCode) || null, legacyRoles: clean(row.roles) || null, lastLogin: clean(row.lastLogin) || null, lastLogout: clean(row.lastLogout) || null, active, createdDate: clean(row.createdDate) || null, deactivationTime: clean(row.deactivationTime) || null, modifiedDate: clean(row.modifiedDate) || null, enableLocationTracking: nullableBool(row.enableLocationTracking, "enableLocationTracking", rowNumber),
      };
      return { businessKey: key(employeeCode), label: `${employeeCode} · ${employeeName}`, active, payload };
    },
  },
  collection_mis: {
    type: "collection_mis", label: "Collection MIS", description: "Data-minimized loan, asset, repayment, collection, and delinquency snapshot. Identity documents, phones, personal names, and addresses are discarded.", sourceFileHint: "lms068_collection_mis_*.csv", privacy: "restricted", requiredHeaders: collectionRequiredHeaders, ignoredHeaders: collectionIgnoredHeaders,
    displayColumns: [{ key: "loanAccountNumber", label: "Loan Account" }, { key: "customerId", label: "Customer Ref" }, { key: "schemeCode", label: "Scheme" }, { key: "branchName", label: "Branch" }, { key: "loanStatus", label: "Loan Status" }, { key: "closingPos", label: "Closing POS" }, { key: "closingOverdue", label: "Closing Overdue" }, { key: "closingDpd", label: "DPD" }, { key: "closingBucket", label: "Bucket" }],
    normalize(row, rowNumber) {
      const loanAccountNumber = required(row, "Loan Account Number", rowNumber); const payload: Record<string, string | number | boolean | null> = {};
      for (const header of collectionAllowedHeaders) payload[camel(header)] = collectionScalar(header, row[header] ?? "");
      const loanStatus = required(row, "Loan Status", rowNumber);
      return { businessKey: key(loanAccountNumber), label: `${loanAccountNumber} · ${clean(row["Scheme Code"])}`, active: loanStatus.toLowerCase() === "active", payload };
    },
  },
  charge_master: {
    type: "charge_master", label: "Charge Master", description: "Charge codes, stages, natures, and activation state.", sourceFileHint: "charge-master.csv", privacy: "internal", requiredHeaders: chargeHeaders, expectedHeaders: chargeHeaders,
    displayColumns: [{ key: "chargeCode", label: "Code" }, { key: "chargeDescription", label: "Description" }, { key: "chargeStage", label: "Stage" }, { key: "chargeNature", label: "Nature" }, { key: "active", label: "Active" }],
    normalize(row, n) { const chargeCode = required(row, "Charge Code", n); const active = bool(row.Active, "Active", n); const payload = { ...mapPayload(row, { "Charge Code": "chargeCode", "Charge Description": "chargeDescription", "Charge Stage": "chargeStage", "Charge Nature": "chargeNature", "Created Date": "createdDate", "Modified Date": "modifiedDate" }), active }; return { businessKey: key(chargeCode), label: `${chargeCode} · ${required(row, "Charge Description", n)}`, active, payload }; },
  },
  deliverable_settings: {
    type: "deliverable_settings", label: "Deliverable Settings", description: "Product-level enablement for LMS deliverables.", sourceFileHint: "deliverable-setting-*.csv", privacy: "internal", requiredHeaders: deliverableSettingHeaders, expectedHeaders: deliverableSettingHeaders,
    displayColumns: [{ key: "id", label: "ID" }, { key: "deliverableType", label: "Deliverable Type" }, { key: "product", label: "Product" }, { key: "enabled", label: "Enabled" }],
    normalize(row, n) { const type = required(row, "Deliverable Type", n); const product = required(row, "Product", n); const enabled = bool(row["Is Enabled"], "Is Enabled", n); return { businessKey: key(type, product), label: type, active: enabled, payload: { id: required(row, "Id", n), deliverableType: type, product, enabled } }; },
  },
  insurance_types: {
    type: "insurance_types", label: "Insurance Types", description: "Insurance product definitions and nominee/computation rules.", sourceFileHint: "export (1).csv", privacy: "internal", requiredHeaders: insuranceTypeHeaders, expectedHeaders: insuranceTypeHeaders,
    displayColumns: [{ key: "code", label: "Code" }, { key: "insuranceType", label: "Insurance Type" }, { key: "nomineeRequired", label: "Nominee" }, { key: "computedOn", label: "Computed On" }, { key: "active", label: "Active" }],
    normalize(row, n) { const code = required(row, "Code", n); const active = bool(row.Status, "Status", n); const payload = { insuranceType: required(row, "Insurance Type", n), code, description: clean(row.Description) || null, nomineeRequired: bool(row["Nominee Required"], "Nominee Required", n), computedOn: required(row, "Computed On", n), active, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(code), label: `${code} · ${payload.insuranceType}`, active, payload }; },
  },
  field_visit_workflows: {
    type: "field_visit_workflows", label: "Field Visit Workflows", description: "Photo/video requirements by workflow status.", sourceFileHint: "export (2).csv", privacy: "internal", requiredHeaders: visitHeaders, expectedHeaders: visitHeaders,
    displayColumns: [{ key: "visitCode", label: "Visit Code" }, { key: "workflowStatusCode", label: "Workflow Status" }, { key: "photoRequired", label: "Photo Required" }, { key: "videoRequired", label: "Video Required" }],
    normalize(row, n) { const visitCode = required(row, "Visit Code", n); const workflowStatusCode = required(row, "Workflow Status Code", n); const payload = { visitCode, visitLabel: required(row, "Visit Label", n), workflowStatusCode, photoRequired: bool(row["Photo Required"], "Photo Required", n), enablePhotoCapturing: bool(row["Enable Photo Capturing"], "Enable Photo Capturing", n), videoRequired: bool(row["Video Required"], "Video Required", n), enableVideoCapturing: bool(row["Enable Video Capturing"], "Enable Video Capturing", n), createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(visitCode, workflowStatusCode), label: `${visitCode} · ${workflowStatusCode}`, active: true, payload }; },
  },
  insurance_providers: {
    type: "insurance_providers", label: "Insurance Providers", description: "Insurance provider, type, stage, and status mappings.", sourceFileHint: "export.csv", privacy: "internal", requiredHeaders: insuranceProviderHeaders, expectedHeaders: insuranceProviderHeaders,
    displayColumns: [{ key: "code", label: "Code" }, { key: "insuranceCompany", label: "Company" }, { key: "insuranceType", label: "Type" }, { key: "stage", label: "Stage" }, { key: "active", label: "Active" }],
    normalize(row, n) { const code = required(row, "Code", n); const active = bool(row.Status, "Status", n); const payload = { insuranceCompany: required(row, "Insurance Company", n), code, insuranceType: required(row, "Insurance Type", n), stage: required(row, "Stage", n), active, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(code), label: `${code} · ${payload.insuranceCompany}`, active, payload }; },
  },
  lead_channels: {
    type: "lead_channels", label: "Lead Channels", description: "Lead-source behavior, vendor type, and branch mapping controls.", sourceFileHint: "lead-channel-module-*.csv", privacy: "internal", requiredHeaders: leadChannelHeaders, expectedHeaders: leadChannelHeaders,
    displayColumns: [{ key: "channelCode", label: "Code" }, { key: "channelName", label: "Channel" }, { key: "dropdown", label: "Dropdown" }, { key: "branchMappingEnabled", label: "Branch Mapping" }, { key: "active", label: "Active" }],
    normalize(row, n) { const channelCode = required(row, "Channel Code", n); const active = bool(row["Is Active"], "Is Active", n); const payload = { channelCode, channelName: required(row, "Channel Name", n), dropdown: bool(row["Is Dropdown"], "Is Dropdown", n), active, branchMappingEnabled: bool(row["Is Branch Mapping Enable"], "Is Branch Mapping Enable", n), vendorType: clean(row["Vendor Type"]) || null }; return { businessKey: key(channelCode), label: `${channelCode} · ${payload.channelName}`, active, payload }; },
  },
  lms_deliverables: {
    type: "lms_deliverables", label: "LMS Deliverables", description: "Available LMS-generated documents and labels.", sourceFileHint: "lms-deliverable-*.csv", privacy: "internal", requiredHeaders: lmsDeliverableHeaders, expectedHeaders: lmsDeliverableHeaders,
    displayColumns: [{ key: "id", label: "ID" }, { key: "deliverableName", label: "Name" }, { key: "deliverableLabel", label: "Label" }],
    normalize(row, n) { const id = required(row, "Id", n); const name = required(row, "Deliverable Name", n); const payload = { id, deliverableName: name, deliverableLabel: required(row, "Deliverable Label", n) }; return { businessKey: key(id), label: `${name} · ${payload.deliverableLabel}`, active: true, payload }; },
  },
  insurance_rates: {
    type: "insurance_rates", label: "Insurance Rate Master", description: "Age/tenure insurance rates. Source rows without an age discriminator are preserved by including the rate in the business key.", sourceFileHint: "rate-master-configuration-*.csv", privacy: "internal", requiredHeaders: rateHeaders, expectedHeaders: rateHeaders,
    displayColumns: [{ key: "insuranceType", label: "Insurance Type" }, { key: "insuranceProvider", label: "Provider" }, { key: "age", label: "Age" }, { key: "tenure", label: "Tenure" }, { key: "rate", label: "Rate" }],
    normalize(row, n) { const insuranceType = required(row, "Insurance Type", n); const provider = required(row, "Insurance Provider", n); const age = numberValue(row.Age, "Age", n, true); const tenure = numberValue(row.Tenure, "Tenure", n); const rate = numberValue(row.Rate, "Rate", n); const payload = { insuranceType, insuranceProvider: provider, age, tenure, rate }; return { businessKey: key(insuranceType, provider, age ?? "all", tenure, rate), label: `${insuranceType} · ${provider} · ${age ?? "all ages"} · ${tenure}`, active: true, payload }; },
  },
  repayment_start_date_rules: {
    type: "repayment_start_date_rules", label: "Repayment Start-Date Rules", description: "Scheme-level date derivation logic for repayment schedules.", sourceFileHint: "repayment-start-date-configuration.csv", privacy: "internal", requiredHeaders: repaymentHeaders, expectedHeaders: repaymentHeaders,
    displayColumns: [{ key: "schemeCode", label: "Scheme" }, { key: "fromDay", label: "From" }, { key: "toDay", label: "To" }, { key: "addValue", label: "Add" }, { key: "type", label: "Type" }, { key: "dayLogic", label: "Day Logic" }],
    normalize(row, n) { const schemeCode = required(row, "Scheme Code", n); const payload = { schemeCode, schemeName: required(row, "Scheme Name", n), fromDay: numberValue(row["From Date"], "From Date", n), toDay: numberValue(row["To Date"], "To Date", n), addValue: numberValue(row["Add Value"], "Add Value", n), type: required(row, "Type", n), dayLogic: required(row, "Day Logic", n), dayValue: clean(row["Day Value"]) || null, monthLogic: required(row, "Month Logic", n), monthValue: clean(row["Month Value"]) || null, yearLogic: required(row, "Year Logic", n), yearValue: clean(row["Year Value"]) || null, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null, createdBy: clean(row["Created By"]) || null, modifiedBy: clean(row["Modified By"]) || null }; return { businessKey: key(schemeCode), label: `${schemeCode} · ${payload.schemeName}`, active: true, payload }; },
  },
  sanction_conditions: {
    type: "sanction_conditions", label: "Sanction Conditions", description: "Pre/post-disbursal sanction conditions and turnaround times.", sourceFileHint: "sanction-master-*.csv", privacy: "internal", requiredHeaders: sanctionHeaders, expectedHeaders: sanctionHeaders,
    displayColumns: [{ key: "conditionCode", label: "Code" }, { key: "conditionName", label: "Condition" }, { key: "type", label: "Type" }, { key: "subType", label: "Sub Type" }, { key: "tatHours", label: "TAT (hr)" }, { key: "active", label: "Active" }],
    normalize(row, n) { const conditionCode = required(row, "Condition Code", n); const type = required(row, "Type", n); const subType = required(row, "Sub Type", n); const active = bool(row.Active, "Active", n); const payload = { conditionCode, conditionName: required(row, "Condition Name", n), type, subType, tatHours: numberValue(row["TAT (hr)"], "TAT (hr)", n), schemes: clean(row.Schemes) || null, scope: clean(row.Scope) || null, resanction: bool(row["Re-sanction"], "Re-sanction", n), active, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(conditionCode, type, subType), label: `${conditionCode} · ${type} · ${subType}`, active, payload }; },
  },
  branch_scheme_mapping: {
    type: "branch_scheme_mapping", label: "Branch–Scheme Mapping", description: "Branch eligibility by scheme. The supplied template currently has no records.", sourceFileHint: "branch-scheme-mapping-*.csv", privacy: "internal", requiredHeaders: branchSchemeHeaders, expectedHeaders: branchSchemeHeaders,
    displayColumns: [{ key: "branchCode", label: "Branch Code" }, { key: "branchName", label: "Branch" }, { key: "schemeCode", label: "Scheme Code" }, { key: "schemeName", label: "Scheme" }, { key: "active", label: "Active" }],
    normalize(row, n) { const branchCode = required(row, "Branch Code", n); const schemeCode = required(row, "Scheme Code", n); const active = bool(row["Is Active"], "Is Active", n); const payload = { branchCode, branchName: required(row, "Branch Name", n), schemeCode, schemeName: required(row, "Scheme Name", n), active }; return { businessKey: key(branchCode, schemeCode), label: `${branchCode} · ${schemeCode}`, active, payload }; },
  },
  quick_links: {
    type: "quick_links", label: "Quick Links", description: "Governed operational navigation links. The supplied template currently has no records.", sourceFileHint: "quick-link-master-*.csv", privacy: "internal", requiredHeaders: quickLinkHeaders, expectedHeaders: quickLinkHeaders,
    displayColumns: [{ key: "name", label: "Name" }, { key: "url", label: "Link" }, { key: "description", label: "Description" }, { key: "active", label: "Active" }],
    normalize(row, n) { const name = required(row, "Quick Link Name", n); const url = required(row, "Quick Link", n); const active = bool(row["Is Active"], "Is Active", n); const payload = { name, url, description: clean(row.Description) || null, active, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(name, url), label: name, active, payload }; },
  },
  scheme_charge_knockoff_mapping: {
    type: "scheme_charge_knockoff_mapping", label: "Scheme Charge Knockoff Policies", description: "Scheme-to-charge-knockoff policy mapping. The supplied template currently has no records.", sourceFileHint: "scheme-charge-knockoff-policy-mapping.csv", privacy: "internal", requiredHeaders: knockoffHeaders, expectedHeaders: knockoffHeaders,
    displayColumns: [{ key: "serialNumber", label: "SN" }, { key: "schemeCode", label: "Scheme" }, { key: "policies", label: "Policies" }],
    normalize(row, n) { const schemeCode = required(row, "Scheme Code", n); const policies = required(row, "Charge Knockoff Policies", n); const payload = { serialNumber: clean(row.SN) || null, schemeCode, policies, createdDate: clean(row["Created Date"]) || null, createdBy: clean(row["Created By"]) || null, modifiedDate: clean(row["Modified Date"]) || null, modifiedBy: clean(row["Modified By"]) || null }; return { businessKey: key(schemeCode, policies), label: `${schemeCode} · ${policies}`, active: true, payload }; },
  },
  state_property_titles: {
    type: "state_property_titles", label: "State Property Titles", description: "State-specific property-title and registration-document rules. The supplied template currently has no records.", sourceFileHint: "state-wise-property-title-*.csv", privacy: "internal", requiredHeaders: propertyHeaders, expectedHeaders: propertyHeaders,
    displayColumns: [{ key: "stateCode", label: "State Code" }, { key: "stateName", label: "State" }, { key: "propertyTitle", label: "Property Title" }, { key: "registrationStatus", label: "Registration" }, { key: "active", label: "Active" }],
    normalize(row, n) { const stateCode = required(row, "State Code", n); const propertyTitle = required(row, "Property Title", n); const active = bool(row["Is Active"], "Is Active", n); const payload = { stateCode, stateName: required(row, "State Name", n), propertyTitle, registrationStatus: clean(row["Registration Status"]) || null, supplementaryDocuments: clean(row["Supplementary Documents"]) || null, lastTitleDocument: clean(row["Last Title Document"]) || null, active, createdDate: clean(row["Created Date"]) || null, modifiedDate: clean(row["Modified Date"]) || null }; return { businessKey: key(stateCode, propertyTitle), label: `${stateCode} · ${propertyTitle}`, active, payload }; },
  },
};

export const masterDatasetTypes = Object.keys(masterDatasetDefinitions);

export function requireDatasetDefinition(value: unknown) {
  if (typeof value !== "string" || !masterDatasetDefinitions[value]) {
    throw new Error("Unknown master-data dataset type");
  }
  return masterDatasetDefinitions[value]!;
}
