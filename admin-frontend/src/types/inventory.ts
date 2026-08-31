import type { CustomerStatus } from "./customer";

export type InventoryStatus =
  | "available"
  | "assigned"
  | "maintenance"
  | "retired";

export interface InventoryAsset {
  id: string;
  userId: string | null;
  assetType: "battery" | "vehicle";
  productType: string;
  serialNumber: string;
  vehicleNumber: string | null;
  status: string;
  inventoryStatus: InventoryStatus;
  batteryLevel: number | null;
  temperature: number | null;
  latitude: number | null;
  longitude: number | null;
  qrIssuedAt: string | null;
  verifiedAt: string | null;
  batchId: string | null;
  createdByAdminId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
    accountStatus: CustomerStatus;
  } | null;
  batch: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  } | null;
  createdByAdmin: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: { subscriptions: number };
}

export interface InventorySummary {
  total: number;
  assigned: number;
  unassigned: number;
  available: number;
  maintenance: number;
  retired: number;
  qrVerified: number;
}

export interface AssetBatch {
  id: string;
  name: string;
  assetType: string;
  productType: string;
  quantity: number;
  status: string;
  createdByAdminId: string;
  completedAt: string | null;
  createdAt: string;
  createdByAdmin?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: { assets: number };
  assets?: InventoryAsset[];
}

export interface BatchIssueResult {
  batch: AssetBatch;
  items: Array<{
    asset: InventoryAsset;
    qrData: string;
  }>;
}
