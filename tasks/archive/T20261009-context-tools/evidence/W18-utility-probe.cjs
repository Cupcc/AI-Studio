var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tasks/archive/T20261009-context-tools/evidence/W18-utility-probe.ts
var import_electron = require("electron");
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path3 = require("node:path");

// apps/desktop/src/main/services/files/directory-reader.ts
var import_node_child_process = require("node:child_process");
var import_node_path = require("node:path");

// apps/desktop/src/shared/tools/files.ts
var FILES_LIMITS = {
  pathBytes: 1024,
  /** APFS allows 255 characters per name, up to four UTF-8 bytes each. */
  nameBytes: 1020,
  /** One directory listing; the tree is not virtualized. A node_modules root can exceed this. */
  listEntries: 2e3,
  /** Largest text file read into the viewer (bounded IPC clone, main-thread Monaco). */
  readBytes: 1048576,
  /** Same NUL-byte window as Git's binary heuristic. */
  binarySniffBytes: 8e3,
  referencesPerMessage: 20,
  /** Above this many directories a change event degrades to `overflow: true`. */
  eventDirectories: 256,
  watcherDebounceMs: 150,
  watcherMaxWaitMs: 1e3,
  unsubscribeGraceMs: 3e4
};
var encoder = new TextEncoder();
var LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
var CONTROL = /[\u0000-\u001F\u007F\u0085\u2028\u2029]/;
function parseProjectPath(value) {
  if (typeof value !== "string") throw new Error("invalid path: not a string");
  if (value === "") return "";
  if (value.includes("\0")) throw new Error("invalid path: NUL");
  if (LONE_SURROGATE.test(value)) throw new Error("invalid path: not well-formed text");
  if (encoder.encode(value).length > FILES_LIMITS.pathBytes) throw new Error("invalid path: too long");
  if (value.startsWith("/")) throw new Error("invalid path: absolute");
  if (value.endsWith("/")) throw new Error("invalid path: trailing slash");
  for (const segment of value.split("/")) {
    if (segment === "") throw new Error("invalid path: empty segment");
    if (segment === "." || segment === "..") throw new Error("invalid path: relative segment");
    if (encoder.encode(segment).length > FILES_LIMITS.nameBytes) throw new Error("invalid path: name too long");
  }
  return value;
}
function isReferenceablePath(path) {
  try {
    parseProjectPath(path);
  } catch {
    return false;
  }
  return path !== "" && !CONTROL.test(path);
}
var FILES_WATCH_IGNORED = { anywhere: [".git"], belowFirstLevel: ["node_modules"] };

// apps/desktop/src/main/services/files/directory-reader-worker.ts
async function directoryReaderWorker(raw) {
  const fs = process.getBuiltinModule("node:fs/promises");
  const send = (value) => {
    const serialized = JSON.stringify(value);
    if (process.parentPort) {
      process.parentPort.once("message", () => process.exit(0));
      process.parentPort.postMessage(serialized);
    } else process.stdout.write(serialized, () => process.exit(0));
  };
  const reason = (error) => {
    switch (error?.code) {
      case "ENOENT":
      case "ENOTDIR":
      case "ENAMETOOLONG":
        return "missing";
      case "ELOOP":
        return "symlink_refused";
      case "EACCES":
      case "EPERM":
        return "permission_denied";
      default:
        return "unreadable";
    }
  };
  try {
    const request = JSON.parse(raw);
    const cwd = await fs.stat(".", { bigint: true });
    if (!cwd.isDirectory() || cwd.dev.toString() !== request.dev || cwd.ino.toString() !== request.ino) {
      send("changed");
      return;
    }
    const collator = new Intl.Collator(request.locale, { numeric: true });
    const compare = (a, b) => {
      const kind = Number(b.kind === "directory") - Number(a.kind === "directory");
      return kind || collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    };
    const entries = [];
    let count = 0, omittedPaths = false;
    const keep = (entry) => {
      count++;
      if (request.limit === 0) return;
      if (entries.length < request.limit) {
        entries.push(entry);
        for (let at = entries.length - 1; at > 0; ) {
          const parent = at - 1 >> 1;
          if (compare(entries[parent], entries[at]) >= 0) break;
          [entries[parent], entries[at]] = [entries[at], entries[parent]];
          at = parent;
        }
      } else if (compare(entry, entries[0]) < 0) {
        entries[0] = entry;
        for (let at = 0; ; ) {
          const left = at * 2 + 1, right = left + 1;
          if (left >= entries.length) break;
          const larger = right < entries.length && compare(entries[right], entries[left]) > 0 ? right : left;
          if (compare(entries[at], entries[larger]) >= 0) break;
          [entries[at], entries[larger]] = [entries[larger], entries[at]];
          at = larger;
        }
      }
    };
    const wellFormed = (name) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name);
    const directory = await fs.opendir(".");
    try {
      for await (const dirent of directory) {
        const name = dirent.name;
        if (name.toLowerCase() === ".git") continue;
        const relative = request.path === "" ? name : `${request.path}/${name}`;
        if (!wellFormed(name) || name.includes("/") || name.includes("\0") || Buffer.byteLength(name) > request.nameBytes || Buffer.byteLength(relative) > request.pathBytes || request.darwin && Buffer.byteLength(`${request.absolute}/${name}`) >= 1024) {
          omittedPaths = true;
          continue;
        }
        let kind;
        if (dirent.isDirectory()) kind = "directory";
        else if (dirent.isFile()) kind = "file";
        else if (dirent.isSymbolicLink()) kind = "symlink";
        else if (dirent.isBlockDevice() || dirent.isCharacterDevice() || dirent.isFIFO() || dirent.isSocket()) kind = "other";
        else {
          try {
            const stats = await fs.lstat(`./${name}`);
            kind = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : stats.isSymbolicLink() ? "symlink" : "other";
          } catch (error) {
            if (error.code === "ENOENT") continue;
            throw error;
          }
        }
        keep({ name, kind });
      }
    } finally {
      await directory.close().catch(() => {
      });
    }
    entries.sort(compare);
    for (const entry of entries) {
      if (entry.kind !== "symlink") continue;
      try {
        entry.linkTarget = (await fs.readlink(`./${entry.name}`)).slice(0, 256);
      } catch {
      }
    }
    send({ ok: true, entries, truncated: count > request.limit, ...omittedPaths ? { omittedPaths: true } : {} });
  } catch (error) {
    send({ ok: false, reason: reason(error) });
  }
}
var workerFlag = process.argv.indexOf("--studio-directory-reader-worker");
if (process.type === "utility" && workerFlag >= 0) void directoryReaderWorker(process.argv[workerFlag + 1] ?? "");

