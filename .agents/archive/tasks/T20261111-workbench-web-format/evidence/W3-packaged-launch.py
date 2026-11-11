import datetime
import json
import pathlib
import subprocess
import time

evidence = pathlib.Path("tasks/T20261111-workbench-web-format/evidence")
development = json.loads((evidence / "W3-launch.json").read_text())
user_data = pathlib.Path(development["userData"])
port_file = user_data / "DevToolsActivePort"
port_file.unlink(missing_ok=True)
application = pathlib.Path("apps/desktop/dist/mac-arm64/AI Developer Studio.app").resolve()
subprocess.run(["open", "-n", str(application), "--args", "--remote-debugging-port=0", "--studio-user-data-dir=" + str(user_data)], check=True)
port = None
for attempt in range(200):
    if port_file.exists():
        port = int(port_file.read_text().splitlines()[0])
        break
    time.sleep(0.05)
if not port:
    raise SystemExit("Packaged private CDP port not published")
listeners = subprocess.check_output(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-Fp"], text=True)
pids = [int(line[1:]) for line in listeners.splitlines() if line.startswith("p")]
if len(pids) != 1:
    raise SystemExit("Unexpected packaged listener count")
executable = subprocess.check_output(["ps", "-p", str(pids[0]), "-o", "comm="], text=True).strip()
if str(application) not in executable:
    raise SystemExit("Packaged listener executable mismatch")
result = {"at": datetime.datetime.now().isoformat(), "application": str(application), "port": port, "pid": pids[0], "listenerExecutable": executable, "userData": str(user_data), "setup": "LaunchServices open -n; OS-assigned private CDP port; restore own QA Project; no runtime or picker injection", "asarExists": (application / "Contents/Resources/app.asar").exists()}
(evidence / "W3-packaged-launch.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result))
