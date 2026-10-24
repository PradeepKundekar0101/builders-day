"""Create a clean source ZIP and contribution patch from a committed checkout."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
base = "39501f2ba9e3794cc703662f71affc28db650b2a"
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / "provn-cost-delivery"
out.mkdir(parents=True, exist_ok=True)

def git(*args):
    return subprocess.check_output(["git", *args], cwd=root)

if git("status", "--porcelain").strip():
    raise SystemExit("Commit or resolve working-tree changes before packaging.")
commit = git("rev-parse", "HEAD").decode().strip()
archive = out / "provn-cost-modules-v0.1.1.zip"
subprocess.run(["git", "archive", "--format=zip", "--prefix=provn-cost-modules/", "-o", str(archive), "HEAD"], cwd=root, check=True)
patch = out / "provn-cost-modules-v0.1.1.patch"
patch.write_bytes(git("diff", "--binary", base, "HEAD"))
manifest = {"version": "0.1.1", "baseCommit": base, "commit": commit,
            "files": {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in [archive, patch]}}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