// apps/desktop/src/main/services/files/directory-reader.ts
var OUTPUT_LIMIT = 12 * 1024 * 1024;
async function readAnchoredDirectory(absolute, expected, options) {
  if (options.shouldStop?.()) return { ok: false, reason: "timeout" };
  const request = JSON.stringify({
    dev: expected.dev.toString(),
    ino: expected.ino.toString(),
    absolute,
    path: options.path,
    limit: Math.max(0, Math.min(FILES_LIMITS.listEntries, Math.trunc(options.limit ?? FILES_LIMITS.listEntries))),
    ...options.locale ? { locale: options.locale } : {},
    pathBytes: FILES_LIMITS.pathBytes,
    nameBytes: FILES_LIMITS.nameBytes,
    darwin: process.platform === "darwin"
  });
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.ELECTRON_RUN_AS_NODE;
  let child;
  let utility = false;
  try {
    if (process.versions.electron) {
      const { utilityProcess: utilityProcess2 } = await import("electron");
      if (options.shouldStop?.()) return { ok: false, reason: "timeout" };
      utility = true;
      child = utilityProcess2.fork((0, import_node_path.join)("/Users/Chris/Projects/AI Stduio.worktrees/files-diff/apps/desktop/out/main", "directory-reader-worker.js"), ["--studio-directory-reader-worker", request], {
        cwd: absolute,
        env,
        stdio: "ignore",
        serviceName: "Files directory reader"
      });
    } else {
      child = (0, import_node_child_process.spawn)(process.execPath, ["-e", `(${directoryReaderWorker.toString()})(process.argv[1])`, request], {
        cwd: absolute,
        env,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  let stopped = false, overflow = false;
  const stop2 = () => {
    stopped = true;
    try {
      if (child.pid) process.kill(child.pid, "SIGKILL");
      else child.kill();
    } catch {
    }
  };
  child.once("spawn", () => {
    if (stopped) stop2();
  });
  const chunks = [];
  let bytes = 0;
  const append = (value) => {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > OUTPUT_LIMIT) {
      overflow = true;
      stop2();
      return;
    }
    if (!stopped) chunks.push(chunk);
  };
  if (utility) child.once("message", (value) => {
    append(value);
    if (!stopped) child.postMessage?.("received");
  });
  else child.stdout?.on("data", append);
  const timer = setTimeout(stop2, 5e3);
  const poll = options.shouldStop ? setInterval(() => {
    if (options.shouldStop?.()) stop2();
  }, 20) : void 0;
  const code = await new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    child.once(utility ? "exit" : "close", (value) => done(value ?? -1));
    child.once("error", () => {
      if (!utility) done(-1);
    });
  });
  clearTimeout(timer);
  clearInterval(poll);
  if (stopped || options.shouldStop?.()) return { ok: false, reason: overflow ? "unreadable" : "timeout" };
  if (code !== 0) return { ok: false, reason: "unreadable" };
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

// apps/desktop/src/main/services/files/safe-path.ts
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path2 = require("node:path");
var O_NOFOLLOW_ANY = 536870912;
var NONBLOCKING_READ = import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NONBLOCK;
var darwinNoFollowAny = process.platform === "darwin";
function isExcludedName(name) {
  return FILES_WATCH_IGNORED.anywhere.some((item) => name.length === item.length && name.toLowerCase() === item);
}
function hasExcludedSegment(segments) {
  return segments.some(isExcludedName);
}
function classifyError(error, fallback = "unreadable") {
  switch (error?.code) {
    case "ENOENT":
    case "ENOTDIR":
    case "ENAMETOOLONG":
      return "missing";
    case "ELOOP":
      return "symlink_refused";
    case "EACCES":
    case "EPERM":
      return "permission_denied";
    default:
      return fallback;
  }
}
function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
async function rootIsCanonical(root2) {
  try {
    if (await (0, import_promises.realpath)(root2) !== root2) return false;
    return (await (0, import_promises.lstat)(root2)).isDirectory();
  } catch {
    return false;
  }
}
function inside(root2, real) {
  const prefix = root2.endsWith(import_node_path2.sep) ? root2 : root2 + import_node_path2.sep;
  return real === root2 || real.startsWith(prefix);
}
async function resolveEntry(root2, path, expect) {
  const segments = path === "" ? [] : path.split("/");
  if (hasExcludedSegment(segments)) return { ok: false, reason: "excluded" };
  if (!await rootIsCanonical(root2)) return { ok: false, reason: "project_unavailable" };
  let current = root2;
  let stats;
  try {
    stats = await (0, import_promises.lstat)(root2, { bigint: true });
    for (let index = 0; index < segments.length; index++) {
      current = (0, import_node_path2.join)(current, segments[index]);
      stats = await (0, import_promises.lstat)(current, { bigint: true });
      if (stats.isSymbolicLink()) return { ok: false, reason: "symlink_refused" };
      if (index < segments.length - 1 && !stats.isDirectory()) return { ok: false, reason: "missing" };
    }
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
  if (expect === "directory" && !stats.isDirectory()) return { ok: false, reason: "not_directory" };
  if (expect === "file" && !stats.isFile()) return { ok: false, reason: "not_file" };
  let real;
  try {
    real = await (0, import_promises.realpath)(current);
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
  if (!inside(root2, real)) return { ok: false, reason: "symlink_refused" };
  if (real !== root2 && hasExcludedSegment(real.slice(root2.endsWith(import_node_path2.sep) ? root2.length : root2.length + 1).split(import_node_path2.sep))) {
    return { ok: false, reason: "excluded" };
  }
  return { ok: true, value: { absolute: current, real, stats } };
}
async function openNoFollow(absolute) {
  if (darwinNoFollowAny) {
    try {
      return await (0, import_promises.open)(absolute, NONBLOCKING_READ | O_NOFOLLOW_ANY);
    } catch (error) {
      if (error.code !== "EINVAL") throw error;
      darwinNoFollowAny = false;
    }
  }
  return (0, import_promises.open)(absolute, NONBLOCKING_READ | import_node_fs.constants.O_NOFOLLOW);
}
async function openRegularFile(root2, path) {
  const resolved = await resolveEntry(root2, path, "file");
  if (!resolved.ok) return resolved;
  let handle;
  try {
    handle = await openNoFollow(resolved.value.absolute);
  } catch (error) {
    const code = error.code;
    return { ok: false, reason: code === "ENXIO" ? "not_file" : classifyError(error) };
  }
  try {
    const stats = await handle.stat({ bigint: true });
    if (!stats.isFile()) {
      await handle.close();
      return { ok: false, reason: "not_file" };
    }
    if (!sameIdentity(stats, resolved.value.stats)) {
      await handle.close();
      return { ok: false, reason: "changed" };
    }
    return { ok: true, file: { handle, stats, entry: resolved.value } };
  } catch (error) {
    await handle.close().catch(() => {
    });
    return { ok: false, reason: classifyError(error) };
  }
}

// apps/desktop/src/main/services/files/list.ts
async function listDirectory(root2, path, options = {}) {
  for (let attempt2 = 0; attempt2 < 2; attempt2++) {
    if (options.shouldStop?.()) return { ok: false, reason: "timeout" };
    const before = await resolveEntry(root2, path, "directory");
    if (!before.ok) return before;
    let handle;
    try {
      handle = await openNoFollow(before.value.absolute);
      const opened = await handle.stat({ bigint: true });
      if (!opened.isDirectory()) return { ok: false, reason: "not_directory" };
      if (!sameIdentity(opened, before.value.stats)) continue;
      await options.afterOpen?.(before.value.absolute);
      const read = await readAnchoredDirectory(before.value.absolute, opened, {
        path,
        ...options.limit === void 0 ? {} : { limit: options.limit },
        ...options.locale === void 0 ? {} : { locale: options.locale },
        ...options.shouldStop ? { shouldStop: options.shouldStop } : {}
      });
      if (read === "changed") continue;
      if (!read.ok) return read;
      const after = await resolveEntry(root2, path, "directory");
      if (!after.ok || !sameIdentity(opened, after.value.stats)) continue;
      return read;
    } catch (error) {
      return { ok: false, reason: classifyError(error) };
    } finally {
      await handle?.close().catch(() => {
      });
    }
  }
  return { ok: false, reason: "unreadable" };
}

// apps/desktop/src/main/services/files/read.ts
var MAX_ATTEMPTS = 3;
function fileVersion(stats) {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
}
var unavailable = (reason, size) => size === void 0 ? { status: "unavailable", reason } : { status: "unavailable", reason, size };
function fromFailure(reason) {
  return reason === "changed" ? "retry" : unavailable(reason);
}
async function readInto(handle, capacity, shouldStop) {
  const bytes = Buffer.allocUnsafe(capacity);
  let length = 0;
  while (length < capacity) {
    if (shouldStop?.()) return "stopped";
    const { bytesRead } = await handle.read(bytes, length, capacity - length, length);
    if (bytesRead === 0) break;
    length += bytesRead;
  }
  return bytes.subarray(0, length);
}
function lineEnding(text) {
  let crlf = 0, lf = 0, cr = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) {
        crlf++;
        index++;
      } else cr++;
    } else if (code === 10) lf++;
  }
  if (cr > 0 || crlf > 0 && lf > 0) return "mixed";
  return crlf > 0 ? "crlf" : lf > 0 ? "lf" : "none";
}
function decodeText(bytes) {
  const decode = (label, start) => {
    try {
      return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start));
    } catch {
      return null;
    }
  };
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) {
    if (bytes.length >= 4 && bytes[2] === 0 && bytes[3] === 0) return { ok: false, reason: "unsupported_encoding" };
    const text2 = decode("utf-16le", 2);
    return text2 === null ? { ok: false, reason: "unsupported_encoding" } : { ok: true, encoding: "utf-16le", bom: true, text: text2 };
  }
  if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) {
    const text2 = decode("utf-16be", 2);
    return text2 === null ? { ok: false, reason: "unsupported_encoding" } : { ok: true, encoding: "utf-16be", bom: true, text: text2 };
  }
  if (bytes.includes(0)) return { ok: false, reason: "binary" };
  const bom = bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191;
  const text = decode("utf-8", bom ? 3 : 0);
  return text === null ? { ok: false, reason: "unsupported_encoding" } : { ok: true, encoding: "utf-8", bom, text };
}
async function attempt(root2, path, ifVersion, options) {
  const opened = await openRegularFile(root2, path);
  if (!opened.ok) return fromFailure(opened.reason);
  const { handle, stats: before, entry } = opened.file;
  try {
    await options.afterOpen?.(entry.absolute);
    const version = fileVersion(before);
    const cap = options.readBytes ?? FILES_LIMITS.readBytes;
    const size = Number(before.size);
    let outcome;
    if (ifVersion !== void 0 && ifVersion === version) {
      outcome = { status: "unchanged", version };
    } else if (before.size > BigInt(cap)) {
      const head = await readInto(handle, Math.min(size, FILES_LIMITS.binarySniffBytes), options.shouldStop);
      if (head === "stopped") return unavailable("timeout");
      const utf16 = head.length >= 2 && (head[0] === 255 && head[1] === 254 || head[0] === 254 && head[1] === 255);
      outcome = unavailable(head.includes(0) && !utf16 ? "binary" : "too_large", size);
    } else {
      const bytes = await readInto(handle, size + 1, options.shouldStop);
      if (bytes === "stopped") return unavailable("timeout");
      await options.afterRead?.(entry.absolute);
      if (bytes.length !== size) return "retry";
      const decoded = decodeText(bytes);
      outcome = decoded.ok ? { status: "ok", version, size, encoding: decoded.encoding, bom: decoded.bom, lineEnding: lineEnding(decoded.text), text: decoded.text } : unavailable(decoded.reason, size);
    }
    const after = await handle.stat({ bigint: true });
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || !sameIdentity(after, before)) return "retry";
    const again = await resolveEntry(root2, path, "file");
    if (!again.ok) return unavailable(again.reason);
    if (!sameIdentity(again.value.stats, before)) return "retry";
    return outcome;
  } finally {
    await handle.close().catch(() => {
    });
  }
}
async function readTextFile(root2, path, ifVersion, options = {}) {
  for (let tries = 0; tries < MAX_ATTEMPTS; tries++) {
    const result = await attempt(root2, path, ifVersion, options);
    if (result !== "retry") return result;
  }
  return unavailable("changed_while_reading");
}

