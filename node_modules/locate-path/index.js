import process from 'node:process';
import path from 'node:path';
import fs, {promises as fsPromises} from 'node:fs';
import pLocate from 'p-locate';

const typeMappings = {
	directory: 'isDirectory',
	file: 'isFile',
};

function checkType(type) {
	if (type in typeMappings) {
		return;
	}

	throw new Error(`Invalid type specified: ${type}`);
}

const matchType = (type, stat) => type === undefined || stat[typeMappings[type]]();

export async function locatePath(
	paths,
	{
		cwd = process.cwd(),
		type = 'file',
		allowSymlinks = true,
		concurrency,
		preserveOrder,
	} = {},
) {
	checkType(type);

	const statFunction = allowSymlinks ? fsPromises.stat : fsPromises.lstat;

	return pLocate(paths, async path_ => {
		try {
			const stat = await statFunction(path.resolve(cwd, path_));
			return matchType(type, stat);
		} catch {
			return false;
		}
	}, {concurrency, preserveOrder});
}

export function locatePathSync(
	paths,
	{
		cwd = process.cwd(),
		type = 'file',
		allowSymlinks = true,
	} = {},
) {
	checkType(type);

	const statFunction = allowSymlinks ? fs.statSync : fs.lstatSync;

	for (const path_ of paths) {
		try {
			const stat = statFunction(path.resolve(cwd, path_));

			if (matchType(type, stat)) {
				return path_;
			}
		} catch {}
	}
}
