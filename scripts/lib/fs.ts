import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Write JSON through a temporary file so a crash never leaves a half file. */
export async function writeJsonAtomic(
  file: string,
  value: unknown,
  { pretty = false }: { pretty?: boolean } = {},
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  const body = `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
  try {
    await writeFile(temp, body, "utf8");
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
