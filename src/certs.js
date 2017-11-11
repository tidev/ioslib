import getKeychains from './keychains';
import options from './options';
import promiseLimit from 'promise-limit';

import { certificateFromPem } from 'node-forge/lib/pki';
import { cache, decodeOctalUTF8, sha1 } from 'appcd-util';
import { run } from 'appcd-subprocess';

const BEGIN = '-----BEGIN CERTIFICATE-----';
const END = '-----END CERTIFICATE-----';
const wwdrName = 'Apple Worldwide Developer Relations Certification Authority';
const certRegExp = /^(?:(iOS Development|iPhone Developer)|((?:iOS|iPhone) Distribution)): (.+)$/;

/**
 * Detects the installed certs across all keychains, then sorts them into either an iOS Developer
 * or iOS Distribution list. It also detects if a valid Apple Worldwide Developer Relations
 * certificate is found.
 *
 * @param {Boolean} [force=false] - When `true`, bypasses cache and forces redetection.
 * @returns {Promise}
 */
export function getCerts(force) {
	return cache('ioslib:certs', force, async () => {
		const keychains = await getKeychains();
		const limit = promiseLimit(3);
		const certs = {
			developer:    [],
			distribution: [],
			wwdr:         false
		};

		return Promise
			.all(keychains.map(keychain => limit(() => {
				return run(options.executables.security, [ 'find-certificate', '-a', '-p', keychain.path ])
					.then(({ stdout }) => {
						const now = new Date();
						let p = stdout.indexOf(BEGIN);
						let q;

						while (p !== -1) {
							q = stdout.indexOf(END, p);

							if (q !== -1) {
								const pem = stdout.substring(p, q + END.length);
								const certObj = certificateFromPem(pem);
								const fullname = decodeOctalUTF8(certObj.subject.getField('CN').value);
								const { notBefore, notAfter } = certObj.validity;
								const expired = notAfter < now;

								if (fullname !== wwdrName) {
									const m = fullname.match(certRegExp);
									if (m) {
										const cert = stdout.substring(p + BEGIN.length, q).replace(/\n/g, '');
										certs[m[1] ? 'developer' : 'distribution'].push({
											name: m[3],
											fullname,
											cert,
											hash: sha1(cert),
											before: notBefore,
											after: notAfter,
											expired,
											invalid: expired || notBefore > now,
											keychain: keychain.path
										});
									}
								} else if (!expired) {
									certs.wwdr = true;
								}
							}

							p = stdout.indexOf(BEGIN, q + END.length);
						}
					});
			})))
			.then(() => certs);
	});
}

export default getCerts;
