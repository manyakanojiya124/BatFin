import type { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { publishPlatformChange } from "../platform-events.js";
import { calculatePortfolioReconciliation, importPortfolioSource } from "./portfolio-import.service.js";

function text(value: unknown, label: string, max = 120) {
  if (typeof value !== "string") throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  const result = value.trim().replace(/\s+/g, " ");
  if (!result || result.length > max) throw new ApiError(400, `${label} is invalid`, "VALIDATION_ERROR");
  return result;
}
function integer(value: unknown, fallback: number, max: number, label: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new ApiError(400, `${label} is invalid`, "VALIDATION_ERROR");
  return parsed;
}
function optional(value: unknown, max = 120) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new ApiError(400, "Filter is invalid", "VALIDATION_ERROR");
  return value.trim() || undefined;
}
function normalize(value: string) { return value.trim().replace(/\s+/g, " ").normalize("NFKC").toUpperCase(); }
function numeric(value: unknown) { return Number(value ?? 0); }
function serializeCase<T extends Record<string, any>>(item: T) {
  return { ...item, emi: numeric(item.emi), dpAmount: numeric(item.dpAmount), contractedDemand: numeric(item.contractedDemand), billedToDate: numeric(item.billedToDate), futureDemand: numeric(item.futureDemand) };
}

export async function getPortfolioSummary() {
  const lastImport=await prisma.portfolioImportJob.findFirst({where:{status:"COMPLETED"},orderBy:{createdAt:"desc"}});
  const stored=lastImport?.reconciliation&&typeof lastImport.reconciliation==="object"&&!Array.isArray(lastImport.reconciliation)?lastImport.reconciliation as Record<string,unknown>:null;
  const source=stored?.sourceSummary&&typeof stored.sourceSummary==="object"&&!Array.isArray(stored.sourceSummary)?stored.sourceSummary as Record<string,number|null>:null;
  const [reconciliation, linked, unlinked] = await Promise.all([
    calculatePortfolioReconciliation(source),
    prisma.portfolioAccount.count({ where: { userId: { not: null }, cases: { some: { isCurrent: true } } } }),
    prisma.portfolioAccount.count({ where: { userId: null, cases: { some: { isCurrent: true } } } }),
  ]);
  return { ...reconciliation, linkedAccounts: linked, unlinkedAccounts: unlinked, lastImport };
}

