import { create } from "zustand";
import type { AdminUser } from "../types/admin";

const CSRF_STORAGE_KEY = "batfin_admin_csrf";
const CSRF_CHANNEL_NAME = "batfin_admin_csrf_sync";
function readCsrfToken() { try { return window.sessionStorage.getItem(CSRF_STORAGE_KEY); } catch { return null; } }
function persistCsrfToken(token:string|null){try{if(token)window.sessionStorage.setItem(CSRF_STORAGE_KEY,token);else window.sessionStorage.removeItem(CSRF_STORAGE_KEY)}catch{/* In-memory state remains authoritative for this tab. */}}
let csrfChannel:BroadcastChannel|null=null;
function channel(){if(typeof window==="undefined"||typeof window.BroadcastChannel==="undefined")return null;if(!csrfChannel)csrfChannel=new window.BroadcastChannel(CSRF_CHANNEL_NAME);return csrfChannel}
function broadcastCsrfToken(token:string|null){try{channel()?.postMessage({type:"csrf",token})}catch{/* Automatic request recovery remains available. */}}

interface AdminState {admin:AdminUser|null;csrfToken:string|null;initialized:boolean;setSession:(admin:AdminUser,csrfToken:string)=>void;setAdmin:(admin:AdminUser)=>void;setCsrfToken:(csrfToken:string)=>void;setInitialized:(initialized:boolean)=>void;clearSession:()=>void;}
export const useAdminStore=create<AdminState>((set)=>({
  admin:null,csrfToken:readCsrfToken(),initialized:false,
  setSession:(admin,csrfToken)=>{persistCsrfToken(csrfToken);broadcastCsrfToken(csrfToken);set({admin,csrfToken,initialized:true})},
  setAdmin:(admin)=>set({admin}),
  setCsrfToken:(csrfToken)=>{persistCsrfToken(csrfToken);broadcastCsrfToken(csrfToken);set({csrfToken})},
  setInitialized:(initialized)=>set({initialized}),
  clearSession:()=>{persistCsrfToken(null);broadcastCsrfToken(null);set({admin:null,csrfToken:null,initialized:true})},
}));

const syncChannel=channel();
if(syncChannel){syncChannel.addEventListener("message",event=>{const message=event.data as {type?:unknown;token?:unknown}|null;if(message?.type!=="csrf")return;const token=typeof message.token==="string"?message.token:null;persistCsrfToken(token);useAdminStore.setState({csrfToken:token})})}
