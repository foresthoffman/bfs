import * as path from "path";
import * as tarStream from "tar-stream";

// TODO: Might consider adding a cache of sorts to speed up the
// recursive requirements. This may be complicated by version
// constraints.

// tslint:disable-next-line
const __require = module.require;

/**
 * Buffered File System (BFS)
 *
 * A file system (FS) created from a Buffer. Supports reading
 * files and requiring native JavaScript modules from the FS
 * without reading or writing to disc.
 */
export class BFS {
	private providedModules: { [name: string]: any } = {};
	private readonly logger: ILogger = new Logger();

	public constructor(
		private readonly reader: IBFSReader,
		logger?: ILogger,
	) {
		if (!logger) {
			return;
		}
		this.logger = logger;
	}

	public byteLength(): number {
		return this.reader.data.byteLength;
	}

	public size(): number {
		try {
			return this.readFiles(new RegExp(/.*/, "g")).length;
		} catch (ex) {
			if (!ex.message.includes("ENOENT")) {
				throw ex;
			}

			return 0;
		}
	}

	/**
	 * Reads contents of the file at the provided path,
	 * relative to the root of the FS.
	 */
	public readFile(file: string | RegExp): string {
		return this.readFiles(file)[0];
	}

	/**
	 * Reads contents of the files at the provided path,
	 * relative to the root of the FS.
	 *
	 * Root relative paths will default to the index.js file in
	 * the corresponding directory.
	 */
	public readFiles(file: string | RegExp): string[] {
		if (typeof file === "string"
			&& file === "./"
			|| (file as string)[(file as string).length - 1] === "/"
		) {
			file = "./index.js";
		}
		return this.reader.read(file);
	}

	/**
	 * Recursively require a module from within the FS.
	 */
	public require(mod: string): any {
		const doRequire = (modPath: string): any => {
			const currentDir = path.dirname(modPath);
			this.logger.debug("Executing doRequire...",
				{
					currentDir,
					modPath,
				});

			// tslint:disable-next-line
			var require = (id: string): any => {
				this.logger.debug("Requiring module...", { module: id });

				// The string literal "./" must be prepended
				// when using `path.join` otherwise the prefix
				// will be trimmed.
				let prefix = "";
				if (id.slice(0, 2) === "./" || id.slice(0, 3) === "../") {
					prefix = "./";
				}
				id = path.join(currentDir !== "./" ? currentDir : "", id);

				return this.require(`${prefix}${id}`);
			};

			// Module path isn't relative, so maybe require the
			// module natively.
			if (modPath.slice(0, 2) !== "./"
				&& modPath.slice(0, 3) !== "../"
				&& modPath.slice(modPath.length - 1) !== "/"
			) {
				try {
					this.logger.debug("Requiring native module...", { module: modPath });
					return __require(modPath);
				} catch (ex) {
					this.logger.error("Failed to natively require module",
						{
							exception: ex,
							path: modPath,
						});
					if (ex.code !== "MODULE_NOT_FOUND") {
						throw ex;
					}

					return doRequire(`./${path.join(path.dirname(modPath), "node_modules", path.basename(modPath))}`);
				}
			}

			// Maybe require the module from the FS.
			try {
				this.logger.debug("Attempting to read file as is...", { path: modPath });
				const file = this.readFile(modPath);

				// tslint:disable-next-line
				return eval(file);
			} catch (ex) {
				this.logger.error("Failed to require module from FS",
					{
						exception: ex.message,
						path: modPath,
					});
				if (modPath.slice(modPath.length - 3) === ".js" || modPath.slice(modPath.length - 5) === ".json") {
					throw ex;
				}
			}

			// Maybe require the module from the FS, as a JS file.
			try {
				this.logger.debug("Attempting to read file as JS...", { path: modPath });
				const file = this.readFile(`./${modPath}.js`);

				// tslint:disable-next-line
				return eval(file);
			} catch (ex) {
				this.logger.error("Failed to require module from FS as JS",
					{
						exception: ex.message,
						path: `./${modPath}.js`,
					});
				if (!ex.message.includes("ENOENT")) {
					throw ex;
				}
			}

			// Maybe require the module from the FS, using the
			// module's package.json.
			try {
				this.logger.debug("Attempting to read file from package.json...", { path: modPath });
				const config = this.readFile(`./${path.join(modPath, "package.json")}`);
				const parsedConfig = JSON.parse(config);
				let mainPath = "index.js";
				if (parsedConfig.main) {
					mainPath = parsedConfig.main.slice(parsedConfig.main.length - 3) !== ".js"
						? `${parsedConfig.main}.js`
						: parsedConfig.main;
				}
				const file = this.readFile(`./${path.join(modPath, mainPath)}`);
				if (!this.reader.basedir) {
					this.basedir(path.dirname(path.join(modPath, mainPath)));
				}

				// tslint:disable-next-line
				return eval(file);
			} catch (ex) {
				this.logger.error("Failed to require module from package.json",
					{
						exception: ex.message,
						path: `./${path.join(modPath, "package.json")}`,
					});
				throw ex;
			}
		};

		// Maybe use a provided module.
		if (typeof this.providedModules[mod] !== "undefined") {
			this.logger.debug("Providing module...",
				{
					name: mod,
					value: this.providedModules[mod],
				});

			return this.providedModules[mod];
		}

		return doRequire(mod);
	}