export async function listPortfolioAccounts(input: { q?: unknown; caseStatus?: unknown; bucket?: unknown; state?: unknown; dealerId?: unknown; linked?: unknown; page?: unknown; pageSize?: unknown }) {
  const q = optional(input.q, 120);
  const caseStatus = optional(input.caseStatus, 40);
  const bucket = optional(input.bucket, 40);
  const state = optional(input.state, 80);
  const dealerId = optional(input.dealerId, 100);
  const linked = input.linked === "true" ? true : input.linked === "false" ? false : undefined;
  const page = integer(input.page, 1, 100000, "Page");
  const pageSize = integer(input.pageSize, 20, 100, "Page size");
  const caseWhere: Prisma.PortfolioCaseWhereInput = {
    isCurrent: true,
    ...(caseStatus ? { caseStatus } : {}),
    ...(bucket ? { bucket } : {}),
    ...(state ? { deploymentState: state } : {}),
    ...(dealerId ? { dealerId } : {}),
  };
  const where: Prisma.PortfolioAccountWhereInput = {
    ...(linked === true ? { userId: { not: null } } : linked === false ? { userId: null } : {}),
    ...(q ? {
      OR: [
        { customerLoanId: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { cases: { some: { isCurrent: true, OR: [{ batteryNo: { contains: q, mode: "insensitive" } }, { dealer: { name: { contains: q, mode: "insensitive" } } }] } } },
      ],
    } : {}),
    cases: { some: caseWhere },
  };
  const [accounts, total] = await Promise.all([
    prisma.portfolioAccount.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { customerLoanId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, phone: true, email: true, accountStatus: true, lastLoginAt: true, lastActivityAt: true } },
        cases: { where: caseWhere, orderBy: { disburseDate: "desc" }, include: { dealer: { select: { id: true, name: true, homeState: true } } } },
      },
    }),
    prisma.portfolioAccount.count({ where }),
  ]);
  return {
    accounts: accounts.map((account) => {
      const cases = account.cases.map(serializeCase);
      return {
        ...account,
        cases,
        caseCount: cases.length,
        financial: {
          emi: cases.reduce((sum, item) => sum + item.emi, 0),
          dpAmount: cases.reduce((sum, item) => sum + item.dpAmount, 0),
          contractedDemand: cases.reduce((sum, item) => sum + item.contractedDemand, 0),
          billedToDate: cases.reduce((sum, item) => sum + item.billedToDate, 0),
          futureDemand: cases.reduce((sum, item) => sum + item.futureDemand, 0),
        },
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getRecentPortfolioAccounts(limit=5){const cases=await prisma.portfolioCase.findMany({where:{isCurrent:true},orderBy:[{disburseDate:"desc"},{sourceRowNumber:"desc"}],take:Math.max(limit*10,50),include:{dealer:true,account:{include:{user:{select:{id:true,phone:true,email:true,accountStatus:true,lastLoginAt:true,lastActivityAt:true}}}}}});const seen=new Set<string>();const result=[];for(const item of cases){if(seen.has(item.accountId))continue;seen.add(item.accountId);const serialized=serializeCase(item);result.push({...item.account,cases:[serialized],caseCount:1,financial:{emi:serialized.emi,dpAmount:serialized.dpAmount,contractedDemand:serialized.contractedDemand,billedToDate:serialized.billedToDate,futureDemand:serialized.futureDemand}});if(result.length>=limit)break}return result}

export async function getPortfolioAccount(id: string, adminUserId?: string, context?: AdminRequestContext) {
  const account = await prisma.portfolioAccount.findUnique({
    where: { id },
    include: {
      user: { include: { assets: { orderBy: { createdAt: "desc" } }, tickets: { orderBy: { createdAt: "desc" }, take: 20 }, transactions: { orderBy: { transactionDate: "desc" }, take: 20 }, activities: { orderBy: { createdAt: "desc" }, take: 30 } } },
      cases: { orderBy: [{ isCurrent: "desc" }, { disburseDate: "desc" }], include: { dealer: true, sourceImport: { select: { id: true, sourceFileName: true, sourceHash: true, createdAt: true } } } },
    },
  });
  if (!account) throw new ApiError(404, "Portfolio customer not found", "PORTFOLIO_ACCOUNT_NOT_FOUND");
  if (adminUserId) await prisma.adminAuditLog.create({ data: { adminUserId, action: "PORTFOLIO_CUSTOMER_VIEWED", resourceType: "PortfolioAccount", resourceId: id, ipAddress: context?.ipAddress ?? null, userAgent: context?.userAgent ?? null } });
  const cases = account.cases.map(serializeCase);
  const current = cases.filter((item) => item.isCurrent);
  return {
    ...account,
    user: account.user ? { ...account.user, transactions: account.user.transactions.map(item => ({ ...item, amount: numeric(item.amount) })) } : null,
    cases,
    financial: {
      emi: current.reduce((sum, item) => sum + item.emi, 0),
      dpAmount: current.reduce((sum, item) => sum + item.dpAmount, 0),
      contractedDemand: current.reduce((sum, item) => sum + item.contractedDemand, 0),
      billedToDate: current.reduce((sum, item) => sum + item.billedToDate, 0),
      futureDemand: current.reduce((sum, item) => sum + item.futureDemand, 0),
    },
  };
}

export async function listPortfolioImports() { return { imports: await prisma.portfolioImportJob.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { importedBy: { select: { id: true, name: true, email: true } } } }) }; }
export async function importPortfolio(file: Express.Multer.File | undefined, adminUserId: string) { if (!file) throw new ApiError(400, "Portfolio workbook is required", "VALIDATION_ERROR"); return importPortfolioSource({ buffer: file.buffer, fileName: file.originalname, adminUserId }); }
function auditReason(value: unknown) { const result = text(value, "Audit reason", 500); if (result.length < 10) throw new ApiError(400, "Audit reason must be at least 10 characters", "VALIDATION_ERROR"); return result; }

export async function updatePortfolioCaseStatus(id: string, adminUserId: string, input: { caseStatus?: unknown; bucket?: unknown; reason?: unknown }, context: AdminRequestContext) {
  const caseStatus = normalize(text(input.caseStatus, "Case status", 40)).replace("FORE CLOSE", "FORECLOSED");
  const bucket = normalize(text(input.bucket, "Bucket", 40)).replace("FORE CLOSE", "FORECLOSED");
  if (!["ACTIVE", "REDEPLOYED", "REPO", "FORECLOSED"].includes(caseStatus)) throw new ApiError(400, "Invalid case status", "VALIDATION_ERROR");
  if (!["CURRENT", "CLOSED", "30-59 DAYS", "FORECLOSED", "NPA"].includes(bucket)) throw new ApiError(400, "Invalid bucket", "VALIDATION_ERROR");
  const reason = auditReason(input.reason);
  const current = await prisma.portfolioCase.findUnique({ where: { id } });
  if (!current?.isCurrent) throw new ApiError(404, "Current portfolio case not found", "PORTFOLIO_CASE_NOT_FOUND");
  const updated = await prisma.$transaction(async (transaction) => {
    const value = await transaction.portfolioCase.update({ where: { id }, data: { caseStatus, bucket, delinquent: bucket === "30-59 DAYS" || bucket === "NPA", npaRepo: bucket === "NPA" || caseStatus === "REPO" } });
    const statuses = (await transaction.portfolioCase.findMany({ where: { accountId: current.accountId, isCurrent: true }, select: { caseStatus: true } })).map(item => item.caseStatus);
    await transaction.portfolioAccount.update({ where: { id: current.accountId }, data: { portfolioStatus: statuses.includes("ACTIVE") ? "ACTIVE" : statuses.includes("REDEPLOYED") ? "REDEPLOYED" : statuses[0] ?? "INACTIVE" } });
    await transaction.adminAuditLog.create({ data: { adminUserId, action: "PORTFOLIO_CASE_STATUS_CHANGED", resourceType: "PortfolioCase", resourceId: id, metadata: { reason, previousCaseStatus: current.caseStatus, newCaseStatus: caseStatus, previousBucket: current.bucket, newBucket: bucket }, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null } });
    return value;
  });
  publishPlatformChange({ type: "portfolio", action: "case_status_changed", resourceId: id });
  return serializeCase(updated);
}

export async function provisionPortfolioBatteries(transaction:Prisma.TransactionClient,accountId:string,userId:string,createdByAdminId?:string){const cases=await transaction.portfolioCase.findMany({where:{accountId,isCurrent:true,batteryNo:{not:null},batteryIsPlaceholder:false},select:{batteryNo:true}});for(const serialNumber of [...new Set(cases.map(item=>item.batteryNo).filter((item):item is string=>Boolean(item)))]){const asset=await transaction.asset.findUnique({where:{serialNumber},select:{id:true,userId:true}});if(!asset)await transaction.asset.create({data:{userId,assetType:"battery",productType:"Battery Finance Service",serialNumber,status:"active",inventoryStatus:"assigned",createdByAdminId:createdByAdminId??null}});else if(!asset.userId)await transaction.asset.update({where:{id:asset.id},data:{userId,status:"active",inventoryStatus:"assigned"}})}}

export async function linkPortfolioAccountByAdmin(accountId: string, adminUserId: string, input: { userId?: unknown; reason?: unknown }, context: AdminRequestContext) {
  const userId = text(input.userId, "User ID", 100); const reason = auditReason(input.reason);
  const [account, user] = await Promise.all([prisma.portfolioAccount.findUnique({ where: { id: accountId } }), prisma.user.findUnique({ where: { id: userId } })]);
  if (!account) throw new ApiError(404, "Portfolio account not found", "PORTFOLIO_ACCOUNT_NOT_FOUND");
  if (!user) throw new ApiError(404, "Customer login account not found", "CUSTOMER_NOT_FOUND");
  if (account.userId && account.userId !== userId) throw new ApiError(409, "Portfolio account is already linked to another user", "PORTFOLIO_ALREADY_LINKED");
  const linked = await prisma.$transaction(async (transaction) => {
    const value = await transaction.portfolioAccount.update({ where: { id: accountId }, data: { userId, linkedAt: new Date() } });
    await provisionPortfolioBatteries(transaction,accountId,userId,adminUserId);
    await transaction.customerActivity.create({ data: { userId, eventType: "PORTFOLIO_LINKED_BY_ADMIN", metadata: { portfolioAccountId: accountId, customerLoanId: account.customerLoanId } } });
    await transaction.user.update({ where: { id: userId }, data: { lastActivityAt: new Date() } });
    await transaction.adminAuditLog.create({ data: { adminUserId, action: "PORTFOLIO_ACCOUNT_LINKED", resourceType: "PortfolioAccount", resourceId: accountId, metadata: { reason, userId }, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null } });
    return value;
  });
  publishPlatformChange({ type: "portfolio", action: "account_linked", resourceId: accountId });
  return linked;
}

export async function findClaimablePortfolioAccount(input: { customerLoanId: unknown; batteryNo: unknown; customerName: unknown }) {
  const customerLoanId = normalize(text(input.customerLoanId, "Customer Loan ID", 80));
  const batteryNo = normalize(text(input.batteryNo, "Battery number", 120));
  const customerName = normalize(text(input.customerName, "Customer name", 80));
  const account = await prisma.portfolioAccount.findUnique({ where: { customerLoanId }, include: { cases: { where: { isCurrent: true }, select: { batteryNo: true, batteryIsPlaceholder: true } } } });
  if (!account || account.normalizedCustomerName !== customerName || !account.cases.some(item => !item.batteryIsPlaceholder && item.batteryNo && normalize(item.batteryNo) === batteryNo)) throw new ApiError(404, "Portfolio details did not match an existing BatFIN agreement", "PORTFOLIO_CLAIM_NOT_MATCHED");
  return account;
}
export async function linkClaimedPortfolioAccount(accountId: string, userId: string, transaction?: Prisma.TransactionClient) {
  const client = transaction ?? prisma;
  const account = await client.portfolioAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new ApiError(404, "Portfolio account not found", "PORTFOLIO_ACCOUNT_NOT_FOUND");
  if (account.userId && account.userId !== userId) throw new ApiError(409, "This agreement is already linked to another login", "PORTFOLIO_ALREADY_LINKED");
  if (account.userId === userId) return account;
  const linked=await client.portfolioAccount.update({ where: { id: accountId }, data: { userId, linkedAt: new Date() } });
  if(transaction)await provisionPortfolioBatteries(transaction,accountId,userId);else await prisma.$transaction(tx=>provisionPortfolioBatteries(tx,accountId,userId));
  return linked;
}
export async function claimPortfolioForUser(userId: string, input: { customerLoanId?: unknown; batteryNo?: unknown }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User account not found", "USER_NOT_FOUND");
  const account = await findClaimablePortfolioAccount({ customerLoanId: input.customerLoanId, batteryNo: input.batteryNo, customerName: user.name });
  const linked = await prisma.$transaction(async (transaction) => {
    const value = await linkClaimedPortfolioAccount(account.id, userId, transaction);
    await transaction.customerActivity.create({ data: { userId, eventType: "PORTFOLIO_CLAIMED", metadata: { portfolioAccountId: account.id, customerLoanId: account.customerLoanId } } });
    await transaction.user.update({ where: { id: userId }, data: { lastActivityAt: new Date() } });
    return value;
  });
  publishPlatformChange({ type: "portfolio", action: "account_claimed", resourceId: account.id });
  return linked;
}
export async function getUserPortfolio(userId: string) {
  const accounts = await prisma.portfolioAccount.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, include: { cases: { where: { isCurrent: true }, orderBy: { disburseDate: "desc" }, include: { dealer: true } } } });
  return { accounts: accounts.map(account => ({ ...account, cases: account.cases.map(serializeCase), financial: { emi: account.cases.reduce((sum, item) => sum + numeric(item.emi), 0), dpAmount: account.cases.reduce((sum, item) => sum + numeric(item.dpAmount), 0), contractedDemand: account.cases.reduce((sum, item) => sum + numeric(item.contractedDemand), 0), billedToDate: account.cases.reduce((sum, item) => sum + numeric(item.billedToDate), 0), futureDemand: account.cases.reduce((sum, item) => sum + numeric(item.futureDemand), 0) } })) };
}