// apps/desktop/src/main/services/files/references.ts
function failureReason(reason) {
  return reason === "not_directory" || reason === "changed" ? "unreadable" : reason;
}
async function inspect(root2, path) {
  try {
    parseProjectPath(path);
  } catch {
    return { ok: false, reason: "invalid_path" };
  }
  if (path === "") return { ok: false, reason: "not_file" };
  if (!isReferenceablePath(path)) return { ok: false, reason: "name_unsupported" };
  for (let attempt2 = 0; attempt2 < 2; attempt2++) {
    const opened = await openRegularFile(root2, path);
    if (!opened.ok) {
      if (opened.reason === "changed") continue;
      return { ok: false, reason: failureReason(opened.reason) };
    }
    const { handle, stats, entry } = opened.file;
    await handle.close().catch(() => {
    });
    return {
      ok: true,
      file: {
        path,
        name: path.slice(path.lastIndexOf("/") + 1),
        size: Number(stats.size),
        version: fileVersion(stats),
        absolutePath: entry.real
      }
    };
  }
  return { ok: false, reason: "unreadable" };
}
async function resolveFileReferences(root2, paths, shouldStop) {
  const failures = [];
  const files = [];
  const seenSpelling = /* @__PURE__ */ new Set();
  const seenReal = /* @__PURE__ */ new Set();
  let accepted = 0;
  for (const path of paths) {
    const spelling = typeof path === "string" ? path.normalize("NFC") : path;
    if (seenSpelling.has(spelling)) continue;
    seenSpelling.add(spelling);
    if (++accepted > FILES_LIMITS.referencesPerMessage) {
      failures.push({ path, reason: "too_many" });
      continue;
    }
    if (shouldStop?.()) {
      failures.push({ path, reason: "timeout" });
      continue;
    }
    const result = await inspect(root2, path);
    if (!result.ok) {
      failures.push({ path, reason: result.reason });
      continue;
    }
    if (seenReal.has(result.file.absolutePath)) continue;
    seenReal.add(result.file.absolutePath);
    files.push(result.file);
  }
  return failures.length ? { status: "rejected", failures } : { status: "ok", files };
}
function rejectAll(paths, reason) {
  const failures = [...new Set(paths)].map((path) => ({ path, reason }));
  return { status: "rejected", failures };
}

