module.exports = {
	roots: ["<rootDir>/test"],
	transform: {
		"^.+\\.tsx?$": "ts-jest",
	},
	testRegex: "(/__tests__/.*|(\\.|/)(test))\\.tsx?$",
	moduleFileExtensions: ["ts", "js", "json", "node"],
};