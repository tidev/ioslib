const fs = require('fs');
const Module = require('module');
const path = require('path');

const babelRE = /^(babel-\w+-)/;
const conf = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.babelrc')));

if (process.env.COVERAGE && conf.plugins.indexOf('istanbul') === -1) {
	// inject the istanbul babel plugin
	conf.plugins.unshift([
		'istanbul',
		{ exclude: 'test' }
	]);
}

// remove babili from tests and resolve all babel plugins/presets
Object.keys(conf).forEach(function (key) {
	if ((key === 'plugins' || key === 'presets') && Array.isArray(conf[key])) {
		for (var i = 0; i < conf[key].length; i++) {
			const isArr = Array.isArray(conf[key][i]);
	 		let name = isArr ? conf[key][i][0] : conf[key][i];
			if (name.indexOf('babili') !== -1) {
				conf[key].splice(i--, 1);
			} else {
				name = Module._resolveFilename(babelRE.test(name) ? name : 'babel-' + key.slice(0, -1) + '-' + name, module);
				if (isArr) {
					conf[key][i][0] = name;
				} else {
					conf[key][i] = name;
				}
			}
		}
	} else {
		delete conf[key];
	}
});

// only transpile src and tests
conf.only = new RegExp(process.cwd() + '/(src|test)/');

// console.log(conf);

require('babel-register')(conf);
// require('babel-polyfill');

/**
 * The unit tests reference the source files in the `dist` directory and for coverage tests, they
 * are transpiled on-the-fly, so we need to force them to be resolved in the `src` directory
 * instead.
 */
if (process.env.COVERAGE) {
	const cwd = process.cwd();
	const distDir = cwd + '/dist/';
	const srcDir = cwd + '/src/';
	const originalResolveFilename = Module._resolveFilename;

	Module._resolveFilename = function (request, parent, isMain) {
		if (request.indexOf('/dist/') !== -1 && parent.id.indexOf(cwd) === 0) {
			request = request.replace(/\/dist\//g, '/src/');
		}
		return originalResolveFilename(request, parent, isMain);
	};
}
