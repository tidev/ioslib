import which from 'which';

/**
 * Finds an executable in the subjects array.
 *
 * @param subjects - An array of subjects to find.
 * @returns The first executable found in the subjects array.
 */
export async function findExecutable(subjects: (string | null | undefined)[]) {
	return subjects.reduce(async (promise, subject) => {
		return promise.then(async (result) => {
			if (!result && subject) {
				try {
					return await which(subject);
				} catch {}
			}
			return result;
		});
	}, Promise.resolve(null));
}
