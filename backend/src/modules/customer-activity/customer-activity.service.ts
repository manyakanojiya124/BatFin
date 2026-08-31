import type { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { publishPlatformChange } from "../platform-events.js";

export async function recordCustomerActivity(input:{userId:string;eventType:string;metadata?:Prisma.InputJsonValue;transaction?:Prisma.TransactionClient}) {
  const client=input.transaction??prisma;
  const createdAt=new Date();
  await client.customerActivity.create({data:{userId:input.userId,eventType:input.eventType,...(input.metadata!==undefined?{metadata:input.metadata}:{})}});
  await client.user.update({where:{id:input.userId},data:{lastActivityAt:createdAt}});
  publishPlatformChange({type:"activity",action:input.eventType,resourceId:input.userId});
}
