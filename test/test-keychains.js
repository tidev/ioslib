import * as ioslib from '../dist/index';

describe('Keychains', () => {
	it('should get all keychains', async () => {
		const keychains = await ioslib.keychains.getKeychains(true);
		expect(keychains).to.be.an('array');

		for (const keychain of keychains) {
			expect(keychain).to.be.an('object');
			expect(keychain).to.have.keys('name', 'path');
		}
	});
});
