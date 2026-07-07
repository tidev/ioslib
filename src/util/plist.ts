import { isFile } from './is-file.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import plist from 'simple-plist';

/**
 * Convert a JavaScript object to a plist XML string.
 * @param obj - The JavaScript object to convert.
 * @returns The plist XML string.
 */
export function stringifyPlist(obj: Record<string, unknown>): string {
	return plist.stringify(obj);
}

/**
 * Parse a plist string or buffer into a JavaScript object.
 * @param str - The plist string or buffer to parse.
 * @returns The parsed JavaScript object.
 * @throws An error if the plist is invalid.
 */
export function parsePlist<T = unknown>(str: string | Buffer): T {
	try {
		return plist.parse<T>(str);
	} catch (err) {
		throw new Error(`Invalid plist: ${err}`);
	}
}

/**
 * Read a plist file synchronously and parse it into a JavaScript object.
 * @param file - The path to the plist file.
 * @returns The parsed JavaScript object.
 * @throws An error if the plist file does not exist or is invalid.
 */
export function readPlistSync<T = unknown>(file: string): T {
	if (!isFile(file)) {
		throw new Error('plist file does not exist');
	}
	return parsePlist<T>(readFileSync(file));
}

/**
 * Read a plist file asynchronously and parse it into a JavaScript object.
 * @param file - The path to the plist file.
 * @returns The parsed JavaScript object.
 * @throws An error if the plist file does not exist or is invalid.
 */
export async function readPlist<T = unknown>(file: string): Promise<T> {
	if (!isFile(file)) {
		throw new Error('plist file does not exist');
	}
	return parsePlist<T>(await readFile(file));
}

/**
 * Write a JavaScript object to a plist file synchronously.
 * @param file - The path to the plist file.
 * @param data - The JavaScript object to write to the plist file.
 * @throws An error if the plist file does not exist or is invalid.
 */
export function writePlistSync(file: string, data: Record<string, any>): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, plist.stringify(data));
}

/**
 * Write a JavaScript object to a plist file asynchronously.
 * @param file - The path to the plist file.
 * @param data - The JavaScript object to write to the plist file.
 * @throws An error if the plist file does not exist or is invalid.
 */
export async function writePlist(file: string, data: Record<string, any>): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, plist.stringify(data));
}
