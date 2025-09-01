import async from 'async';
import { magik } from './utilities.js';
import * as provisioning from './provisioning.js';
import * as xcode from './xcode.js';

/**
 * Fired when the developer profiles have been updated.
 * @event module:env#detected
 * @type {Object}
 */

/**
 * Fired when there was an error retreiving the provisioning profiles.
 * @event module:env#error
 * @type {Error}
 */

/**
 * Detects the Apple developer teams from the provisioning profiles and Xcodes.
 *
 * @param {Object} [options] - An object containing various settings
 * @param {Function} [callback(err, results)] - A function to call with the development environment information
 *
 * @emits module:env#detected
 * @emits module:env#error
 *
 * @returns {Handle}
 */
export function detect(options, callback) {
	return magik(options, callback, function (emitter, options, callback) {
		async.parallel({
			provisioning: function (next) {
				provisioning.detect(options, next);
			},
			xcode: function (next) {
				xcode.detect(options, next);
			}
		}, function (err, iosInfo) {
			if (err) {
				return callback(err);
			}

			var provisioning = iosInfo.provisioning.provisioning;
			var xcodes = iosInfo.xcode.xcode;
			var teams = {};

			['development', 'adhoc', 'distribution'].forEach(function (type) {
				provisioning[type].forEach(function (pp) {
					if (Array.isArray(pp.team)) {
						pp.team.forEach(function (id) {
							teams[id] = id;
						});
					}
				});
			});

			Object.keys(xcodes).forEach(function (xcodeId) {
				var t = xcodes[xcodeId].teams;
				Object.keys(t).forEach(function (id) {
					teams[id] = t[id];
				});
			});

			var results = {
				teams: Object.keys(teams).map(function (id) {
					var team = teams[id];
					if (typeof team === 'string') {
						return {
							id: team,
							name: 'Unknown',
						};
					}

					return {
						id: id,
						name: team.name
					};
				})
			};

			emitter.emit('detected', results);
			callback(null, results);
		});
	});
};
