module.exports = (sargs) => {
	let props = {}
	let lones = []

	const convertIfApplicable = (value) => (isNaN(value) ? (value.toString().toLowerCase() === 'true' ? true : (value.toString().toLowerCase() === 'false' ? false : value)) : Number(value))
	const removeStartHyphens = (value) => value.replace(/^\-+/g, '')

	for (let i = 0; i < sargs.length; i++) {
		const equalsIndex = sargs[i].indexOf('=')
		const isNextRefProp = sargs[i].charAt(0) === '-' && sargs.length - 1 >= i + 1 && sargs[i + 1].indexOf('=') === -1 && sargs[i + 1].charAt(0) !== '-'
		const argName = equalsIndex === -1 ? removeStartHyphens(sargs[i]) : removeStartHyphens(sargs[i].slice(0, equalsIndex))

		if (equalsIndex !== -1) {
			props[argName] = convertIfApplicable(sargs[i].slice(equalsIndex + 1))
		}
		else if (isNextRefProp) {
			props[argName] = convertIfApplicable(sargs[i + 1])
			i++
		} else if (sargs[i].charAt(0) === '-') {
			if (sargs[i].charAt(1) === '-') {
				props[argName] = true
			}
			else {
				for (let b = 0; b < argName.length; b++) {
					props[argName.charAt(b)] = true
				}
			}
		} else {
			lones.push(convertIfApplicable(argName))
		}
	}

	return Object.assign(props, {
		'_': lones
	})
}