// apps/desktop/src/main/services/files/watcher.ts
var import_node_crypto = require("node:crypto");
var import_node_fs2 = require("node:fs");
var MAX_LIVE_WATCHERS = 4;
var OVERFLOW_INTERVAL_MS = 1e3;
var defaultWatch = (path, options, listener) => (0, import_node_fs2.watch)(path, options, listener);
function isIgnoredWatchPath(relativePath) {
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (isExcludedName(segment)) return true;
    if (segments.length > index + 2 && FILES_WATCH_IGNORED.belowFirstLevel.some((name) => name === segment)) return true;
  }
  return false;
}
function createFilesWatcher(options) {
  const projects = /* @__PURE__ */ new Map();
  const owners = /* @__PURE__ */ new Map();
  const watch = options.watch ?? defaultWatch;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? import_node_crypto.randomUUID;
  const debounceMs = options.debounceMs ?? FILES_LIMITS.watcherDebounceMs;
  const maxWaitMs = options.maxWaitMs ?? FILES_LIMITS.watcherMaxWaitMs;
  const graceMs = options.graceMs ?? FILES_LIMITS.unsubscribeGraceMs;
  const maxWatchers = options.maxWatchers ?? MAX_LIVE_WATCHERS;
  let closed = false;
  const liveCount = () => [...projects.values()].filter((state) => state.handle).length;
  const announce = (state) => options.watchChanged({ projectId: state.projectId, revision: options.nextRevision(), watch: state.status });
  function trackOwner(owner) {
    const known = owners.get(owner);
    if (known) {
      known.count++;
      return;
    }
    const release = options.watchOwner?.(owner, () => detachOwner(owner)) ?? (() => {
    });
    owners.set(owner, { count: 1, release });
  }
  function untrackOwner(owner) {
    const known = owners.get(owner);
    if (!known) return;
    if (--known.count > 0) return;
    owners.delete(owner);
    known.release();
  }
  function emit(state) {
    const { projectId } = state;
    if (state.overflow) {
      state.overflow = false;
      state.dirs.clear();
      state.lastOverflowAt = now();
      options.changed({ projectId, revision: options.nextRevision(), dirs: [], overflow: true });
    } else if (state.dirs.size) {
      const dirs = [...state.dirs].sort();
      state.dirs.clear();
      options.changed({ projectId, revision: options.nextRevision(), dirs, overflow: false });
    }
  }
  function flush(state) {
    state.timer = void 0;
    state.firstEventAt = void 0;
    if (!state.subscriptions.size) {
      state.dirs.clear();
      state.overflow = false;
      return;
    }
    if (state.overflow) {
      const wait = state.lastOverflowAt + OVERFLOW_INTERVAL_MS - now();
      if (wait > 0) {
        state.timer = setTimeout(() => flush(state), wait);
        state.timer.unref?.();
        return;
      }
    }
    emit(state);
  }
  function schedule(state) {
    const at = now();
    state.firstEventAt ??= at;
    const due = Math.min(at + debounceMs, state.firstEventAt + maxWaitMs);
    clearTimeout(state.timer);
    state.timer = setTimeout(() => flush(state), Math.max(0, due - at));
    state.timer.unref?.();
  }
  function onEvent(state, filename) {
    if (projects.get(state.projectId) !== state || !state.handle || !state.subscriptions.size) return;
    const path = filename === null || filename === void 0 ? "" : typeof filename === "string" ? filename : filename.toString("utf8");
    if (path === "") state.overflow = true;
    else if (isIgnoredWatchPath(path)) return;
    else if (!state.overflow) {
      const slash = path.lastIndexOf("/");
      state.dirs.add(slash < 0 ? "" : path.slice(0, slash));
      if (state.dirs.size > FILES_LIMITS.eventDirectories) {
        state.overflow = true;
        state.dirs.clear();
      }
    }
    schedule(state);
  }
  function stopHandle(state) {
    const handle = state.handle;
    state.handle = null;
    try {
      handle?.close();
    } catch {
    }
  }
  function onError(state) {
    if (projects.get(state.projectId) !== state || !state.handle) return;
    stopHandle(state);
    state.status = "degraded";
    state.degradedBy = "error";
    announce(state);
    clearTimeout(state.timer);
    state.timer = void 0;
    if (state.subscriptions.size) {
      state.overflow = true;
      emit(state);
    }
    fillSlots();
  }
  function ensureWatcher(state) {
    if (state.handle) return;
    if (liveCount() >= maxWatchers) {
      for (const other of [...projects.values()]) {
        if (liveCount() < maxWatchers) break;
        if (other !== state && other.handle && !other.subscriptions.size) closeState(other, false);
      }
    }
    if (liveCount() >= maxWatchers) {
      state.status = "degraded";
      state.degradedBy = "capacity";
      return;
    }
    try {
      const handle = watch(state.root, { recursive: true, persistent: false }, (_event, filename) => onEvent(state, filename));
      handle.on("error", () => onError(state));
      state.handle = handle;
      state.status = "live";
      state.degradedBy = void 0;
    } catch {
      state.status = "degraded";
      state.degradedBy = "error";
    }
  }
  function fillSlots() {
    for (const state of [...projects.values()]) {
      if (state.handle || state.degradedBy !== "capacity" || !state.subscriptions.size || liveCount() >= maxWatchers) continue;
      ensureWatcher(state);
      if (state.status === "live") announce(state);
    }
  }
  function closeState(state, broadcast) {
    if (projects.get(state.projectId) !== state) return;
    projects.delete(state.projectId);
    clearTimeout(state.timer);
    clearTimeout(state.grace);
    stopHandle(state);
    const had = state.subscriptions.size > 0;
    for (const subscription of state.subscriptions.values()) untrackOwner(subscription.owner);
    state.subscriptions.clear();
    state.dirs.clear();
    state.status = "stopped";
    if (broadcast && had) announce(state);
  }
  function removeSubscription(state, subscriptionId) {
    const subscription = state.subscriptions.get(subscriptionId);
    if (!subscription) return;
    state.subscriptions.delete(subscriptionId);
    untrackOwner(subscription.owner);
    if (state.subscriptions.size) return;
    clearTimeout(state.timer);
    state.timer = void 0;
    state.dirs.clear();
    state.overflow = false;
    state.grace = setTimeout(() => {
      closeState(state, false);
      fillSlots();
    }, graceMs);
    state.grace.unref?.();
  }
  function detachOwner(owner) {
    for (const state of [...projects.values()]) {
      for (const [id, subscription] of [...state.subscriptions]) if (subscription.owner === owner) removeSubscription(state, id);
    }
  }
  return {
    subscribe(projectId, owner) {
      const subscriptionId = newId();
      const revision = options.nextRevision();
      const root2 = options.projectRoot(projectId);
      if (closed || !root2 || options.canOperate?.(projectId) === false) return { projectId, subscriptionId, revision, watch: "stopped" };
      let state = projects.get(projectId);
      if (state && state.root !== root2) {
        closeState(state, true);
        state = void 0;
      }
      const fresh = !state;
      if (!state) {
        state = { projectId, root: root2, subscriptions: /* @__PURE__ */ new Map(), handle: null, status: "degraded", dirs: /* @__PURE__ */ new Set(), overflow: false, lastOverflowAt: -Infinity };
        projects.set(projectId, state);
      }
      clearTimeout(state.grace);
      state.grace = void 0;
      state.subscriptions.set(subscriptionId, { owner });
      trackOwner(owner);
      const before = state.status;
      ensureWatcher(state);
      if (!fresh && state.status !== before) announce(state);
      return { projectId, subscriptionId, revision, watch: state.status };
    },
    unsubscribe(projectId, subscriptionId, owner) {
      const state = projects.get(projectId);
      if (!state || state.subscriptions.get(subscriptionId)?.owner !== owner) return;
      removeSubscription(state, subscriptionId);
    },
    detachOwner,
    closeProject(projectId) {
      const state = projects.get(projectId);
      if (!state) return;
      closeState(state, true);
      fillSlots();
    },
    closeAll() {
      for (const state of [...projects.values()]) closeState(state, true);
    },
    dispose() {
      closed = true;
      for (const state of [...projects.values()]) closeState(state, true);
    },
    liveCount
  };
}

