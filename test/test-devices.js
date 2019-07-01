import * as ioslib from '../dist/index';

describe('Devices', () => {
	it('should get all devices', () => {
		const devices = ioslib.devices.list();
		expect(devices).to.be.an('array');
		for (const device of devices) {
			expect(device).to.be.an('object');
		}
	});

	it('should return a handle when tracking devices', function (done) {
		this.slow(3000);
		this.timeout(4000);

		const handle = ioslib.devices.watch();

		handle.on('devices', () => {});

		setTimeout(() => {
			handle.stop();
			done();
		}, 500);
	});
});
