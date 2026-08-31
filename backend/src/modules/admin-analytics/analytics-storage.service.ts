import {
  access,
  chmod,
  link,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";

export interface AnalyticsFileStorage {
  readonly provider: string;
  save(storageKey: string, data: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<boolean>;
  exists(storageKey: string): Promise<boolean>;
}

export class LocalAnalyticsFileStorage implements AnalyticsFileStorage {
  readonly provider = "LOCAL";
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = path.resolve(rootDirectory);
  }

  private target(storageKey: string) {
    const normalized = storageKey.replace(/\\/g, "/");
    const segments = normalized.split("/");
    if (
      !normalized ||
      path.isAbsolute(normalized) ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          !/^[A-Za-z0-9._-]+$/.test(segment),
      )
    ) {
      throw new Error("Invalid analytics storage key");
    }
    const target = path.resolve(this.root, ...segments);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Analytics storage key escapes the configured root");
    }
    return target;
  }

  async save(storageKey: string, data: Buffer) {
    const target = this.target(storageKey);
    const directory = path.dirname(target);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await link(temporary, target);
      await chmod(target, 0o600);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async read(storageKey: string) {
    const target = this.target(storageKey);
    const details = await stat(target);
    if (!details.isFile()) throw new Error("Analytics storage object is not a file");
    return readFile(target);
  }

  async delete(storageKey: string) {
    const target = this.target(storageKey);
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    }
  }

  async exists(storageKey: string) {
    try {
      await access(this.target(storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export const analyticsFileStorage: AnalyticsFileStorage =
  new LocalAnalyticsFileStorage(env.analyticsStorageDirectory);