// apps/desktop/src/main/services/files/service.ts
var FILES_REQUEST_TIMEOUT_MS = 5e3;
var FILES_CONCURRENCY = 3;
function createLimiter(max) {
  let active = 0;
  const waiting = [];
  return async (task) => {
    if (active < max) active++;
    else await new Promise((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
function createFilesService(options) {
  let revision = 0;
  let disposed = false;
  let allEpoch = 0;
  const epochs = /* @__PURE__ */ new Map();
  const timeoutMs = options.timeoutMs ?? FILES_REQUEST_TIMEOUT_MS;
  const limited = createLimiter(options.concurrency ?? FILES_CONCURRENCY);
  const nextRevision = () => ++revision;
  const watcher = createFilesWatcher({
    projectRoot: options.projectRoot,
    nextRevision,
    changed: options.changed,
    watchChanged: options.watchChanged,
    ...options.canOperate ? { canOperate: options.canOperate } : {},
    ...options.watch ? { watch: options.watch } : {},
    ...options.watchOwner ? { watchOwner: options.watchOwner } : {},
    ...options.newId ? { newId: options.newId } : {}
  });
  const stampOf = (projectId) => `${allEpoch}:${epochs.get(projectId) ?? 0}`;
  function gate(projectId) {
    const root2 = options.projectRoot(projectId);
    if (!root2) return { reason: "project_unavailable" };
    if (disposed || options.canOperate?.(projectId) === false) return { reason: "project_closing" };
    return { root: root2 };
  }
  async function guarded(projectId, root2, work, fallback) {
    const stamp = stampOf(projectId);
    let stopped = false;
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        stopped = true;
        resolve(fallback.timeout);
      }, timeoutMs);
    });
    const shouldStop = () => stopped || disposed || stampOf(projectId) !== stamp || options.canOperate?.(projectId) === false;
    const task = limited(() => shouldStop() ? Promise.resolve(fallback.timeout) : work(root2, shouldStop)).catch(() => fallback.failed);
    try {
      const value = await Promise.race([task, deadline]);
      return stampOf(projectId) === stamp && !disposed ? value : fallback.closing;
    } finally {
      clearTimeout(timer);
    }
  }
  const service2 = {
    async list(projectId, path) {
      const issued = nextRevision();
      const unavailable2 = (reason) => ({ status: "unavailable", revision: issued, path, reason });
      try {
        parseProjectPath(path);
      } catch {
        return unavailable2("invalid_path");
      }
      const opened = gate(projectId);
      if ("reason" in opened) return unavailable2(opened.reason);
      const outcome = await guarded(
        projectId,
        opened.root,
        (root2, stop2) => listDirectory(root2, path, { shouldStop: stop2, ...options.locale ? { locale: options.locale } : {}, ...options.hooks?.afterListOpen ? { afterOpen: options.hooks.afterListOpen } : {} }),
        { timeout: { ok: false, reason: "timeout" }, closing: { ok: false, reason: "project_closing" }, failed: { ok: false, reason: "unreadable" } }
      );
      return outcome.ok ? { status: "ok", revision: issued, path, entries: outcome.entries, truncated: outcome.truncated, ...outcome.omittedPaths ? { omittedPaths: true } : {} } : unavailable2(outcome.reason);
    },
    async read(request) {
      const issued = nextRevision();
      const { path } = request;
      const unavailable2 = (reason) => ({ status: "unavailable", revision: issued, path, reason });
      try {
        parseProjectPath(path);
      } catch {
        return unavailable2("invalid_path");
      }
      const opened = gate(request.projectId);
      if ("reason" in opened) return unavailable2(opened.reason);
      const outcome = await guarded(
        request.projectId,
        opened.root,
        (root2, stop2) => readTextFile(root2, path, request.ifVersion, {
          shouldStop: stop2,
          ...options.hooks?.afterOpen ? { afterOpen: options.hooks.afterOpen } : {},
          ...options.hooks?.afterRead ? { afterRead: options.hooks.afterRead } : {}
        }),
        { timeout: { status: "unavailable", reason: "timeout" }, closing: { status: "unavailable", reason: "project_closing" }, failed: { status: "unavailable", reason: "unreadable" } }
      );
      return { ...outcome, revision: issued, path };
    },
    async resolve(projectId, paths) {
      if (paths.length === 0) return { status: "ok", files: [] };
      const opened = gate(projectId);
      if ("reason" in opened) return rejectAll(paths, opened.reason);
      const rejection = (reason) => rejectAll(paths, reason);
      return guarded(
        projectId,
        opened.root,
        (root2, stop2) => resolveFileReferences(root2, paths, stop2),
        { timeout: rejection("timeout"), closing: rejection("project_closing"), failed: rejection("unreadable") }
      );
    },
    async resolveReference(projectId, paths) {
      const result = await service2.resolve(projectId, paths);
      if (result.status === "rejected") return result;
      return { status: "ok", files: result.files.map(({ path, name, size, version }) => ({ path, name, size, version })) };
    },
    subscribe: (projectId, owner) => watcher.subscribe(projectId, owner),
    unsubscribe: (projectId, subscriptionId, owner) => watcher.unsubscribe(projectId, subscriptionId, owner),
    detachOwner: (owner) => watcher.detachOwner(owner),
    async closeProject(projectId) {
      epochs.set(projectId, (epochs.get(projectId) ?? 0) + 1);
      watcher.closeProject(projectId);
    },
    async closeAll() {
      allEpoch++;
      watcher.closeAll();
    },
    async dispose() {
      disposed = true;
      watcher.dispose();
    }
  };
  return service2;
}

