import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminStore } from "../store/admin.store";
import { verifyAdminStepUp } from "./api";

function response(status:number,payload:unknown){return {ok:status>=200&&status<300,status,json:vi.fn().mockResolvedValue(payload),headers:new Headers()} as unknown as Response}
describe("admin CSRF recovery",()=>{
  afterEach(()=>{vi.unstubAllGlobals();useAdminStore.setState({csrfToken:null})});
  it("renews a stale token once and retries the protected request",async()=>{
    useAdminStore.setState({csrfToken:"stale-token"});const fetchMock=vi.fn()
      .mockResolvedValueOnce(response(403,{error:{code:"ADMIN_CSRF_REJECTED",message:"CSRF verification failed"}}))
      .mockResolvedValueOnce(response(200,{data:{csrfToken:"fresh-token"}}))
      .mockResolvedValueOnce(response(200,{data:{verifiedAt:"2026-08-23T00:00:00.000Z",validForSeconds:300}}));
    vi.stubGlobal("fetch",fetchMock);const result=await verifyAdminStepUp("stale-token","123456");expect(result.validForSeconds).toBe(300);expect(fetchMock).toHaveBeenCalledTimes(3);expect(fetchMock.mock.calls[1]?.[0]).toContain("/auth/csrf");expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({"x-csrf-token":"fresh-token"});expect(useAdminStore.getState().csrfToken).toBe("fresh-token");
  });
});
