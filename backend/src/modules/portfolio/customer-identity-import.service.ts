import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { parse } from "csv-parse/sync";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { publishPlatformChange } from "../platform-events.js";
import { provisionPortfolioBatteries } from "./portfolio.service.js";
const required=["Source Application Number","Loan Account Number","Global Cust Id","Customer Name","Customer Id","Mobile No"];
function compact(value:unknown){return typeof value==="string"?value.trim().replace(/\s+/g," "):""}
function normalize(value:string){return compact(value).normalize("NFKC").toUpperCase()}
function phone(value:string){const digits=value.replace(/\D/g,"");if(digits.length===10&&/^[6-9]/.test(digits))return`+91${digits}`;if(digits.length===12&&digits.startsWith("91")&&/^[6-9]/.test(digits[2]??""))return`+${digits}`;return null}
interface Identity{row:number;loanId:string;sourceApplicationNumber:string;globalCustomerId:string;lmsCustomerId:string;name:string;phone:string}
export function inspectCustomerIdentitySource(buffer:Buffer,fileName:string){
  if(extname(fileName).toLowerCase()!==".csv")throw new ApiError(415,"Customer identity source must be a CSV export","CUSTOMER_IDENTITY_FILE_UNSUPPORTED");
  let records:Record<string,string>[];
  try{records=parse(buffer,{columns:true,bom:true,skip_empty_lines:true,relax_column_count:true,trim:false,max_record_size:2000000}) as Record<string,string>[]}catch{throw new ApiError(400,"Collection MIS CSV could not be parsed","CUSTOMER_IDENTITY_CSV_INVALID")}
  const headers=records.length?Object.keys(records[0]!):[];const missing=required.filter(item=>!headers.includes(item));if(missing.length)throw new ApiError(400,`Collection MIS is missing: ${missing.join(", ")}`,"CUSTOMER_IDENTITY_COLUMNS_MISSING");
  const errors:string[]=[];const warnings:string[]=[];const identities:Identity[]=[];const seenPhones=new Map<string,number>();const seenLoans=new Map<string,number>();
  records.forEach((record,index)=>{const row=index+2;const loanId=normalize(record["Loan Account Number"]??"");const name=compact(record["Customer Name"]);const mobile=phone(record["Mobile No"]??"");if(!loanId)errors.push(`Row ${row}: Loan Account Number is missing`);if(!name)errors.push(`Row ${row}: Customer Name is missing`);if(!mobile)errors.push(`Row ${row}: Mobile No is invalid`);if(loanId&&name&&mobile){identities.push({row,loanId,sourceApplicationNumber:normalize(record["Source Application Number"]??""),globalCustomerId:normalize(record["Global Cust Id"]??""),lmsCustomerId:normalize(record["Customer Id"]??""),name,phone:mobile});seenPhones.set(mobile,(seenPhones.get(mobile)??0)+1);seenLoans.set(loanId,(seenLoans.get(loanId)??0)+1)}});
  const duplicatePhones=[...seenPhones.values()].filter(value=>value>1).length;const duplicateLoans=[...seenLoans.values()].filter(value=>value>1).length;if(duplicatePhones)warnings.push(`${duplicatePhones} duplicate mobile identities require review`);if(duplicateLoans)warnings.push(`${duplicateLoans} duplicate loan account identities require review`);
  return{sourceRowCount:records.length,validIdentityCount:identities.length,uniquePhoneCount:seenPhones.size,uniqueLoanCount:seenLoans.size,errors,warnings,identities};
}
export async function importCustomerIdentities(input:{buffer:Buffer;fileName:string;adminUserId?:string|null}){
  if(input.buffer.length<1||input.buffer.length>25*1024*1024)throw new ApiError(413,"Customer identity source must be from 1 byte to 25 MB","CUSTOMER_IDENTITY_FILE_SIZE_INVALID");
  const sourceHash=createHash("sha256").update(input.buffer).digest("hex");const existing=await prisma.customerIdentityImportJob.findUnique({where:{sourceHash}});if(existing?.status==="COMPLETED")return{importJob:existing,idempotent:true};
  const inspected=inspectCustomerIdentitySource(input.buffer,input.fileName);const job=existing??await prisma.customerIdentityImportJob.create({data:{importedByAdminId:input.adminUserId??null,sourceFileName:basename(input.fileName).slice(0,255),sourceHash,status:"PROCESSING",sourceRowCount:inspected.sourceRowCount,validIdentityCount:inspected.validIdentityCount,warnings:inspected.warnings,errors:inspected.errors}});
  if(inspected.errors.length){await prisma.customerIdentityImportJob.update({where:{id:job.id},data:{status:"FAILED",errors:inspected.errors,completedAt:new Date()}});throw new ApiError(422,`Customer identity validation failed: ${inspected.errors.slice(0,5).join("; ")}`,"CUSTOMER_IDENTITY_VALIDATION_FAILED")}
  const outcome=await prisma.$transaction(async transaction=>{
    const users=new Map((await transaction.user.findMany({where:{phone:{in:inspected.identities.map(item=>item.phone)}},select:{id:true,phone:true}})).map(item=>[item.phone,item]));
    const accounts=new Map((await transaction.portfolioAccount.findMany({where:{customerLoanId:{in:inspected.identities.map(item=>item.loanId)}},select:{id:true,customerLoanId:true,userId:true}})).map(item=>[item.customerLoanId,item]));
    let createdUsers=0,existingUsers=0,linkedAccounts=0,unmatchedLoans=0,conflicts=0;
    for(const identity of inspected.identities){
      let user=users.get(identity.phone);
      if(!user){user=await transaction.user.create({data:{name:identity.name,phone:identity.phone,accountStatus:"active"},select:{id:true,phone:true}});users.set(identity.phone,user);createdUsers+=1;await transaction.customerActivity.create({data:{userId:user.id,eventType:"CUSTOMER_IDENTITY_IMPORTED",metadata:{source:"COLLECTION_MIS",loanAccountMatched:accounts.has(identity.loanId)}}})}else existingUsers+=1;
      const account=accounts.get(identity.loanId);if(!account){unmatchedLoans+=1;continue}if(account.userId&&account.userId!==user.id){conflicts+=1;continue}
      await transaction.portfolioAccount.update({where:{id:account.id},data:{userId:user.id,linkedAt:account.userId?undefined:new Date(),sourceApplicationNumber:identity.sourceApplicationNumber||null,globalCustomerId:identity.globalCustomerId||null,lmsCustomerId:identity.lmsCustomerId||null}});
      if(!account.userId){linkedAccounts+=1;await provisionPortfolioBatteries(transaction,account.id,user.id,input.adminUserId??undefined)}
      accounts.set(identity.loanId,{...account,userId:user.id});
    }
    const warnings=[...inspected.warnings,...(unmatchedLoans?[`${unmatchedLoans} loan accounts were not present in the portfolio Master Data snapshot`]:[]),...(conflicts?[`${conflicts} portfolio links conflicted with an existing user`]:[])];
    await transaction.customerIdentityImportJob.update({where:{id:job.id},data:{status:"COMPLETED",createdUserCount:createdUsers,existingUserCount:existingUsers,linkedAccountCount:linkedAccounts,unmatchedLoanCount:unmatchedLoans,conflictCount:conflicts,warnings,completedAt:new Date()}});
    if(input.adminUserId)await transaction.adminAuditLog.create({data:{adminUserId:input.adminUserId,action:"CUSTOMER_IDENTITIES_IMPORTED",resourceType:"CustomerIdentityImportJob",resourceId:job.id,metadata:{sourceHash,sourceRows:inspected.sourceRowCount,validIdentities:inspected.validIdentityCount,createdUsers,existingUsers,linkedAccounts,unmatchedLoans,conflicts}}});
    return{createdUsers,existingUsers,linkedAccounts,unmatchedLoans,conflicts};
  },{timeout:120000,maxWait:10000});
  const completed=await prisma.customerIdentityImportJob.findUniqueOrThrow({where:{id:job.id}});publishPlatformChange({type:"customer",action:"customer_identities_imported",resourceId:job.id});return{importJob:completed,outcome,idempotent:false};
}
