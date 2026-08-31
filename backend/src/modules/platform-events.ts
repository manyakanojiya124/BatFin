import { EventEmitter } from "node:events";

export interface PlatformChangeEvent {
  type: "customer" | "portfolio" | "asset" | "subscription" | "payment" | "ticket" | "activity";
  action: string;
  occurredAt: string;
  resourceId?: string;
}
const emitter = new EventEmitter();
emitter.setMaxListeners(200);
export function publishPlatformChange(event: Omit<PlatformChangeEvent, "occurredAt">) {
  emitter.emit("change", { ...event, occurredAt: new Date().toISOString() } satisfies PlatformChangeEvent);
}
export function subscribePlatformChanges(listener: (event: PlatformChangeEvent) => void) {
  emitter.on("change", listener);
  return () => emitter.off("change", listener);
}
