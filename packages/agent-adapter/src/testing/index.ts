export { createLinkedTransports, ScriptedJsonRpcServer, ScriptedRpcError } from './fake-transport.js';
export type { ReceivedMessage, ScriptedHandler } from './fake-transport.js';
export { FakeRuntime, fakeProcess } from './fake-runtime.js';
export type { FakeRuntimeOptions } from './fake-runtime.js';
export { EventRecorder } from './event-recorder.js';
export { FakeProvider, ScriptedDriver } from './scripted-driver.js';
export type { DriverCall, FakeSessionRecord, ScriptedDriverBehavior } from './scripted-driver.js';
export { createScratchProject, hostEnvironmentForTests, realCliEnabled } from './real-cli.js';
