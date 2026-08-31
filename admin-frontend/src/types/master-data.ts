import type { CustomerPagination } from "./customer";

export interface MasterDataDisplayColumn {
  key: string;
  label: string;
}

export interface MasterDatasetCatalogItem {
  type: string;
  label: string;
  description: string;
  sourceFileHint: string;
  privacy: "internal" | "restricted";
  displayColumns: MasterDataDisplayColumn[];
  requiredHeaders: string[];
  ignoredHeaders: string[];
  recordCount: number;
  activeCount: number;
  latestImport: {
    id: string;
    datasetType: string;
    sourceFileName: string;
    sourceRowCount: number;
    insertedCount: number;
    updatedCount: number;
    unchangedCount: number;
    completedAt: string;
  } | null;
}

export interface MasterDataSummary {
  sectionCount: number;
  populatedSectionCount: number;
  currentRecordCount: number;
  versionCount: number;
  completedImportCount: number;
  failedImportCount: number;
  restrictedSectionCount: number;
  collectionMetrics: {
    accountCount: number;
    closingPos: number;
    closingOverdue: number;
    delinquentAccounts: number;
  };
}

export interface MasterDataRecord {
  id: string;
  datasetType: string;
  businessKey: string;
  version: number;
  label: string;
  active: boolean | null;
  payload: Record<string, string | number | boolean | null>;
  sourceRowNumber: number;
  sourceImportJobId: string;
  importedByAdminId: string;
  createdAt: string;
  sourceImportJob: {
    id: string;
    sourceFileName: string;
    sourceHash: string;
    completedAt: string;
  };
  importedBy: { id: string; name: string; email: string };
}

export interface MasterDataVersion extends Omit<MasterDataRecord, "datasetType" | "sourceImportJobId" | "importedByAdminId"> {
  isCurrent: boolean;
}

export interface MasterDataImportJob {
  id: string;
  datasetType: string;
  sourceFileName: string;
  sourceHash: string;
  sourceRowCount: number;
  status: "completed" | "failed";
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  headers: string[];
  validationIssues: Array<{ row: number; message: string }> | null;
  reason: string;
  importedByAdminId: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  importedBy: { id: string; name: string; email: string };
}

export interface MasterDataValidation {
  valid: boolean;
  datasetType: string;
  datasetLabel: string;
  fileName: string;
  sourceHash: string;
  sourceRowCount: number;
  normalizedRowCount: number;
  headers: string[];
  ignoredHeaders: string[];
  privacy: "internal" | "restricted";
  issues: Array<{ row: number; message: string }>;
  sample: Array<{
    businessKey: string;
    label: string;
    active: boolean | null;
    payload: Record<string, string | number | boolean | null>;
  }>;
}

export interface MasterDataRecordList {
  dataset: {
    type: string;
    label: string;
    description: string;
    privacy: "internal" | "restricted";
    displayColumns: MasterDataDisplayColumn[];
    sourceFileHint: string;
    ignoredHeaders: string[];
  };
  records: MasterDataRecord[];
  pagination: CustomerPagination;
}