	/**
	 * Provide a named module for the FS to use when the named
	 * module is required from within the FS.
	 *
	 * This is particularly useful to mocking out modules that
	 * may not exist or be fully-compatible on the host
	 * platform.
	 */
	public provide(name: string, mod: any): void {
		if (typeof this.providedModules[name] !== "undefined") {
			return;
		}
		this.providedModules[name] = mod;
	}

	/**
	 * Set the base directory from which to read files and
	 * require modules.
	 */
	public basedir(dir: string): void {
		dir = dir.trim();
		if (dir.length === 0) {
			throw new Error("Custom basedir must not be empty");
		}
		if (dir.slice(0, 2) !== "./") {
			dir = `./${dir}`;
		}
		if (dir[dir.length - 1] === "/") {
			dir = dir.slice(0, dir.length - 1);
		}
		this.reader.basedir = dir;
	}
}

export const fromTar = async (tar: Buffer, logger?: ILogger): Promise<BFS> => {
	const reader = new TarReader(tar);
	await reader.init();

	return new BFS(reader, logger);
};

// Represent a generic logging function.
export type LoggerFunc = (message: string, data?: { [key: string]: any }) => void;

interface ILogger {
	debug: LoggerFunc;
	error: LoggerFunc;
	info: LoggerFunc;
}

/**
 * Wrapper class for optional logger functionality. Prevents
 * the BFS and BFSReader classes from having to handle default
 * implementations.
 */
class Logger implements ILogger {
	private readonly debugFunc?: LoggerFunc;
	private readonly errorFunc?: LoggerFunc;
	private readonly infoFunc?: LoggerFunc;

	public constructor(args?: {
		debug?: LoggerFunc,
		error?: LoggerFunc,
		info?: LoggerFunc,
	}) {
		if (!args) {
			return;
		}
		this.debugFunc = args.debug;
		this.errorFunc = args.error;
		this.infoFunc = args.info;
	}

	public debug(message: string, data?: { [key: string]: any }): void {
		if (!this.debugFunc) {
			return;
		}
		this.debugFunc(message, data);
	}

	public error(message: string, data?: { [key: string]: any }): void {
		if (!this.errorFunc) {
			return;
		}
		this.errorFunc(message, data);
	}

	public info(message: string, data?: { [key: string]: any }): void {
		if (!this.infoFunc) {
			return;
		}
		this.infoFunc(message, data);
	}
}

interface IBFSReader {
	data: Buffer;
	basedir?: string;
	read(file: string | RegExp): string[];
}

class TarReader implements IBFSReader {
	public basedir: string = "";
	private fileContents: { [file: string]: Buffer[] } = {};
	private readonly logger: ILogger = new Logger();

	public constructor(
		public readonly data: Buffer,
		logger?: ILogger,
	) {
		if (!logger) {
			return;
		}
		this.logger = logger;
	}

	public async init(): Promise<void> {
		return new Promise<void>((res, rej) => {
			if (Object.keys(this.fileContents).length !== 0) {
				this.logger.debug("TarReader all ready initialized",
					{ fileContents: JSON.stringify(this.fileContents) });
				res();

				return;
			}

			// Copy the buffer just for reading.
			const buf = new Uint8Array(this.data.length);
			this.data.copy(buf, 0, 0, this.data.length);

			const extractor = tarStream.extract();
			extractor.once("error", (err) => {
				rej(err);
			});
			extractor.on("entry", (header, stream, next) => {
				const name: string = header.name;
				if (name.endsWith("/")) {
					stream.resume();
					next();

					return;
				}
				const fileData: Buffer[] = [];
				stream.on("data", (data) => fileData.push(data));
				stream.on("end", () => {
					if (fileData.length > 0) {
						if (!this.fileContents[name]) {
							this.fileContents[name] = [];
						}
						this.fileContents[name].push(Buffer.concat(fileData));
					}

					next();
				});
				stream.resume();
			});
			extractor.once("finish", () => {
				res();
			});
			extractor.write(buf);
			extractor.end();
		});
	}

	public read(file: string | RegExp): string[] {
		if (typeof file === "string") {
			if (this.basedir) {
				file = path.join(this.basedir, file);
			}
			while (file.slice(0, 2) === "./") {
				this.logger.debug("Slicing relative file path...", { file });
				file = file.slice(2);
			}
		}
		this.logger.debug("Reading file...", { file });

		let matches = 0;
		const contentArr: string[] = [];
		const contentKeys = Object.keys(this.fileContents);
		for (let i = 0; i < contentKeys.length; i++) {
			if ((file instanceof RegExp && file.exec(contentKeys[i])) || file === contentKeys[i]) {
				matches++;
				contentArr.push(Buffer.concat(this.fileContents[contentKeys[i]]).toString());

				// If it's an exact match, there's no reason to
				// continue searching.
				if (file === contentKeys[i]) {
					break;
				}
			}
		}

		this.logger.debug("Done reading file",
			{
				contentArr: contentArr.join("").length,
				file,
				matches,
			});
		if (!matches) {
			throw new Error(`ENOENT: ${file}`);
		}
		this.logger.debug("Returning file contents...",
			{ file });

		return contentArr;
	}
}
