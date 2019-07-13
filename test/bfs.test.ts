import { Field, field, logger } from "@coder/logger";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { BFS, fromTar } from "../src/bfs";

const fieldArrayFromData = (data: { [key: string]: any }): Array<Field<any>> => {
	return Object.keys(data).map((key) => field(key, data[key]));
};
const loggers = {
	debug: (msg: string, data?: { [key: string]: any }) => logger.debug(msg, ...fieldArrayFromData(data || {})),
	error: (msg: string, data?: { [key: string]: any }) => logger.error(msg, ...fieldArrayFromData(data || {})),
	info: (msg: string, data?: { [key: string]: any }) => logger.info(msg, ...fieldArrayFromData(data || {})),
};

describe("BFS", () => {
	describe("fromTar", () => {
		it("should create FS from empty Tar", async () => {
			const tarFile = fs.readFileSync(
				path.join(__dirname, "empty.tar"),
				{ encoding: "base64" },
			);
			const bfs = await fromTar(Buffer.from(tarFile, "base64"), loggers);
			expect(bfs.byteLength()).toBeGreaterThan(0);
			expect(bfs.size()).toBe(0);
		});
		it("should create FS from non-empty Tar", async () => {
			const tarFile = fs.readFileSync(
				path.join(__dirname, "min.tar"),
				{ encoding: "base64" },
			);
			const bfs = await fromTar(Buffer.from(tarFile, "base64"), loggers);
			expect(bfs.byteLength()).toBeGreaterThan(0);
			expect(bfs.size()).toBe(1);
			expect(bfs.readFile("min")).toBe("test");
		});
	});
	describe("require", () => {
		let bfs: BFS;

		beforeAll(async () => {
			if (fs.existsSync("test/modules.tar")) {
				fs.unlinkSync("test/modules.tar");
			}
			execSync("cd test && tar cvf modules.tar modules/*");
			logger.debug("Test tar generated.");

			const tarFile = fs.readFileSync(
				path.join(__dirname, "modules.tar"),
				{ encoding: "base64" },
			);
			bfs = await fromTar(Buffer.from(tarFile, "base64"), loggers);
			bfs.basedir("modules");
		});

		it("should require 'fs'", () => {
			expect(bfs.require("fs")).toBe(fs);
		});
		it("should require './'", () => {
			expect(bfs.require("./")).toBe("donkey");
		});
		it("should require './nested/index.js'", () => {
			expect(bfs.require("./nested/index.js")).toBe("nested");
		});
		it("should require './nested.js'", () => {
			expect(bfs.require("./nested.js")).toBe("nested");
		});
		it("should require 'custommodule'", () => {
			expect(bfs.require("custommodule")).toBe("required from node_modules!");
		});
		it("should require './nested/deep/index.js'", () => {
			expect(bfs.require("./nested/deep/index.js"))
				.toMatchObject({ deepModule: ["a"], nestedModule: "nested" });
		});
		it("should fail to require './nested/deep/noop.js'", () => {
			expect(() => bfs.require("./nested/deep/noop.js")).toThrowError(/ENOENT/);
		});
	});
});
