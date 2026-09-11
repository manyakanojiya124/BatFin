import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { prisma } from "../src/database/prisma.js";
import { importPortfolioSource } from "../src/modules/portfolio/portfolio-import.service.js";
const path=resolve(process.argv[2]??"tests/fixtures/portfolio-synthetic.csv");
async function main(){const admin=await prisma.adminUser.findFirst({where:{role:"SUPER_ADMIN"},orderBy:{createdAt:"asc"}});const result=await importPortfolioSource({buffer:readFileSync(path),fileName:basename(path),adminUserId:admin?.id??null});const job=result.importJob;console.log(`Portfolio import ${result.idempotent?"already applied":"completed"}: ${job.normalizedRowCount} cases, ${job.accountCount} loan accounts, ${job.dealerCount} dealers.`);if("reconciliation" in result)console.log(JSON.stringify(result.reconciliation,null,2))}
main().catch(error=>{console.error("Portfolio import failed:",error instanceof Error?error.message:"Unknown error");process.exitCode=1}).finally(async()=>prisma.$disconnect());