// tasks/archive/T20261009-context-tools/evidence/W18-utility-probe.ts
var base = import_node_fs3.realpathSync.native((0, import_node_fs3.mkdtempSync)((0, import_node_path3.join)((0, import_node_os.tmpdir)(), "w18-utility-")));
var root = (0, import_node_path3.join)(base, "project");
(0, import_node_fs3.mkdirSync)(root);
(0, import_node_fs3.writeFileSync)((0, import_node_path3.join)(root, "mode-zero"), "fixture\n", { mode: 0 });
(0, import_node_fs3.mkdirSync)((0, import_node_path3.join)(root, "directory"));
(0, import_node_fs3.symlinkSync)("missing-target", (0, import_node_path3.join)(root, "dangling"));
import_electron.app.setPath("userData", (0, import_node_path3.join)(base, "user-data"));
import_electron.app.setActivationPolicy("prohibited");
var assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
var records = [];
var mode = "normal";
var stop = false;
var latestPid;
var closing;
var service;
var originalFork = import_electron.utilityProcess.fork.bind(import_electron.utilityProcess);
import_electron.utilityProcess.fork = ((...args) => {
  const child = originalFork(...args);
  child.once("spawn", () => {
    latestPid = child.pid;
    if (mode === "normal") return;
    process.kill(child.pid, "SIGSTOP");
    if (mode === "cancel") setTimeout(() => {
      stop = true;
    }, 10);
    if (mode === "close") setTimeout(() => {
      closing = service.closeProject("p").then(() => {
        records.push({ case: "closeProject immediate return", childStillAlive: alive(child.pid) });
      });
    }, 10);
  });
  return child;
});
import_electron.app.whenReady().then(async () => {
  import_electron.app.dock?.hide();
  try {
    const expected = (0, import_node_fs3.statSync)(root, { bigint: true });
    const listed = await readAnchoredDirectory(root, expected, { path: "" });
    assert(typeof listed === "object" && listed.ok, "real utility worker did not list");
    if (typeof listed === "object" && listed.ok) {
      assert(listed.entries.some((entry) => entry.name === "mode-zero" && entry.kind === "file"), "unreadable file row lost");
      assert(listed.entries.some((entry) => entry.name === "dangling" && entry.kind === "symlink" && entry.linkTarget === "missing-target"), "raw symlink target lost");
    }
    assert(latestPid !== void 0 && !alive(latestPid), "successful utility worker survived its result");
    records.push({ case: "normal", result: listed, childGone: true });
    const mismatch = await readAnchoredDirectory(root, { dev: expected.dev, ino: expected.ino + 1n }, { path: "" });
    assert(mismatch === "changed", "wrong cwd identity did not fail closed");
    records.push({ case: "identity mismatch", result: mismatch, childGone: !alive(latestPid) });
    mode = "cancel";
    stop = false;
    let began = Date.now();
    const cancelled = await readAnchoredDirectory(root, expected, { path: "", shouldStop: () => stop });
    assert(typeof cancelled === "object" && !cancelled.ok && cancelled.reason === "timeout", "cancel did not return unavailable");
    assert(!alive(latestPid), "cancel left a SIGSTOP worker alive");
    records.push({ case: "cancel stopped worker", elapsedMs: Date.now() - began, result: cancelled, childGone: true });
    mode = "timeout";
    began = Date.now();
    const timeout = await readAnchoredDirectory(root, expected, { path: "" });
    assert(typeof timeout === "object" && !timeout.ok && timeout.reason === "timeout", "fixed deadline did not return timeout");
    assert(!alive(latestPid), "deadline left a SIGSTOP worker alive");
    records.push({ case: "5 second deadline", elapsedMs: Date.now() - began, result: timeout, childGone: true });
    mode = "close";
    service = createFilesService({ projectRoot: (id) => id === "p" ? root : null, changed: () => {
    }, watchChanged: () => {
    } });
    began = Date.now();
    const closed = await service.list("p", "");
    await closing;
    assert(closed.status === "unavailable" && closed.reason === "project_closing", "project close delivered a late listing");
    assert(!alive(latestPid), "project close left a SIGSTOP worker alive after request settled");
    records.push({ case: "project close", elapsedMs: Date.now() - began, result: closed, childGoneAfterRequest: true });
    await service.dispose();
    console.log(JSON.stringify({ code: 0, records }, null, 2));
    import_electron.app.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ code: 1, records, error: String(error) }, null, 2));
    if (latestPid && alive(latestPid)) process.kill(latestPid, "SIGKILL");
    import_electron.app.exit(1);
  } finally {
    (0, import_node_fs3.rmSync)(base, { recursive: true, force: true });
  }
});
