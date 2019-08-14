import * as ioslib from '../dist/index';

describe('Certificates', () => {
	it('should get all development and distribution certs', async () => {
		const certs = await ioslib.certs.getCerts(true);

		expect(certs).to.be.an('object');
		expect(certs).to.have.keys('developer', 'distribution', 'wwdr');

		for (const cert of certs.developer) {
			expect(cert).to.be.an('object');
			expect(cert).to.have.keys('name', 'fullname', 'cert', 'hash', 'before', 'after', 'expired', 'invalid', 'keychain', 'teamId');
			expect(cert.fullname).to.contain(cert.name);
			expect(cert.before).to.be.an.instanceof(Date);
			expect(cert.after).to.be.an.instanceof(Date);
		}
	});
});
