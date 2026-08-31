import type { Request, RequestHandler } from "express";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import {importCustomerIdentities} from "./customer-identity-import.service.js";
import * as service from "./portfolio.service.js";
function auth(request:Request){if(!request.adminAuth)throw new ApiError(401,"Admin authentication is required","ADMIN_UNAUTHORIZED");return request.adminAuth}
function id(value:string|string[]|undefined){if(typeof value!=="string"||!value)throw new ApiError(400,"A valid ID is required","VALIDATION_ERROR");return value}
function context(request:Request){return{ipAddress:request.ip||null,userAgent:request.header("user-agent")?.slice(0,500)??null}}
const summary:RequestHandler=async(_request,response)=>response.status(200).json({data:{summary:await service.getPortfolioSummary()}});
const list:RequestHandler=async(request,response)=>response.status(200).json({data:await service.listPortfolioAccounts(request.query)});
const getById:RequestHandler=async(request,response)=>{const admin=auth(request);response.status(200).json({data:{account:await service.getPortfolioAccount(id(request.params.id),admin.adminUserId,context(request))}})};
const imports:RequestHandler=async(_request,response)=>response.status(200).json({data:await service.listPortfolioImports()});
const upload:RequestHandler=async(request,response)=>{const admin=auth(request);response.status(201).json({data:await service.importPortfolio(request.file,admin.adminUserId)})};
const identityUpload:RequestHandler=async(request,response)=>{const admin=auth(request);if(!request.file)throw new ApiError(400,"Collection MIS CSV is required","VALIDATION_ERROR");response.status(201).json({data:await importCustomerIdentities({buffer:request.file.buffer,fileName:request.file.originalname,adminUserId:admin.adminUserId})})};
const identityImports:RequestHandler=async(_request,response)=>response.status(200).json({data:{imports:await prisma.customerIdentityImportJob.findMany({orderBy:{createdAt:"desc"},take:50,include:{importedBy:{select:{id:true,name:true,email:true}}}})}});
const updateStatus:RequestHandler=async(request,response)=>{const admin=auth(request);response.status(200).json({data:{case:await service.updatePortfolioCaseStatus(id(request.params.id),admin.adminUserId,request.body??{},context(request))}})};
const linkUser:RequestHandler=async(request,response)=>{const admin=auth(request);response.status(200).json({data:{account:await service.linkPortfolioAccountByAdmin(id(request.params.id),admin.adminUserId,request.body??{},context(request))}})};
export const adminPortfolioController={summary,list,getById,imports,upload,identityUpload,identityImports,updateStatus,linkUser};
